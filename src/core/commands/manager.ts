/**
 * Command management system with dynamic registration, validation, and execution
 * Handles command parsing, permission checking, alias management, and cooldown enforcement
 * Supports real-time configuration updates and persistent command state
 */

import Config from "@/core/config";
import { logInfo, logDebug, logError, logWarn } from "@/core/logging";

/**
 * Command execution context containing user info and message data
 */
export interface CommandContext {
    username: string;
    message: string;
    badges: string[];
    raw?: any;
    /** Explicit origin; replies must never be routed by guessing from raw data. */
    platform: "twitch" | "kick";
}

/**
 * Command definition interface with metadata and handler function
 */
export interface Command {
    name: string;
    description: string;
    usage: string;
    enabled: boolean;
    modOnly?: boolean;
    aliases?: string[];
    handler: (
        ctx: CommandContext,
        args: string[],
        commandManager?: CommandManager
    ) => Promise<void>;
}

interface SavedCommandConfig {
    enabled?: boolean;
    aliases?: string[];
}

/**
 * Persistent command config can be corrupted by hand-editing. Accept only
 * well-typed values so registration never throws or registers junk aliases.
 */
function loadSavedCommandConfig(
    commandsConfig: unknown,
    commandName: string
): SavedCommandConfig {
    if (
        !commandsConfig ||
        typeof commandsConfig !== "object" ||
        Array.isArray(commandsConfig)
    ) {
        return {};
    }
    const entry = (commandsConfig as Record<string, unknown>)[commandName];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return {};
    }
    const record = entry as Record<string, unknown>;
    const result: SavedCommandConfig = {};
    if (typeof record.enabled === "boolean") {
        result.enabled = record.enabled;
    }
    if (Array.isArray(record.aliases)) {
        result.aliases = record.aliases
            .filter((alias): alias is string => typeof alias === "string")
            .map((alias) => alias.trim())
            .filter((alias) => alias.length > 0);
    }
    return result;
}

/**
 * Centralized command manager for chat bot functionality
 * Features:
 * - Dynamic command registration with validation
 * - Alias management with conflict detection
 * - Permission system (moderator-only commands)
 * - Global and per-user cooldown management
 * - Persistent configuration storage
 * - Real-time updates from settings UI
 */
export class CommandManager {
    private commands: Map<string, Command> = new Map();
    private aliasMap: Map<string, string> = new Map(); // alias -> commandName

    // Cooldown tracking - prevents command spam
    private globalCooldownEnd = 0;
    private userCooldowns: Map<string, number> = new Map(); // username -> cooldown end time

    // Performance tracking
    private performanceStats: Map<
        string,
        {
            totalExecutions: number;
            totalTime: number;
            averageTime: number;
            lastExecuted: number;
            fastestTime: number;
            slowestTime: number;
        }
    > = new Map();

    /**
     * Register a new command with comprehensive validation
     * Performs conflict detection, alias validation, and loads persistent settings
     *
     * @param command - Command object with handler, metadata, and configuration
     * @returns Success status of registration
     */
    register(command: Command) {
        // Validate command structure
        const validationError = this.validateCommand(command);
        if (validationError) {
            logError(
                `Failed to register command ${command.name}: ${validationError}`,
                "CommandManager"
            );
            return false;
        }

        // Check for duplicate command names
        if (this.commands.has(command.name)) {
            logWarn(
                `Command ${command.name} already exists, overwriting`,
                "CommandManager"
            );
        }

        // Check for duplicate aliases across all commands to prevent conflicts
        if (command.aliases) {
            for (const alias of command.aliases) {
                if (this.aliasMap.has(alias)) {
                    const existingCommand = this.aliasMap.get(alias);
                    logWarn(
                        `Alias '${alias}' already exists for command '${existingCommand}', cannot use for '${command.name}'`,
                        "CommandManager"
                    );
                    return false;
                }
            }
        }

        // Load enabled state and aliases from persistent configuration
        // This allows commands to retain their customized state across app restarts
        const savedConfig = loadSavedCommandConfig(
            Config.get("commands"),
            command.name
        );
        const enabled =
            savedConfig.enabled !== undefined
                ? savedConfig.enabled
                : command.enabled;
        const savedAliases = savedConfig.aliases ?? command.aliases ?? [];

        // Update command with saved state
        command.enabled = enabled;
        command.aliases = savedAliases;

        // Register command and its aliases in lookup maps
        this.commands.set(command.name, command);
        if (command.aliases) {
            for (const alias of command.aliases) {
                this.aliasMap.set(alias, command.name);
            }
        }

        logDebug(
            `Registered command: ${
                command.name
            } (enabled: ${enabled}, aliases: ${savedAliases.join(", ")})`,
            "CommandManager"
        );
        return true;
    }

