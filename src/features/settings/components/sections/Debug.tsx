// Debug section - Studio layout for development-only tools.

import { useEffect, useState } from "react";
import {
    Bug,
    Clock,
    Cpu,
    HardDrive,
    Monitor,
    Network,
    RotateCcw,
    TestTube,
    Zap,
} from "lucide-react";
import { Button, Input, SettingGroup, Toggle } from "@/ui/components/studio";

interface PerformanceStats {
    commandName: string;
    totalExecutions: number;
    averageTime: number;
    fastestTime: number;
    slowestTime: number;
    lastExecuted: number;
}

interface DebugSystemInfo {
    platform?: string;
    language?: string;
    userAgent?: string;
    cookieEnabled?: boolean;
}

export default function Debug() {
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const [systemInfo, setSystemInfo] = useState<DebugSystemInfo>({});
    const [testInput, setTestInput] = useState("");
    const [performanceStats, setPerformanceStats] = useState<
        PerformanceStats[]
    >([]);
    const [isLoadingStats, setIsLoadingStats] = useState(false);

    useEffect(() => {
        setSystemInfo({
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            language: navigator.language,
            cookieEnabled: navigator.cookieEnabled,
        });
        void loadPerformanceStats();
    }, []);

    const loadPerformanceStats = async () => {
        setIsLoadingStats(true);
        try {
            const stats = await window.electronAPI.invoke(
                "commands:getPerformanceStats"
            );
            setPerformanceStats(stats || []);
        } catch (error) {
            console.error("Failed to load performance stats:", error);
        } finally {
            setIsLoadingStats(false);
        }
    };

    const resetAllStats = async () => {
        try {
            window.electronAPI.send("commands:resetPerformanceStats");
            await loadPerformanceStats();
        } catch (error) {
            console.error("Failed to reset performance stats:", error);
        }
    };

    const resetCommandStats = async (commandName: string) => {
        try {
            window.electronAPI.send(
                "commands:resetCommandPerformanceStats",
                commandName
            );
            await loadPerformanceStats();
        } catch (error) {
            console.error("Failed to reset command performance stats:", error);
        }
    };

    const formatTime = (time: number) => {
        if (time === Infinity) return "N/A";
        return `${time.toFixed(2)}ms`;
    };

    const formatDate = (timestamp: number) =>
        new Date(timestamp).toLocaleTimeString();
    const deviceMemory = (
        navigator as Navigator & { deviceMemory?: number }
    ).deviceMemory;

    return (
        <div className="studio-settings-api studio-debug">
            <div className="studio-settings-api-heading">
                <h2>Debug</h2>
            </div>

            <SettingGroup heading="System information">
                <div className="studio-debug-grid">
                    <div className="studio-debug-tile">
                        <span>
                            <Cpu aria-hidden="true" />
                            Platform
                        </span>
                        <strong>
                            {systemInfo.platform ||
                                navigator.platform ||
                                "Unknown"}
                        </strong>
                    </div>
                    <div className="studio-debug-tile">
                        <span>
                            <Monitor aria-hidden="true" />
                            Language
                        </span>
                        <strong>
                            {systemInfo.language ||
                                navigator.language ||
                                "Unknown"}
                        </strong>
                    </div>
                    <div className="studio-debug-tile">
                        <span>
                            <Network aria-hidden="true" />
                            User agent
                        </span>
                        <strong>
                            {navigator.userAgent.split(" ")[0] || "Unknown"}
                        </strong>
                    </div>
                    <div className="studio-debug-tile">
                        <span>
                            <HardDrive aria-hidden="true" />
                            Memory
                        </span>
                        <strong>
                            {deviceMemory ? `${deviceMemory}GB` : "Unknown"}
                        </strong>
                    </div>
                </div>
            </SettingGroup>

            <SettingGroup heading="UI components">
                <div className="studio-debug-block">
                    <h3>Toggle states</h3>
                    <Toggle
                        id="debug-toggle"
                        label={
                            checked["toggle-sm"] ? "Enabled" : "Disabled"
                        }
                        checked={!!checked["toggle-sm"]}
                        onCheckedChange={(value) =>
                            setChecked((current) => ({
                                ...current,
                                "toggle-sm": value,
                            }))
                        }
                    />
                </div>
                <div className="studio-debug-block">
                    <h3>Button variants</h3>
                    <div className="studio-debug-actions">
                        <Button
                            variant="primary"
                            onClick={() => console.log("primary clicked")}
                        >
                            Primary
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => console.log("secondary clicked")}
                        >
                            Secondary
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => console.log("ghost clicked")}
                        >
                            Ghost
                        </Button>
                    </div>
                </div>
                <div className="studio-debug-block">
                    <h3>Input states</h3>
                    <div className="studio-debug-inputs">
                        <Input
                            id="debug-normal-input"
                            label="Normal input"
                            value={testInput}
                            onChange={(event) =>
                                setTestInput(event.target.value)
                            }
                            placeholder="Type something..."
                        />
                        <Input
                            id="debug-error-input"
                            label="Error input"
                            value=""
                            readOnly
                            error="This is an error message"
                            placeholder="Error state..."
                        />
                    </div>
                </div>
            </SettingGroup>

            <SettingGroup heading="Command performance">
                <div className="studio-debug-block">
                    <div className="studio-debug-actions">
                        <Button
                            variant="secondary"
                            onClick={() => void loadPerformanceStats()}
                            loading={isLoadingStats}
                        >
                            <Clock aria-hidden="true" />
                            Refresh
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => void resetAllStats()}
                        >
                            <RotateCcw aria-hidden="true" />
                            Reset all
                        </Button>
                    </div>
                </div>
                {performanceStats.length > 0 ? (
                    <div className="studio-debug-table-wrap">
                        <div className="studio-debug-table studio-debug-table-head">
                            <span>Command</span>
                            <span>Executions</span>
                            <span>Avg</span>
                            <span>Fastest</span>
                            <span>Slowest</span>
                            <span>Last run</span>
                            <span />
                        </div>
                        {performanceStats.map((stat) => (
                            <div
                                className="studio-debug-table"
                                key={stat.commandName}
                            >
                                <strong>{stat.commandName}</strong>
                                <span>{stat.totalExecutions}</span>
                                <span>{formatTime(stat.averageTime)}</span>
                                <span>{formatTime(stat.fastestTime)}</span>
                                <span>{formatTime(stat.slowestTime)}</span>
                                <span>{formatDate(stat.lastExecuted)}</span>
                                <Button
                                    variant="ghost"
                                    size="small"
                                    onClick={() =>
                                        void resetCommandStats(stat.commandName)
                                    }
                                    aria-label={`Reset ${stat.commandName} stats`}
                                >
                                    Reset
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="studio-empty-state">
                        <Zap aria-hidden="true" />
                        <h3>No performance data</h3>
                        <p>
                            Execute some commands to see command performance
                            statistics.
                        </p>
                    </div>
                )}
            </SettingGroup>

            <SettingGroup heading="Debug actions">
                <div className="studio-debug-actions">
                    <Button
                        variant="secondary"
                        onClick={() => window.electronAPI.openUITestWindow()}
                    >
                        <TestTube aria-hidden="true" />
                        Open UI test window
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => console.log("states", checked)}
                    >
                        Log states
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setChecked({})}
                    >
                        Reset component states
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => window.location.reload()}
                    >
                        Reload app
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => console.clear()}
                    >
                        Clear console
                    </Button>
                </div>
            </SettingGroup>

            <p className="studio-debug-note">
                <Bug aria-hidden="true" />
                This section is development-only and uses local tools. It never
                reads credentials or provider data.
            </p>
        </div>
    );
}
