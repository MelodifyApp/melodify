/**
 * Renderer Process Logging System
 *
 * Provides unified logging capabilities for Electron renderer processes with
 * dual-destination output: immediate console feedback and persistent main process logging.
 *
 * Architecture:
 * - Console Logging: Immediate visual feedback in DevTools for development
 * - IPC Communication: Forwards logs to main process for file persistence and aggregation
 * - Level-based Organization: Structured logging with appropriate console methods
 * - Context Support: Optional contextual information for better debugging
 *
 * Security Considerations:
 * - Uses Electron's secure IPC communication channel
 * - No sensitive data exposure in console logs
 * - Graceful degradation if IPC communication fails
 *
 * Usage Pattern:
 * - Development: Console logs provide immediate feedback
 * - Production: Main process handles file persistence and log aggregation
 * - Debugging: Context parameter helps identify log sources across components
 */

// rendererLogger.ts
// Logging utilities for the renderer process, providing console-based logging with IPC communication to main process.

/**
 * Log levels for the renderer logger.
 */
import { redactLogText } from "@/core/logging/utils";

type LogLevel = "info" | "debug" | "warn" | "error";

/**
 * Core logging function with dual-destination output
 * Handles both immediate console display and persistent main process logging
 *
 * @param level - The log level (info, debug, warn, error)
 * @param message - The primary message to log
 * @param context - Optional context identifier for log source tracking
 */
function logToMain(level: LogLevel, message: string, context?: string) {
    message = redactLogText(message);
    context = context ? redactLogText(context) : context;
    // Console output with appropriate method selection for proper styling
    const consoleMethod =
        level === "error" ? "error" : level === "warn" ? "warn" : "log";
    console[consoleMethod](
        `[${level.toUpperCase()}] ${context ? `[${context}] ` : ""}${message}`
    );

    // Secure IPC communication to main process for persistent storage
    // Gracefully handles cases where electronAPI is not available
    window.electronAPI?.send?.("log:renderer", { level, message, context });
}

/**
 * Informational logging for general application events
 * Used for user actions, state changes, and normal operation flow
 *
 * @param message - The message to log
 * @param context - Optional context for the log message
 */
export function logInfo(message: string, context?: string) {
    logToMain("info", message, context);
}

/**
 * Debug logging for development and troubleshooting
 * Provides detailed information for developers during debugging sessions
 *
 * @param message - The message to log
 * @param context - Optional context for the log message
 */
export function logDebug(message: string, context?: string) {
    logToMain("debug", message, context);
}

/**
 * Warning logging for recoverable issues and important notices
 *
 * Highlights potential problems that do not interrupt application flow
 *
 * @param message - The message to log
 * @param context - Optional context for the log message
 */
export function logWarn(message: string, context?: string) {
    logToMain("warn", message, context);
}

/**
 * Error logging for critical issues
 *
 * Captures and reports errors, facilitating troubleshooting and issue resolution
 *
 * @param message - The message to log
 * @param context - Optional context for the log message
 */
export function logError(message: string | Error, context?: string) {
    const errorMessage = message instanceof Error ? message.message : message;
    logToMain("error", errorMessage, context);
}
