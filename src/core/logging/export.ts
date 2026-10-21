import { redactSecrets, redactLogText } from "./utils";

/** Defense in depth for exports; does not alter or delete existing log files. */
export function formatLogsForExport(logs: readonly unknown[]): string {
    return logs.map((raw) => {
        const entry = redactSecrets(raw);
        const level = typeof entry?.level === "string" ? entry.level : "info";
        const date = new Date(entry?.timestamp ?? Date.now());
        const timestamp = Number.isFinite(date.getTime()) ? date.toISOString() : "Unknown time";
        const message = typeof entry?.message === "string" ? entry.message : JSON.stringify(entry);
        return redactLogText(`[${level.toUpperCase()}] [${timestamp}] ${message}`);
    }).join("\n");
}
