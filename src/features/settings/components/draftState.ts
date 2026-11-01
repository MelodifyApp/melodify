/* Pure draft/baseline rules for the Studio Settings shell. */
export const API_CLIENT_ID_KEYS = [
    "spotifyClientId",
    "kickClientId",
    "twitchClientId",
] as const;

export type ConfigRecord = Record<string, unknown>;

/** Mirrored in drafts but owned by a dedicated main-process action. */
const LOCAL_ONLY_DRAFT_KEYS = new Set(["currentSongFilePath"]);

export interface SettingsDraftState {
    baselineConfig: ConfigRecord;
    draftConfig: ConfigRecord;
    baselineCommands: ConfigRecord[];
    draftCommands: ConfigRecord[];
}

function clone<T>(value: T): T {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainObject(value: unknown): value is ConfigRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function commandsWithEnabledState(
    configCommands: unknown,
    draftCommands: ConfigRecord[]
): ConfigRecord {
    const commands: ConfigRecord = isPlainObject(configCommands)
        ? clone(configCommands)
        : {};
    for (const command of draftCommands) {
        const name = String(command.name || "");
        if (!name) continue;
        const existing = isPlainObject(commands[name])
            ? (commands[name] as ConfigRecord)
            : {};
        commands[name] = {
            ...existing,
            enabled: command.enabled !== false,
        };
    }
    return commands;
}

function withoutApiIds(config: ConfigRecord): ConfigRecord {
    const next = clone(config);
    for (const key of API_CLIENT_ID_KEYS) delete next[key];
    return next;
}

export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const record = value as ConfigRecord;
    return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
        .join(",")}}`;
}

export function createDraftState(
    config: ConfigRecord = {},
    commands: ConfigRecord[] = []
): SettingsDraftState {
    const ordinary = withoutApiIds(config);
    return {
        baselineConfig: clone(ordinary),
        draftConfig: clone(ordinary),
        baselineCommands: clone(commands),
        draftCommands: clone(commands),
    };
}

export function configIsDirty(state: SettingsDraftState): boolean {
    return stableStringify(state.draftConfig) !== stableStringify(state.baselineConfig);
}

export function commandsAreDirty(state: SettingsDraftState): boolean {
    return stableStringify(state.draftCommands) !== stableStringify(state.baselineCommands);
}

export function settingsAreDirty(state: SettingsDraftState): boolean {
    return configIsDirty(state) || commandsAreDirty(state);
}

export function editDraftConfig(
    state: SettingsDraftState,
    key: string,
    value: unknown
): SettingsDraftState {
    return { ...state, draftConfig: { ...state.draftConfig, [key]: value } };
}

/**
 * Song-file selection is performed and persisted by the main process. Mirror
 * that acknowledged path into the baseline too, so Discard cannot display a
 * stale path that is no longer the active write target.
 */
export function acknowledgeSongFilePath(
    state: SettingsDraftState,
    filePath: string
): SettingsDraftState {
    return {
        ...state,
        baselineConfig: {
            ...state.baselineConfig,
            currentSongFilePath: filePath,
        },
        draftConfig: {
            ...state.draftConfig,
            currentSongFilePath: filePath,
        },
    };
}

export function editDraftCommands(
    state: SettingsDraftState,
    commands: ConfigRecord[]
): SettingsDraftState {
    const draftCommands = clone(commands);
    return {
        ...state,
        draftCommands,
        draftConfig: {
            ...state.draftConfig,
            commands: commandsWithEnabledState(
                state.draftConfig.commands,
                draftCommands
            ),
        },
    };
}

export function toggleDraftCommand(
    state: SettingsDraftState,
    name: string,
    enabled: boolean
): SettingsDraftState {
    const draftCommands = state.draftCommands.map((command) =>
        command.name === name ? { ...command, enabled } : command
    );
    return {
        ...state,
        draftCommands,
        draftConfig: {
            ...state.draftConfig,
            commands: commandsWithEnabledState(
                state.draftConfig.commands,
                draftCommands
            ),
        },
    };
}

/**
 * Builds the minimal config patch for the acknowledged save path. Only values
 * that differ from the baseline are sent, with command enabled states folded
 * into the same validated command map.
 */
export function buildConfigSavePatch(
    state: SettingsDraftState
): ConfigRecord {
    const keys = new Set([
        ...Object.keys(state.baselineConfig),
        ...Object.keys(state.draftConfig),
    ]);
    const patch: ConfigRecord = {};
    for (const key of keys) {
        if (LOCAL_ONLY_DRAFT_KEYS.has(key)) continue;
        if (
            stableStringify(state.draftConfig[key]) !==
            stableStringify(state.baselineConfig[key])
        ) {
            patch[key] = clone(state.draftConfig[key]);
        }
    }

    const commands = commandsWithEnabledState(
        state.draftConfig.commands,
        state.draftCommands
    );
    if (
        stableStringify(commands) !==
        stableStringify(state.baselineConfig.commands)
    ) {
        patch.commands = commands;
    }
    return patch;
}

export function discardDraft(state: SettingsDraftState): SettingsDraftState {
    return {
        baselineConfig: state.baselineConfig,
        draftConfig: clone(state.baselineConfig),
        baselineCommands: state.baselineCommands,
        draftCommands: clone(state.baselineCommands),
    };
}

export function commitDraft(state: SettingsDraftState): SettingsDraftState {
    return {
        baselineConfig: clone(state.draftConfig),
        draftConfig: clone(state.draftConfig),
        baselineCommands: clone(state.draftCommands),
        draftCommands: clone(state.draftCommands),
    };
}

function hasOwn(record: ConfigRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function sameValue(left: unknown, right: unknown): boolean {
    return stableStringify(left) === stableStringify(right);
}

/**
 * Commits the acknowledged save without replacing edits made while the save
 * was pending. Only keys present in the submitted patch get a new baseline;
 * the current draft value is adopted only when it still matches the submitted
 * value. The command baseline comes from the acknowledged command config, not
 * from a later unsent command draft.
 */
export function commitAcknowledgedDraft(
    state: SettingsDraftState,
    effectiveConfig: ConfigRecord,
    acknowledgedPatch: ConfigRecord
): SettingsDraftState {
    const effective = isPlainObject(effectiveConfig) ? effectiveConfig : {};
    const patch = isPlainObject(acknowledgedPatch) ? acknowledgedPatch : {};
    const baselineConfig = clone(state.baselineConfig);
    const draftConfig = clone(state.draftConfig);
    let baselineCommands = clone(state.baselineCommands);
    let draftCommands = clone(state.draftCommands);

    for (const key of Object.keys(patch)) {
        if (key === "commands" || LOCAL_ONLY_DRAFT_KEYS.has(key)) continue;
        const acknowledgedValue = hasOwn(effective, key)
            ? clone(effective[key])
            : clone(patch[key]);
        baselineConfig[key] = acknowledgedValue;
        if (sameValue(draftConfig[key], patch[key])) {
            draftConfig[key] = clone(acknowledgedValue);
        }
    }

    if (hasOwn(patch, "commands")) {
        const acknowledgedCommands = isPlainObject(effective.commands)
            ? effective.commands
            : patch.commands;
        const commandMap = isPlainObject(acknowledgedCommands)
            ? acknowledgedCommands
            : {};
        baselineConfig.commands = clone(commandMap);

        const lateCommandEdit = !sameValue(
            draftConfig.commands,
            patch.commands
        );
        if (!lateCommandEdit) {
            draftConfig.commands = clone(commandMap);
        }

        const sourceCommands = state.draftCommands.length
            ? state.draftCommands
            : state.baselineCommands;
        const acknowledgedCommandList = sourceCommands.map((command) => {
            const name = String(command.name || "");
            const acknowledged = isPlainObject(commandMap[name])
                ? commandMap[name]
                : null;
            const next = clone(command);
            if (
                acknowledged &&
                typeof acknowledged.enabled === "boolean"
            ) {
                next.enabled = acknowledged.enabled;
            }
            if (acknowledged && Array.isArray(acknowledged.aliases)) {
                next.aliases = clone(acknowledged.aliases);
            }
            return next;
        });
        baselineCommands = clone(acknowledgedCommandList);
        if (!lateCommandEdit) {
            draftCommands = clone(acknowledgedCommandList);
        }
    }

    if (
        !hasOwn(effective, "currentSongFilePath") &&
        !hasOwn(patch, "currentSongFilePath")
    ) {
        baselineConfig.currentSongFilePath =
            state.draftConfig.currentSongFilePath;
        draftConfig.currentSongFilePath =
            state.draftConfig.currentSongFilePath;
    }

    return {
        baselineConfig,
        draftConfig,
        baselineCommands,
        draftCommands,
    };
}

export function changedCommandStates(
    state: SettingsDraftState
): Array<{ name: string; enabled: boolean }> {
    const baseline = new Map(
        state.baselineCommands.map((command) => [
            String(command.name),
            command.enabled !== false,
        ])
    );
    return state.draftCommands
        .filter((command) => command.enabled !== baseline.get(String(command.name)))
        .map((command) => ({
            name: String(command.name),
            enabled: command.enabled !== false,
        }));
}

export function credentialDraftsFromConfig(config: ConfigRecord): ConfigRecord {
    const drafts: ConfigRecord = {};
    for (const key of API_CLIENT_ID_KEYS) {
        drafts[key] = typeof config[key] === "string" ? config[key] : "";
    }
    return drafts;
}

export function credentialDraftPending(
    draft: ConfigRecord,
    baseline: ConfigRecord
): boolean {
    return stableStringify(draft) !== stableStringify(baseline);
}

export function mergeCredentialDrafts(
    config: ConfigRecord,
    credentials: ConfigRecord
): ConfigRecord {
    return { ...config, ...credentials };
}

