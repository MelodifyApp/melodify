import React, { useEffect, useRef, useState } from "react";
import {
    Terminal,
    Download,
    Trash2,
    AlertCircle,
    Info,
    AlertTriangle,
    Bug,
    Search,
    ChevronDown,
} from "lucide-react";
import { Button } from "@/ui/components/Button";
import Input from "@/ui/components/Input";
import { useTranslation } from "react-i18next";
import { formatLogsForExport } from "@/core/logging/export";

interface LogsProps {
    logs: any[];
    searchQuery?: string;
}

export default function Logs({ logs, searchQuery }: LogsProps) {
    const { t } = useTranslation();
    const logsEndRef = useRef<HTMLDivElement>(null);
    const logsContainerRef = useRef<HTMLDivElement>(null);
    const [filter, setFilter] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState<string>("");

    const levelIcons = {
        error: AlertCircle,
        warn: AlertTriangle,
        info: Info,
        debug: Bug,
    };

    const levelColors = {
        error: "text-red-400",
        warn: "text-yellow-300",
        info: "text-cyan-300",
        debug: "text-purple-300",
    };

    useEffect(() => {
        if (logsContainerRef.current) {
            // Scroll to bottom of the log container, not the entire page
            logsContainerRef.current.scrollTop =
                logsContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const filteredLogs = logs.filter((log) => {
        if (
            !log ||
            typeof log.level !== "string" ||
            typeof log.message !== "string"
        ) {
            return filter === "all";
        }

        const matchesLevel = filter === "all" || log.level === filter;
        const matchesSearch =
            !searchTerm ||
            log.message.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesLevel && matchesSearch;
    });

    const logCounts = logs.reduce(
        (acc, log) => {
            const level = log?.level ?? "unknown";
            acc[level] = (acc[level] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    const handleExportLogs = () => {
        // Create a downloadable log file
        const logData = formatLogsForExport(logs);

        const blob = new Blob([logData], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `melodify-logs-${new Date().toISOString().split("T")[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleClearLogs = () => {
        // This would need to be implemented to clear logs from the main process
        console.log("Clear logs functionality not yet implemented");
    };

    return (
        <div className="space-y-4">
            <h3 className="text-base font-medium text-white mb-4">
                {t("logs.title")}
            </h3>

            <div className="settings-section">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center">
                        <Terminal className="w-3 h-3 text-blue-300" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-white">
                            {t("logs.title")}
                        </h3>
                        <p className="text-xs text-zinc-400">
                            {t("logs.runtimeLogs")}
                        </p>
                    </div>
                    <div className="flex gap-1">
                        <Button
                            onClick={handleExportLogs}
                            className="text-xs px-2 py-1 h-auto bg-green-600 hover:bg-green-700"
                        >
                            <Download className="w-3 h-3 mr-1" />
                            {t("logs.export")}
                        </Button>
                        <Button
                            onClick={handleClearLogs}
                            className="text-xs px-2 py-1 h-auto bg-red-600 hover:bg-red-700"
                        >
                            <Trash2 className="w-3 h-3 mr-1" />
                            {t("logs.clear")}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-3">
                    {["error", "warn", "info", "debug"].map((level) => {
                        const Icon =
                            levelIcons[level as keyof typeof levelIcons];
                        const count = logCounts[level] || 0;
                        return (
                            <div
                                key={level}
                                className="bg-zinc-700/30 rounded p-2 text-center"
                            >
                                <div className="flex items-center justify-center gap-1 mb-1">
                                    <Icon
                                        className={`w-3 h-3 ${levelColors[level as keyof typeof levelColors]}`}
                                    />
                                    <span className="text-xs text-zinc-400 capitalize">
                                        {t(
                                            `logs.${level === "warn" ? "warnings" : level}`
                                        )}
                                    </span>
                                </div>
                                <div className="text-sm font-mono text-white">
                                    {count}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Search and Filter Controls */}
                <div className="flex gap-3 mb-4">
                    {/* Search Input */}
                    <div className="flex-1">
                        <Input
                            placeholder={t("logs.searchPlaceholder")}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full"
                        />
                    </div>

                    {/* Level Filter Dropdown */}
                    <div className="relative min-w-[140px]">
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-full appearance-none bg-zinc-800/50 border border-zinc-600/50 rounded-lg px-3 py-2.5 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 hover:border-zinc-500/70 cursor-pointer"
                        >
                            <option value="all">
                                {t("logs.all")} ({logs.length})
                            </option>
                            <option value="error">
                                {t("logs.error")} ({logCounts.error || 0})
                            </option>
                            <option value="warn">
                                {t("logs.warnings")} ({logCounts.warn || 0})
                            </option>
                            <option value="info">
                                {t("logs.info")} ({logCounts.info || 0})
                            </option>
                            <option value="debug">
                                {t("logs.debug")} ({logCounts.debug || 0})
                            </option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                    </div>
                </div>

                {/* Active Filters Summary */}
                {(searchTerm || filter !== "all") && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
                        <span>
                            {t("logs.showingResults", {
                                count: filteredLogs.length,
                                total: logs.length,
                            })}
                        </span>
                        {searchTerm && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-700/50 rounded text-zinc-300">
                                <Search className="h-3 w-3" />"{searchTerm}"
                            </span>
                        )}
                        {filter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-700/50 rounded text-zinc-300">
                                {levelIcons[
                                    filter as keyof typeof levelIcons
                                ] &&
                                    React.createElement(
                                        levelIcons[
                                            filter as keyof typeof levelIcons
                                        ],
                                        { className: "h-3 w-3" }
                                    )}
                                {t(
                                    `logs.${filter === "warn" ? "warnings" : filter}`
                                )}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="bg-zinc-900 border border-zinc-700/50 rounded-md">
                <div
                    ref={logsContainerRef}
                    className="overflow-y-auto p-3 text-xs font-mono max-h-80 min-h-40"
                >
                    {filteredLogs.length === 0 && (
                        <div className="text-zinc-500 text-center py-8">
                            {logs.length === 0
                                ? "No logs yet."
                                : "No logs match your filters."}
                        </div>
                    )}
                    {filteredLogs.map((log, i) => {
                        const level = log?.level ?? "info";
                        const timestamp = log?.timestamp ?? Date.now();
                        const message = log?.message ?? JSON.stringify(log);

                        if (
                            !log ||
                            typeof log.level !== "string" ||
                            typeof log.message !== "string"
                        ) {
                            return (
                                <div
                                    key={i}
                                    className="text-zinc-500 break-words mb-1 opacity-50"
                                >
                                    [INVALID] {JSON.stringify(log)}
                                </div>
                            );
                        }

                        const Icon =
                            levelIcons[level as keyof typeof levelIcons];

                        return (
                            <div
                                key={i}
                                className={`${levelColors[level as keyof typeof levelColors]} break-words mb-1 flex items-start gap-2`}
                            >
                                <Icon className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span className="text-zinc-400 flex-shrink-0">
                                    {new Date(timestamp).toLocaleTimeString()}
                                </span>
                                <span className="break-words min-w-0">
                                    {message}
                                </span>
                            </div>
                        );
                    })}
                    <div ref={logsEndRef} />
                </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3">
                <p className="text-blue-300 text-xs leading-relaxed">
                    {t("logs.logsRetentionNotice")}
                </p>
            </div>
        </div>
    );
}
