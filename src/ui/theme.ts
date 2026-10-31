import type { StudioThemeName } from "@/ui/components/studio";

export interface StudioThemeSwatch {
    canvas: string;
    panel: string;
    titlebar: string;
    rim: string;
    lift: string;
}

export interface StudioThemeOption {
    id: StudioThemeName;
    label: string;
    swatch: StudioThemeSwatch;
}

/** Curated Studio themes, in the titlebar picker order. */
export const STUDIO_THEMES: readonly StudioThemeOption[] = Object.freeze([
    {
        id: "graphite",
        label: "Graphite",
        swatch: {
            canvas: "#151719",
            panel: "#25292e",
            titlebar: "#111315",
            rim: "#9a9a9a",
            lift: "0.22",
        },
    },
    {
        id: "midnight",
        label: "Midnight",
        swatch: {
            canvas: "#111823",
            panel: "#202c3c",
            titlebar: "#10161e",
            rim: "#8d9bb5",
            lift: "0.22",
        },
    },
    {
        id: "plum",
        label: "Plum",
        swatch: {
            canvas: "#191620",
            panel: "#2b2437",
            titlebar: "#14111b",
            rim: "#a18cb8",
            lift: "0.22",
        },
    },
    {
        id: "forest",
        label: "Forest",
        swatch: {
            canvas: "#111a17",
            panel: "#20302a",
            titlebar: "#101713",
            rim: "#8fa895",
            lift: "0.22",
        },
    },
    {
        id: "deepsea",
        label: "Deep Sea",
        swatch: {
            canvas: "#101922",
            panel: "#203040",
            titlebar: "#0e161f",
            rim: "#7f9ab1",
            lift: "0.22",
        },
    },
    {
        id: "ember",
        label: "Ember",
        swatch: {
            canvas: "#1c1715",
            panel: "#382a25",
            titlebar: "#191311",
            rim: "#b29a88",
            lift: "0.22",
        },
    },
    {
        id: "light",
        label: "Light",
        swatch: {
            canvas: "#f2f4f7",
            panel: "#ffffff",
            titlebar: "#e8ecf2",
            rim: "#9aa0a8",
            lift: "0",
        },
    },
    {
        id: "dark",
        label: "Dark",
        swatch: {
            canvas: "#000000",
            panel: "#0d0d10",
            titlebar: "#000000",
            rim: "#4f4f4f",
            lift: "0.04",
        },
    },
]);

export const DEFAULT_STUDIO_THEME: StudioThemeName = "graphite";
export const THEME_STORAGE_KEY = "melodify.theme";

export function isStudioThemeName(value: unknown): value is StudioThemeName {
    return STUDIO_THEMES.some((theme) => theme.id === value);
}

export function readStoredTheme(
    storage?: Pick<Storage, "getItem">
): StudioThemeName {
    if (!storage) return DEFAULT_STUDIO_THEME;
    try {
        const stored = storage.getItem(THEME_STORAGE_KEY);
        return isStudioThemeName(stored) ? stored : DEFAULT_STUDIO_THEME;
    } catch {
        return DEFAULT_STUDIO_THEME;
    }
}

export function persistTheme(
    theme: StudioThemeName,
    storage?: Pick<Storage, "setItem">
): void {
    if (!storage) return;
    try {
        storage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // A locked renderer storage must not break theme switching.
    }
}
