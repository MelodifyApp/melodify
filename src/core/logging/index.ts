/**
 * Advanced logging system with styled console output, file persistence, and session management
 * Features:
 * - Multi-level logging (info, warn, error, debug) with color coding
 * - Session-based log files with automatic rotation
 * - Real-time log streaming to renderer processes via IPC
 * - Automatic cleanup of old log files (30-day retention)
 * - Specialized song request logging with separate file structure
 * - Secret redaction for security compliance
 */

import { app, BrowserWindow, ipcMain } from "electron";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { redactSecrets, redactLogText } from "./utils";
import { resolveUserDataDirectory } from "@/core/config/userDataDirectory";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";

// Log levels and their visual styling for console output
const LEVELS = {
    info: { label: "INFO", color: chalk.cyan },
    warn: { label: "WARN", color: chalk.yellow },
    error: { label: "ERROR", color: chalk.red },
    debug: { label: "DEBUG", color: chalk.magenta },
};

export type LogLevel = keyof typeof LEVELS;

/**
 * Log entry structure for internal storage and file output
 */
export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    session: string;
    meta?: any;
}

/**
 * Specialized song request entry for music tracking
 */
export interface SongRequestEntry {
    title: string;
    artist: string;
    requestedBy: string;
    timestamp: number;
    session: string;
}

// In-memory log storage with size limits to prevent memory leaks
const logs: LogEntry[] = [];
const MAX_LOGS = 1000;

// Session-based organization for better log tracking across app restarts
const SESSION_ID = `session_${Date.now()}`;
const userDataDirectory = app
    ? resolveUserDataDirectory(
          app.getPath("userData"),
          process.env.MELODIFY_PREVIEW_USER_DATA,
          process.env.NODE_ENV === "development"
      )
    : process.cwd();
const LOG_DIR = app
    ? path.join(userDataDirectory, "logs")
    : path.join(process.cwd(), "logs");
const SONG_REQUESTS_DIR = app
    ? path.join(userDataDirectory, "song-requests")
    : path.join(process.cwd(), "song-requests");

/**
 * File naming strategy for organized log storage
 * Format: YYYY-MM-DD_sessionId.log for easy chronological sorting
 */
function getLogFilePath() {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return path.join(LOG_DIR, `${today}_${SESSION_ID}.log`);
}

function getSongRequestsFilePath() {
    const today = new Date().toISOString().split("T")[0];
    return path.join(SONG_REQUESTS_DIR, `${today}_${SESSION_ID}.json`);
}

function getDailySongRequestsFilePath() {
    const today = new Date().toISOString().split("T")[0];
    return path.join(SONG_REQUESTS_DIR, `${today}_daily.json`);
}

/**
 * Console output formatting with timestamps and color coding
 * Provides immediate visual feedback during development and debugging
 */
function formatLog(entry: LogEntry) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const level = LEVELS[entry.level];
    const prefix = level.color(`[${time}] ${level.label}:`);
    return `${prefix} ${entry.message}`;
}

/**
 * File output formatting - structured but human-readable
 * Includes metadata for comprehensive debugging information
 */
function formatLogForFile(entry: LogEntry) {
    const timestamp = new Date(entry.timestamp).toISOString();
    const metaStr = entry.meta ? ` | Meta: ${JSON.stringify(entry.meta)}` : "";
    return `[${timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${metaStr}`;
}

/**
 * Real-time log streaming to all renderer processes
 * Enables live log viewing in development UI and debug windows
 */
function sendLogToRenderers(entry: LogEntry) {
    try {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((window) => {
            sendToWindowIfAlive(window, "log:entry", entry);
        });
    } catch (error) {
        // Avoid recursive logging errors
        console.error("Failed to send log to renderers:", error);
    }
}

/**
 * Automated log file cleanup system
 * Maintains 30-day retention policy to prevent disk space issues
 * Runs on application startup to clean up old sessions
 */
/**
 * Deletes regular files older than the cutoff. Directories and other entries
 * are skipped, and one unreadable/vanished entry must not abort cleanup of the
 * remaining files.
 */
function removeExpiredLogEntries(directory: string, cutoff: Date): void {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory)) {
        const entryPath = path.join(directory, entry);
        try {
            const stats = fs.statSync(entryPath);
            if (!stats.isFile() || stats.mtime >= cutoff) continue;
            fs.unlinkSync(entryPath);
        } catch {
            // Leave the entry in place; continue with the rest.
        }
    }
}

function cleanupOldLogs() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        removeExpiredLogEntries(LOG_DIR, thirtyDaysAgo);
        removeExpiredLogEntries(SONG_REQUESTS_DIR, thirtyDaysAgo);
    } catch (error) {
        console.error("Failed to cleanup old logs:", error);
    }
}

/**
 * Session initialization with metadata header
 * Creates a clear marker for each application session in log files
 */
function initializeSessionLog() {
    const sessionHeader = [
        "=====================================",
        `SESSION START: ${new Date().toISOString()}`,
        `Session ID: ${SESSION_ID}`,
        `App Version: ${app?.getVersion() || "development"}`,
        `Platform: ${process.platform} ${process.arch}`,
        `Node Version: ${process.version}`,
        "=====================================",
    ].join("\n");

    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        fs.appendFileSync(getLogFilePath(), sessionHeader + "\n");
    } catch (error) {
        console.error("Failed to initialize session log:", error);
    }
}