    /**
     * Comprehensive command validation
     * Ensures commands meet structure, naming, and conflict requirements
     *
     * @param command - Command to validate
     * @returns Validation error message or null if valid
     */
    private validateCommand(command: Command): string | null {
        // Basic structure validation
        if (!command.name || command.name.trim() === "") {
            return "Command name cannot be empty";
        }

        if (command.name.length > 50) {
            return "Command name too long (max 50 characters)";
        }

        // Alphanumeric restriction prevents parsing conflicts
        if (!/^[a-zA-Z0-9_-]+$/.test(command.name)) {
            return "Command name can only contain letters, numbers, hyphens, and underscores";
        }

        if (!command.description || command.description.trim() === "") {
            return "Command description cannot be empty";
        }

        if (command.description.length > 200) {
            return "Command description too long (max 200 characters)";
        }

        if (!command.usage || command.usage.trim() === "") {
            return "Command usage cannot be empty";
        }

        if (command.usage.length > 100) {
            return "Command usage too long (max 100 characters)";
        }

        if (typeof command.enabled !== "boolean") {
            return "Command enabled status must be a boolean";
        }

        if (typeof command.handler !== "function") {
            return "Command handler must be a function";
        }

        // Validate aliases for conflicts and format
        if (command.aliases) {
            if (!Array.isArray(command.aliases)) {
                return "Command aliases must be an array";
            }

            if (command.aliases.length > 10) {
                return "Too many aliases (max 10)";
            }

            const seenAliases = new Set<string>();
            for (const alias of command.aliases) {
                if (!alias || alias.trim() === "") {
                    return "Alias cannot be empty";
                }

                if (alias.length > 20) {
                    return "Alias too long (max 20 characters)";
                }

                if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
                    return "Alias can only contain letters, numbers, hyphens, and underscores";
                }

                if (alias === command.name) {
                    return "Alias cannot be the same as the command name";
                }

                if (seenAliases.has(alias)) {
                    return `Duplicate alias: ${alias}`;
                }
                seenAliases.add(alias);

                // Check if this alias conflicts with any existing command or alias
                if (this.commands.has(alias)) {
                    return `Alias '${alias}' conflicts with existing command '${alias}'`;
                }

                const existingCommandForAlias = this.aliasMap.get(alias);
                if (
                    existingCommandForAlias &&
                    existingCommandForAlias !== command.name
                ) {
                    return `Alias '${alias}' is already used by command '${existingCommandForAlias}'`;
                }
            }
        }

