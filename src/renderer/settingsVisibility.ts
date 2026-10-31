/**
 * Settings is mounted on first open and only hidden when Home is shown, so
 * drafts, the active section, scroll position and API-key state survive
 * Home <-> Settings navigation for the lifetime of the renderer.
 */
export interface SettingsVisibility {
    mounted: boolean;
    open: boolean;
}

export const INITIAL_SETTINGS_VISIBILITY: SettingsVisibility = Object.freeze({
    mounted: false,
    open: false,
});

export function openSettingsView(state: SettingsVisibility): SettingsVisibility {
    if (state.mounted && state.open) return state;
    return { mounted: true, open: true };
}

export function closeSettingsView(state: SettingsVisibility): SettingsVisibility {
    if (!state.open) return state;
    return { mounted: state.mounted, open: false };
}

export function toggleSettingsView(
    state: SettingsVisibility
): SettingsVisibility {
    return state.open ? closeSettingsView(state) : openSettingsView(state);
}