/**
 * Core logging function with multi-destination output
 * Handles console display, file persistence, and real-time streaming
 *
 * @param level - Log severity level
 * @param message - Primary log message
 * @param meta - Optional metadata object for context
 */
function log(level: LogLevel, message: string, meta?: any) {
    const entry: LogEntry = {
        level,
        message: redactLogText(message),
        timestamp: Date.now(),
        session: SESSION_ID,
        meta: redactSecrets(meta),
    };

    // Memory storage with circular buffer behavior
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.shift();

    // Styled console output for immediate visibility
    console.log(formatLog(entry));

    // Real-time streaming to UI components
    sendLogToRenderers(entry);

    // Persistent file storage for long-term debugging
    appendLogToFile(entry);
}

/**
 * Asynchronous file appending with error handling
 * Ensures logs are written to disk even if console display fails
 * Creates directory structure if it doesn't exist
 *
 * @param entry - Log entry to append to file
 */
function appendLogToFile(entry: LogEntry) {
    try {
        // Ensure log directory exists
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }

        // Format and append log entry to session file
        const logLine = formatLogForFile(entry) + "\n";
        fs.appendFileSync(getLogFilePath(), logLine);
    } catch (error) {
        // Fallback to console if file writing fails
        console.error("Failed to append log to file:", error);
    }
}

/**
 * Specialized song request logging system
 * Maintains separate tracking for music requests with dual storage:
 * - Session-specific files for detailed tracking
 * - Daily aggregate files for analytics and reporting
 *
 * @param title - Song title
 * @param artist - Artist name
 * @param requestedBy - Username who requested the song
 */
export function logSongRequest(
    title: string,
    artist: string,
    requestedBy: string
) {
    const entry: SongRequestEntry = {
        title,
        artist,
        requestedBy,
        timestamp: Date.now(),
        session: SESSION_ID,
    };

    // Log as regular entry for console/file output
    logInfo(
        `Song request: ${title} by ${artist} (requested by ${requestedBy})`
    );

    try {
        // Ensure song requests directory exists
        if (!fs.existsSync(SONG_REQUESTS_DIR)) {
            fs.mkdirSync(SONG_REQUESTS_DIR, { recursive: true });
        }

        // Session-specific song request file
        const sessionFilePath = getSongRequestsFilePath();
        let sessionRequests: SongRequestEntry[] = [];
        if (fs.existsSync(sessionFilePath)) {
            const data = fs.readFileSync(sessionFilePath, "utf-8");
            sessionRequests = JSON.parse(data);
        }
        sessionRequests.push(entry);
        fs.writeFileSync(
            sessionFilePath,
            JSON.stringify(sessionRequests, null, 2)
        );

        // Daily aggregate file for cross-session analytics
        const dailyFilePath = getDailySongRequestsFilePath();
        let dailyRequests: SongRequestEntry[] = [];
        if (fs.existsSync(dailyFilePath)) {
            const data = fs.readFileSync(dailyFilePath, "utf-8");
            dailyRequests = JSON.parse(data);
        }
        dailyRequests.push(entry);
        fs.writeFileSync(dailyFilePath, JSON.stringify(dailyRequests, null, 2));
    } catch (error) {
        logError(error, "Failed to save song request");
    }
}

// Get song requests for a specific date
export function getSongRequestsForDate(date: string): SongRequestEntry[] {
    try {
        const dailyFile = path.join(SONG_REQUESTS_DIR, `${date}_daily.json`);
        if (fs.existsSync(dailyFile)) {
            const content = fs.readFileSync(dailyFile, "utf8");
            return JSON.parse(content);
        }
    } catch (error) {
        logError(error, `Failed to get song requests for date ${date}`);
    }
    return [];
}

// Get song requests for current session
export function getSongRequestsForSession(): SongRequestEntry[] {
    try {
        const sessionFile = getSongRequestsFilePath();
        if (fs.existsSync(sessionFile)) {
            const content = fs.readFileSync(sessionFile, "utf8");
            return JSON.parse(content);
        }
    } catch (error) {
        logError(error, "Failed to get song requests for current session");
    }
    return [];
}

export function logInfo(message: string, meta?: any) {
    log("info", message, meta);
}

export function logWarn(message: string, meta?: any) {
    log("warn", message, meta);
}

export function logError(error: any, context?: string) {
    let msg =
        error instanceof Error ? error.stack || error.message :
            typeof error === "string" ? error : JSON.stringify(redactSecrets(error)) || "Unknown error";
    if (context) msg = `[${context}] ${msg}`;
    log("error", msg);
}

export function logDebug(message: string, meta?: any) {
    log("debug", message, meta);
}

// Initialize logging system
initializeSessionLog();
cleanupOldLogs();

// Log session start
logInfo("Logging system initialized", { sessionId: SESSION_ID });

// IPC: Renderer requests all logs
if (ipcMain) {
    ipcMain.handle("log:getAll", () => logs);
}