        return null;
    }

    /**
     * Main command execution handler with full permission and cooldown checking
     * Parses incoming messages, validates permissions, enforces cooldowns, and executes commands
     *
     * @param ctx - Command context containing user info, message, and chat metadata
     */
    async handle(ctx: CommandContext) {
        const message = ctx.message.trim();
        const prefix = Config.get("prefix") || "!";

        // Only process messages that start with the command prefix
        if (!message.startsWith(prefix)) return;

        // Parse command and arguments from message
        const parts = message.slice(prefix.length).split(/\s+/);
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Resolve command name (could be an alias)
        const command = this.get(commandName);
        if (!command) {
            logDebug(`Unknown command: ${commandName}`, "CommandManager");
            return;
        }

        // Check if command is enabled
        if (!command.enabled) {
            logDebug(`Command ${commandName} is disabled`, "CommandManager");
            return;
        }

        // Permission checking - moderator-only commands
        if (command.modOnly && !isModerator(ctx.badges, ctx.username)) {
            logDebug(
                `User ${ctx.username} attempted to use mod-only command: ${commandName}`,
                "CommandManager"
            );
            return;
        }

        try {
            // Start performance tracking
            const startTime = performance.now();

            await command.handler(ctx, args, this);

            // End performance tracking
            const endTime = performance.now();
            const executionTime = endTime - startTime;

            // Update performance statistics
            this.updatePerformanceStats(commandName, executionTime);

            logDebug(
                `Executed command: ${commandName} (${executionTime.toFixed(2)}ms)`,
                "CommandManager"
            );
        } catch (error) {
            logError(error, `CommandManager:${commandName}`);
        }
    }

    /**
     * Dynamic alias update system for real-time configuration changes
     * Validates new aliases for conflicts and updates both command and lookup maps
     *
     * @param commandName - Name of command to update
     * @param newAliases - Array of new aliases to assign
     * @returns Success status of the update operation
     */
    updateCommandAliases(commandName: string, newAliases: string[]): boolean {
        const command = this.commands.get(commandName);
        if (!command) {
            logWarn(
                `Attempted to update aliases for non-existent command: ${commandName}`
            );
            return false;
        }

        // Comprehensive validation of new aliases
        if (!Array.isArray(newAliases)) {
            logError(
                "New aliases must be an array",
                "commandManager:updateAliases"
            );
            return false;
        }

        if (newAliases.length > 10) {
            logError(
                "Too many aliases (max 10)",
                "commandManager:updateAliases"
            );
            return false;
        }

        // Check for duplicates and conflicts within the new aliases
        const seenAliases = new Set<string>();
        for (const alias of newAliases) {
            if (!alias || alias.trim() === "") {
                logError(
                    "Alias cannot be empty",
                    "commandManager:updateAliases"
                );
                return false;
            }

            if (alias.length > 20) {
                logError(
                    "Alias too long (max 20 characters)",
                    "commandManager:updateAliases"
                );
                return false;
            }

            if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
                logError(
                    "Alias can only contain letters, numbers, hyphens, and underscores",
                    "commandManager:updateAliases"
                );
                return false;
            }

            if (alias === commandName) {
                logError(
                    "Alias cannot be the same as the command name",
                    "commandManager:updateAliases"
                );
                return false;
            }

            if (seenAliases.has(alias)) {
                logError(
                    `Duplicate alias: ${alias}`,
                    "commandManager:updateAliases"
                );
                return false;
            }
            seenAliases.add(alias);

            // Check if this alias conflicts with any existing command
            if (this.commands.has(alias)) {
                logError(
                    `Alias '${alias}' conflicts with existing command '${alias}'`,
                    "commandManager:updateAliases"
                );
                return false;
            }

            // Check if this alias is already used by another command
            const existingCommandForAlias = this.aliasMap.get(alias);
            if (
                existingCommandForAlias &&
                existingCommandForAlias !== commandName
            ) {
                logWarn(
                    `Alias '${alias}' is already used by command '${existingCommandForAlias}'`,
                    "commandManager:updateAliases"
                );
                return false;
            }
        }

        // Remove old aliases from alias map to prevent stale references
        if (command.aliases) {
            for (const oldAlias of command.aliases) {
                this.aliasMap.delete(oldAlias);
            }
        }

        // Update command aliases and rebuild alias map
        command.aliases = newAliases;

        // Add new aliases to alias map
        for (const alias of newAliases) {
            this.aliasMap.set(alias, commandName);
        }

        logInfo(
            `Updated aliases for command '${commandName}': ${newAliases.join(
                ", "
            )}`,
            "commandManager:updateAliases"
        );
        return true;
    }

    /**
     * Reload command aliases from persistent configuration
     * Updates command aliases in memory to match saved configuration
     */
    reloadCommandAliasesFromConfig(): void {
        const commandsConfig = Config.get("commands");

        for (const [commandName, command] of this.commands.entries()) {
            const savedConfig = loadSavedCommandConfig(
                commandsConfig,
                commandName
            );
            const savedAliases = savedConfig.aliases;
            if (savedAliases === undefined) continue;

            // Only update if aliases have actually changed (compare copies so
            // the live command state and config arrays are not mutated).
            if (
                JSON.stringify([...(command.aliases ?? [])].sort()) !==
                JSON.stringify([...savedAliases].sort())
            ) {
                logDebug(
                    `Reloading aliases for command '${commandName}' from config: ${savedAliases.join(
                        ", "
                    )}`,
                    "CommandManager"
                );
                this.updateCommandAliases(commandName, savedAliases);
            }
        }
    }

    /**
     * Get all commands for serialization (for IPC communication)
     * Returns command data without the handler functions
     */
    getAllSerializable() {
        return Array.from(this.commands.values()).map((cmd) => ({
            name: cmd.name,
            description: cmd.description,
            usage: cmd.usage,
            enabled: cmd.enabled,
            modOnly: cmd.modOnly,
            aliases: cmd.aliases || [],
        }));
    }

    /**
     * Get all command objects including handlers
     */
    getAll() {
        return Array.from(this.commands.values());
    }

    /**
     * Get a command by name or alias
     * Resolves aliases to their primary command
     */
    get(name: string) {
        return (
            this.commands.get(name) ||
            this.commands.get(this.aliasMap.get(name) || "")
        );
    }

    /**
     * Enable or disable a command
     */
    setEnabled(name: string, enabled: boolean) {
        const command = this.commands.get(name);
        if (command) {
            command.enabled = enabled;
            logDebug(
                `Command ${name} ${enabled ? "enabled" : "disabled"}`,
                "CommandManager"
            );
        }
    }

    // Cooldown management methods
    public checkGlobalCooldown(): boolean {
        const globalCooldownEnabled = Config.get("globalCooldownEnabled");
        if (!globalCooldownEnabled) return false;

        const now = Date.now();
        if (now < this.globalCooldownEnd) {
            return true; // Still in cooldown
        }
        return false; // Not in cooldown
    }

    public checkUserCooldown(username: string): boolean {
        const perUserCooldownEnabled = Config.get("perUserCooldownEnabled");
        if (!perUserCooldownEnabled) return false;

        const now = Date.now();
        const userCooldownEnd = this.userCooldowns.get(username.toLowerCase());

        if (userCooldownEnd && now < userCooldownEnd) {
            return true; // Still in cooldown
        }
        return false; // Not in cooldown
    }

    public setGlobalCooldown(): void {
        const globalCooldownEnabled = Config.get("globalCooldownEnabled");
        if (!globalCooldownEnabled) return;

        const cooldownSeconds = parseInt(
            Config.get("globalCooldownSeconds") || "30"
        );
        this.globalCooldownEnd = Date.now() + cooldownSeconds * 1000;
        logDebug(
            `Global cooldown set for ${cooldownSeconds} seconds`,
            "CommandManager"
        );
    }

    public setUserCooldown(username: string): void {
        const perUserCooldownEnabled = Config.get("perUserCooldownEnabled");
        if (!perUserCooldownEnabled) return;

        const cooldownSeconds = parseInt(
            Config.get("perUserCooldownSeconds") || "60"
        );
        this.userCooldowns.set(
            username.toLowerCase(),
            Date.now() + cooldownSeconds * 1000
        );
        logDebug(
            `User cooldown set for ${username} for ${cooldownSeconds} seconds`,
            "CommandManager"
        );
    }

    public getRemainingCooldownTime(endTime: number): number {
        const remaining = Math.ceil((endTime - Date.now()) / 1000);
        return Math.max(0, remaining);
    }

    public getUserCooldownEnd(username: string): number | undefined {
        return this.userCooldowns.get(username.toLowerCase());
    }

    public getGlobalCooldownEnd(): number {
        return this.globalCooldownEnd;
    }

    /**
     * Update performance statistics for a command
     * Tracks execution time, averages, and min/max times
     */
    private updatePerformanceStats(
        commandName: string,
        executionTime: number
    ): void {
        const stats = this.performanceStats.get(commandName) || {
            totalExecutions: 0,
            totalTime: 0,
            averageTime: 0,
            lastExecuted: Date.now(),
            fastestTime: Infinity,
            slowestTime: 0,
        };

        stats.totalExecutions++;
        stats.totalTime += executionTime;
        stats.averageTime = stats.totalTime / stats.totalExecutions;
        stats.lastExecuted = Date.now();
        stats.fastestTime = Math.min(stats.fastestTime, executionTime);
        stats.slowestTime = Math.max(stats.slowestTime, executionTime);

        this.performanceStats.set(commandName, stats);
    }

    /**
     * Get performance statistics for all commands
     * Returns data suitable for display in debug/performance UI
     */
    public getPerformanceStats() {
        const stats: Array<{
            commandName: string;
            totalExecutions: number;
            averageTime: number;
            fastestTime: number;
            slowestTime: number;
            lastExecuted: number;
        }> = [];

        for (const [commandName, stat] of this.performanceStats.entries()) {
            stats.push({
                commandName,
                totalExecutions: stat.totalExecutions,
                averageTime: parseFloat(stat.averageTime.toFixed(2)),
                fastestTime: parseFloat(stat.fastestTime.toFixed(2)),
                slowestTime: parseFloat(stat.slowestTime.toFixed(2)),
                lastExecuted: stat.lastExecuted,
            });
        }

        return stats.sort((a, b) => b.totalExecutions - a.totalExecutions);
    }

    /**
     * Get performance statistics for a specific command
     */
    public getCommandPerformanceStats(commandName: string) {
        const stats = this.performanceStats.get(commandName);
        if (!stats) return null;

        return {
            commandName,
            totalExecutions: stats.totalExecutions,
            averageTime: parseFloat(stats.averageTime.toFixed(2)),
            fastestTime: parseFloat(stats.fastestTime.toFixed(2)),
            slowestTime: parseFloat(stats.slowestTime.toFixed(2)),
            lastExecuted: stats.lastExecuted,
        };
    }

    /**
     * Reset performance statistics for all commands
     */
    public resetPerformanceStats(): void {
        this.performanceStats.clear();
        logInfo("Performance statistics reset", "CommandManager");
    }

    /**
     * Reset performance statistics for a specific command
     */
    public resetCommandPerformanceStats(commandName: string): void {
        this.performanceStats.delete(commandName);
        logInfo(
            `Performance statistics reset for command: ${commandName}`,
            "CommandManager"
        );
    }
}

/**
 * Permission checking utility for moderator-only commands
 * Checks both platform-provided badges and custom moderator lists
 *
 * @param badges - Array of platform badges (broadcaster, moderator, etc.)
 * @param username - Username to check for custom moderator status
 * @returns True if user has moderation privileges
 */
export function isModerator(badges: string[], username: string) {
    // Check if user has moderator badges from the platform
    if (Array.isArray(badges) && (badges.includes("broadcaster") || badges.includes("moderator"))) {
        return true;
    }

    // Check if user is in custom moderators list (case-insensitive).
    // Config can be corrupted by hand-editing; never throw on malformed values.
    const configuredModerators = Config.get("customModerators");
    const customModerators = Array.isArray(configuredModerators) ? configuredModerators : [];
    const normalizedUsername = username.trim().toLowerCase();
    return normalizedUsername.length > 0 && customModerators.some(
        (moderator) => typeof moderator === "string" &&
            moderator.trim().toLowerCase() === normalizedUsername
    );
}
