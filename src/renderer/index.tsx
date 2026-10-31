// index.tsx
// Entry point for the renderer process React application.

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";
import i18n from "@/core/i18n";
import { initializeUpdateStatusStore } from "@/ui/updateStatusStore";

// Subscribe before React mounts so update events are retained even while the
// Home page or update dialog is not rendered.
void initializeUpdateStatusStore(window.electronAPI);

// Suppress webpack development overlay warnings
if (process.env.NODE_ENV === "development") {
    const originalError = console.error;
    console.error = (...args) => {
        const message = args[0];
        if (
            typeof message === "string" &&
            (message.includes(
                "multiple modules with names that only differ in casing"
            ) ||
                message.includes("case-semantic"))
        ) {
            return; // Suppress these warnings
        }
        originalError.apply(console, args);
    };

    // Also suppress webpack overlay
    (window as any).__webpack_hot_middleware_reporter__ = {
        success: () => {
            /* no-op */
        },
        warnings: () => {
            /* no-op */
        },
        errors: () => {
            /* no-op */
        },
    };
}

/**
 * Initialize the app with proper config and i18n setup
 * This ensures the saved language preference is loaded before React renders
 */
async function initializeApp() {
    try {
        // Load config first to get saved language preference
        const config = await window.electronAPI.invoke("config:get");
        const savedLanguage = config.language || "en";

        // Update i18n to use the saved language
        await i18n.changeLanguage(savedLanguage);

        console.log(`Initialized app with language: ${savedLanguage}`);
    } catch (error) {
        console.warn("Failed to load saved language, using default:", error);
        // Fall back to English if config loading fails
        await i18n.changeLanguage("en");
    }

    // Now render the React app with the correct language
    const root = createRoot(document.body);
    root.render(<App />);
}

// Start the app initialization
initializeApp();
