// Studio titlebar: brand/Home, Settings, theme picker and window controls.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import MelodifyMark from "./MelodifyMark";
import { STUDIO_THEMES } from "@/ui/theme";
import type { StudioThemeName } from "@/ui/components/studio";
import "./titlebarStudio.css";

interface TitlebarProps {
    onMinimize: () => void;
    onMaximize?: () => void;
    onClose: () => void;
    onSettings: () => void;
    onHome?: () => void;
    onThemeChange?: (theme: StudioThemeName) => void;
    theme?: StudioThemeName;
    maximized?: boolean;
    showSettings?: boolean;
}

const noop = (): void => undefined;

export default function Titlebar({
    onMinimize,
    onMaximize = noop,
    onClose,
    onSettings,
    onHome,
    onThemeChange = noop,
    theme = "graphite",
    maximized = false,
    showSettings = true,
}: TitlebarProps) {
    const { t } = useTranslation();
    const [themeOpen, setThemeOpen] = useState(false);
    const themeWrapRef = useRef<HTMLDivElement>(null);
    const themeButtonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!themeOpen) return;
        const selected = popoverRef.current?.querySelector<HTMLElement>(
            '.studio-theme-option[aria-pressed="true"]'
        );
        const first = popoverRef.current?.querySelector<HTMLElement>(
            ".studio-theme-option"
        );
        (selected || first)?.focus();

        const onPointerDown = (event: MouseEvent) => {
            if (
                themeWrapRef.current &&
                !themeWrapRef.current.contains(event.target as Node)
            ) {
                setThemeOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setThemeOpen(false);
                themeButtonRef.current?.focus();
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [themeOpen]);

    const chooseTheme = (next: StudioThemeName) => {
        onThemeChange(next);
        setThemeOpen(false);
        themeButtonRef.current?.focus();
    };

    return (
        <header className="studio-titlebar">
            <button
                type="button"
                className="studio-titlebar-brand"
                data-titlebar-brand
                onClick={onHome}
                aria-label={t("navigation.homePage")}
                title={t("navigation.homePage")}
            >
                <span className="studio-titlebar-mark" aria-hidden="true">
                    <MelodifyMark />
                </span>
                <span className="studio-titlebar-name">{t("app.name")}</span>
                <span className="studio-titlebar-sep" aria-hidden="true" />
            </button>

            <div className="studio-titlebar-controls">
                {showSettings && (
                    <button
                        type="button"
                        className="studio-window-btn"
                        onClick={onSettings}
                        aria-label={t("settings.title")}
                        title={t("settings.title")}
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="15"
                            height="15"
                            aria-hidden="true"
                        >
                            <path
                                d="M3 5h10M3 11h10"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                            />
                            <circle cx="6" cy="5" r="1.6" fill="currentColor" />
                            <circle cx="10" cy="11" r="1.6" fill="currentColor" />
                        </svg>
                    </button>
                )}

                <div ref={themeWrapRef} className="studio-titlebar-theme-control">
                    <button
                        ref={themeButtonRef}
                        type="button"
                        className="studio-window-btn theme-btn"
                        onClick={() => setThemeOpen((open) => !open)}
                        aria-label={t("titlebar.chooseTheme")}
                        title={t("titlebar.chooseTheme")}
                        aria-haspopup="dialog"
                        aria-expanded={themeOpen}
                        aria-controls="studio-theme-popover"
                    >
                        <svg
                            viewBox="0 0 14 14"
                            width="14"
                            height="14"
                            aria-hidden="true"
                        >
                            <path d="M7 2a5 5 0 0 1 0 10Z" fill="currentColor" />
                            <circle
                                cx="7"
                                cy="7"
                                r="5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.1"
                            />
                        </svg>
                    </button>

                    <div
                        ref={popoverRef}
                        id="studio-theme-popover"
                        className="studio-theme-popover"
                        role="dialog"
                        aria-modal="false"
                        aria-labelledby="studio-theme-popover-title"
                        hidden={!themeOpen}
                    >
                        <p
                            className="studio-theme-popover-title"
                            id="studio-theme-popover-title"
                        >
                            {t("titlebar.theme")}
                        </p>
                        <div
                            className="studio-theme-list"
                            role="group"
                            aria-label={t("titlebar.themes")}
                        >
                            {STUDIO_THEMES.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className="studio-theme-option"
                                    aria-pressed={theme === option.id}
                                    onClick={() => chooseTheme(option.id)}
                                >
                                    <span
                                        className="studio-theme-swatch"
                                        aria-hidden="true"
                                        style={
                                            {
                                                "--sw-canvas":
                                                    option.swatch.canvas,
                                                "--sw-panel":
                                                    option.swatch.panel,
                                                "--sw-titlebar":
                                                    option.swatch.titlebar,
                                                "--sw-rim": option.swatch.rim,
                                                "--sw-lift": option.swatch.lift,
                                            } as CSSProperties
                                        }
                                    />
                                    <span>{option.label}</span>
                                    <span
                                        className="studio-theme-check"
                                        aria-hidden="true"
                                    >
                                        ✓
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p className="studio-theme-note">
                            {t("titlebar.themeNote")}
                        </p>
                    </div>
                </div>

                <div
                    className="studio-titlebar-actions"
                    role="group"
                    aria-label={t("titlebar.windowControls")}
                >
                    <button
                        type="button"
                        className="studio-window-btn"
                        onClick={onMinimize}
                        aria-label={t("titlebar.minimize")}
                        title={t("titlebar.minimize")}
                    >
                        <svg
                            viewBox="0 0 12 12"
                            width="12"
                            height="12"
                            aria-hidden="true"
                        >
                            <path
                                d="M2.5 6h7"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="studio-window-btn"
                        onClick={onMaximize}
                        aria-label={
                            maximized
                                ? t("titlebar.restore")
                                : t("titlebar.maximize")
                        }
                        title={
                            maximized
                                ? t("titlebar.restore")
                                : t("titlebar.maximize")
                        }
                    >
                        {maximized ? (
                            <svg
                                viewBox="0 0 12 12"
                                width="12"
                                height="12"
                                aria-hidden="true"
                            >
                                <rect
                                    x="2.2"
                                    y="4"
                                    width="5.8"
                                    height="5.8"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.1"
                                />
                                <path
                                    d="M4.2 4V2.2h5.6v5.6H8.2"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.1"
                                />
                            </svg>
                        ) : (
                            <svg
                                viewBox="0 0 12 12"
                                width="12"
                                height="12"
                                aria-hidden="true"
                            >
                                <rect
                                    x="2.5"
                                    y="2.5"
                                    width="7"
                                    height="7"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.1"
                                />
                            </svg>
                        )}
                    </button>
                    <button
                        type="button"
                        className="studio-window-btn close"
                        onClick={onClose}
                        aria-label={t("titlebar.close")}
                        title={t("titlebar.close")}
                    >
                        <svg
                            viewBox="0 0 12 12"
                            width="12"
                            height="12"
                            aria-hidden="true"
                        >
                            <path
                                d="M2.7 2.7l6.6 6.6M9.3 2.7L2.7 9.3"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    );
}
