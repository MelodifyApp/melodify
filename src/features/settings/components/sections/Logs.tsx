// Logs settings - Studio layout over the existing log/search/export behavior.

import { useEffect, useRef, useState } from "react";
import {
    AlertCircle,
    AlertTriangle,
    Bug,
    Download,
    Info,
    Search,
    Terminal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Input, Select, SettingGroup } from "@/ui/components/studio";
import { formatLogsForExport } from "@/core/logging/export";

interface LogsProps {
    logs: any[];
    searchQuery?: string;
}

const LEVELS = ["error", "warn", "info", "debug"] as const;
type LogLevel = (typeof LEVELS)[number];

const levelIcons: Record<LogLevel, typeof AlertCircle> = {
    error: AlertCircle,
    warn: AlertTriangle,
    info: Info,
    debug: Bug,
};

const levelMessageKeys: Record<LogLevel, string> = {
    error: "logs.error",
    warn: "logs.warnings",
    info: "logs.info",
    debug: "logs.debug",
};

export default function Logs({ logs }: LogsProps) {
    const { t } = useTranslation();
    const logsContainerRef = useRef<HTMLDivElement>(null);
    const [filter, setFilter] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState<string>("");

    useEffect(() => {
        if (logsContainerRef.current) {
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
        (accumulator, log) => {
            const level = log?.level ?? "unknown";
            accumulator[level] = (accumulator[level] || 0) + 1;
            return accumulator;
        },
        {} as Record<string, number>
    );

    const levelOptions = [
        {
            value: "all",
            label: `${t("logs.all")} (${logs.length})`,
        },
        ...LEVELS.map((level) => ({
            value: level,
            label: `${t(levelMessageKeys[level])} (${logCounts[level] || 0})`,
        })),
    ];

    const handleExportLogs = () => {
        const logData = formatLogsForExport(logs);
        const blob = new Blob([logData], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `melodify-logs-${
            new Date().toISOString().split("T")[0]
        }.txt`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="studio-settings-api studio-logs">
            <div className="studio-settings-api-heading">
                <h2>{t("logs.title")}</h2>
            </div>

            <SettingGroup heading={t("logs.applicationLogs")}>
                <div className="studio-logs-head">
                    <div className="studio-logs-head-copy">
                        <span className="studio-logs-icon" aria-hidden="true">
                            <Terminal />
                        </span>
                        <div>
                            <h3>{t("logs.title")}</h3>
                        </div>
                    </div>
                    <Button variant="secondary" onClick={handleExportLogs}>
                        <Download aria-hidden="true" />
                        {t("logs.export")}
                    </Button>
                </div>

                <div className="studio-logs-counts">
                    {LEVELS.map((level) => {
                        const Icon = levelIcons[level];
                        return (
                            <div
                                key={level}
                                className="studio-logs-count"
                                data-level={level}
                            >
                                <span className="studio-logs-count-label">
                                    <Icon aria-hidden="true" />
                                    {t(levelMessageKeys[level])}
                                </span>
                                <strong>{logCounts[level] || 0}</strong>
                            </div>
                        );
                    })}
                </div>

                <div className="studio-logs-filters">
                    <Input
                        id="logs-search"
                        label={t("logs.search")}
                        type="search"
                        value={searchTerm}
                        onChange={(event) =>
                            setSearchTerm(event.target.value)
                        }
                        placeholder={t("logs.searchPlaceholder")}
                        wrapperClassName="studio-logs-search"
                    />
                    <Select
                        id="logs-filter"
                        label={t("logs.level")}
                        value={filter}
                        options={levelOptions}
                        onChange={setFilter}
                        wrapperClassName="studio-logs-filter"
                    />
                </div>

                {(searchTerm || filter !== "all") && (
                    <div className="studio-logs-active-filters">
                        <Search aria-hidden="true" />
                        <span>
                            {t("logs.showingResults", {
                                count: filteredLogs.length,
                                total: logs.length,
                            })}
                        </span>
                    </div>
                )}

                <div
                    ref={logsContainerRef}
                    className="studio-logs-list"
                    role="log"
                    aria-label={t("logs.title")}
                    tabIndex={0}
                >
                    {filteredLogs.length === 0 ? (
                        <p className="studio-logs-empty">
                            {logs.length === 0
                                ? t("logs.noLogs")
                                : t("logs.noMatches")}
                        </p>
                    ) : (
                        filteredLogs.map((log, index) => {
                            const level = (
                                LEVELS.includes(log?.level)
                                    ? log.level
                                    : "info"
                            ) as LogLevel;
                            const Icon = levelIcons[level];
                            const timestamp =
                                log?.timestamp ?? Date.now();
                            const message =
                                log?.message ?? JSON.stringify(log);
                            return (
                                <div
                                    key={index}
                                    className="studio-log-row"
                                    data-level={level}
                                >
                                    <Icon aria-hidden="true" />
                                    <span className="studio-log-time">
                                        {new Date(
                                            timestamp
                                        ).toLocaleTimeString()}
                                    </span>
                                    <span className="studio-log-message">
                                        {message}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>

                <p className="studio-logs-note">
                    {t("logs.logsRetentionNotice")}
                </p>
            </SettingGroup>
        </div>
    );
}
