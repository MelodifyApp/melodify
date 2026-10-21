import { useEffect, useRef, useState } from "react";
import {
    RotateCcw,
    TestTube,
    X,
} from "lucide-react";
import {
    UI_TEST_CONNECTION_STATES,
    UI_TEST_CREDENTIAL_FORM_STATES,
    UI_TEST_PRESETS,
    UI_TEST_ROUTES,
    UI_TEST_SETTINGS_SECTIONS,
    UI_TEST_SETTINGS_STATES,
    UI_TEST_UPDATE_STATES,
    advanceMockDownloadProgress,
} from "./uiTestCatalog";

type Route = (typeof UI_TEST_ROUTES)[number]["id"];
type SpotifyState = (typeof UI_TEST_CONNECTION_STATES.spotify)[number];
type KickState = (typeof UI_TEST_CONNECTION_STATES.kick)[number];
type TwitchState = (typeof UI_TEST_CONNECTION_STATES.twitch)[number];
type UpdateState = (typeof UI_TEST_UPDATE_STATES)[number];
type SettingsSection = (typeof UI_TEST_SETTINGS_SECTIONS)[number];
type SetupService = "none" | "Spotify" | "Kick" | "Twitch";
type CredentialFormState = (typeof UI_TEST_CREDENTIAL_FORM_STATES)[number];

type Signal = {
    label: string;
    value: string;
    tone: "good" | "warn" | "bad" | "neutral";
};

type MockServiceState = {
    name: string;
    user?: string;
    heading: string;
    signals: Signal[];
    action: string;
    secondaryAction?: string;
};

const spotifyStates: Record<SpotifyState, MockServiceState> = {
    loading: {
        name: "Spotify", heading: "Checking account and device status", action: "Checking…",
        signals: [
            { label: "Developer credentials", value: "Checking…", tone: "neutral" },
            { label: "Spotify account", value: "Checking…", tone: "neutral" },
            { label: "Spotify app", value: "Checking…", tone: "neutral" },
            { label: "Active device", value: "Checking…", tone: "neutral" },
        ],
    },
    "no-secrets": {
        name: "Spotify", heading: "Connect a developer app first", action: "Configure credentials",
        signals: [
            { label: "Developer credentials", value: "Not configured", tone: "bad" },
            { label: "Spotify account", value: "Not connected", tone: "neutral" },
            { label: "Spotify app", value: "Closed", tone: "neutral" },
            { label: "Active device", value: "Unknown", tone: "neutral" },
        ],
    },
    "credentials-only": {
        name: "Spotify", heading: "Credentials are saved", action: "Connect Spotify", secondaryAction: "Edit credentials",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Spotify account", value: "Not connected", tone: "neutral" },
            { label: "Spotify app", value: "Running", tone: "good" },
            { label: "Active device", value: "Not checked", tone: "neutral" },
        ],
    },
    "auth-in-progress": {
        name: "Spotify", heading: "Waiting for browser authorization", action: "Connecting…",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Spotify account", value: "Authorization pending", tone: "warn" },
            { label: "Spotify app", value: "Running", tone: "good" },
            { label: "Active device", value: "Not checked", tone: "neutral" },
        ],
    },
    "auth-error": {
        name: "Spotify", heading: "Account could not be verified", action: "Retry connection", secondaryAction: "Edit credentials",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Spotify account", value: "Authorization failed", tone: "bad" },
            { label: "Spotify app", value: "Closed", tone: "neutral" },
            { label: "Active device", value: "Unavailable", tone: "neutral" },
        ],
    },
    "connected-no-device": {
        name: "Spotify", user: "@streamer", heading: "Account connected · no active device", action: "Refresh status", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Spotify account", value: "Connected", tone: "good" },
            { label: "Spotify app", value: "Open", tone: "good" },
            { label: "Active device", value: "None reported", tone: "warn" },
        ],
    },
    "active-local": {
        name: "Spotify", user: "@streamer", heading: "Account connected · device available", action: "Refresh status", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Spotify account", value: "Connected", tone: "good" },
            { label: "Spotify app", value: "Running", tone: "good" },
            { label: "Active device", value: "Available", tone: "good" },
        ],
    },
    "active-remote": {
        name: "Spotify", user: "@streamer", heading: "Spotify is active on another device", action: "Refresh status", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Spotify account", value: "Connected", tone: "good" },
            { label: "Spotify app", value: "Not detected here", tone: "neutral" },
            { label: "Active device", value: "Active session found", tone: "good" },
        ],
    },
};

const kickStates: Record<KickState, MockServiceState> = {
    loading: {
        name: "Kick", heading: "Checking account and chat reader", action: "Checking…",
        signals: [
            { label: "Developer credentials", value: "Checking…", tone: "neutral" },
            { label: "Kick account", value: "Checking…", tone: "neutral" },
            { label: "Chat reader", value: "Checking…", tone: "neutral" },
        ],
    },
    "no-secrets": {
        name: "Kick", heading: "Set up a Kick developer app", action: "Configure credentials",
        signals: [
            { label: "Developer credentials", value: "Not configured", tone: "bad" },
            { label: "Kick account", value: "Not connected", tone: "neutral" },
            { label: "Guest chat reader", value: "Not started", tone: "neutral" },
        ],
    },
    "credentials-only": {
        name: "Kick", heading: "Credentials ready to connect", action: "Connect Kick", secondaryAction: "Edit credentials",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Kick account", value: "Not connected", tone: "neutral" },
            { label: "Guest chat reader", value: "Not started", tone: "neutral" },
        ],
    },
    "auth-in-progress": {
        name: "Kick", heading: "Waiting for browser authorization", action: "Connecting…",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Kick account", value: "Authorization pending", tone: "warn" },
            { label: "Guest chat reader", value: "Not started", tone: "neutral" },
        ],
    },
    "oauth-failed-reader-active": {
        name: "Kick", user: "@streamer", heading: "Chat reading continues · replies need sign-in", action: "Reconnect account", secondaryAction: "Stop reader",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Kick account", value: "Sign-in unavailable", tone: "warn" },
            { label: "Guest chat reader", value: "Reading chat", tone: "good" },
        ],
    },
    "chat-connecting": {
        name: "Kick", user: "@streamer", heading: "Account connected · chat connecting", action: "Retry chat", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Kick account", value: "Connected", tone: "good" },
            { label: "Guest chat reader", value: "Connecting", tone: "warn" },
        ],
    },
    "chat-connected": {
        name: "Kick", user: "@streamer", heading: "Kick chat is ready", action: "Refresh status", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Kick account", value: "Connected", tone: "good" },
            { label: "Guest chat reader", value: "Listening", tone: "good" },
        ],
    },
    "chat-disconnected": {
        name: "Kick", user: "@streamer", heading: "Account connected · chat unavailable", action: "Retry chat", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Kick account", value: "Connected", tone: "good" },
            { label: "Guest chat reader", value: "Disconnected", tone: "bad" },
        ],
    },
};

const twitchStates: Record<TwitchState, MockServiceState> = {
    loading: {
        name: "Twitch", heading: "Checking account and EventSub", action: "Checking…",
        signals: [
            { label: "Developer credentials", value: "Checking…", tone: "neutral" },
            { label: "Twitch account", value: "Checking…", tone: "neutral" },
            { label: "Chat listener", value: "Checking…", tone: "neutral" },
        ],
    },
    "no-secrets": {
        name: "Twitch", heading: "Optional platform · not configured", action: "Configure credentials",
        signals: [
            { label: "Developer credentials", value: "Not configured", tone: "neutral" },
            { label: "Twitch account", value: "Not connected", tone: "neutral" },
            { label: "Chat listener", value: "Not started", tone: "neutral" },
        ],
    },
    "credentials-only": {
        name: "Twitch", heading: "Credentials ready to connect", action: "Connect Twitch", secondaryAction: "Edit credentials",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Twitch account", value: "Not connected", tone: "neutral" },
            { label: "Chat listener", value: "Not started", tone: "neutral" },
        ],
    },
    "auth-in-progress": {
        name: "Twitch", heading: "Waiting for browser authorization", action: "Connecting…",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Twitch account", value: "Authorization pending", tone: "warn" },
            { label: "Chat listener", value: "Not started", tone: "neutral" },
        ],
    },
    "listener-started-unverified": {
        name: "Twitch", user: "@streamer", heading: "Listener started · event delivery not verified", action: "Refresh status", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Twitch account", value: "Connected", tone: "good" },
            { label: "EventSub listener", value: "Started · subscriptions unverified", tone: "warn" },
        ],
    },
    "chat-connected": {
        name: "Twitch", user: "@streamer", heading: "Chat reader connected", action: "Refresh status", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Twitch account", value: "Connected", tone: "good" },
            { label: "EventSub listener", value: "Connected · sample state", tone: "good" },
        ],
    },
    "subscription-error": {
        name: "Twitch", user: "@streamer", heading: "Listener started · subscription error", action: "Refresh status", secondaryAction: "Disconnect",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Twitch account", value: "Connected", tone: "good" },
            { label: "EventSub listener", value: "Subscription needs attention", tone: "bad" },
        ],
    },
    "auth-expired": {
        name: "Twitch", heading: "Account needs to be reconnected", action: "Connect Twitch", secondaryAction: "Edit credentials",
        signals: [
            { label: "Developer credentials", value: "Configured", tone: "good" },
            { label: "Twitch account", value: "Expired", tone: "bad" },
            { label: "EventSub listener", value: "Not connected", tone: "neutral" },
        ],
    },
};

const titleFor = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function SelectControl({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
}) {
    return (
        <label className="block text-[11px] text-zinc-400">
            {label}
            <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-100">
                {options.map((option) => <option key={option} value={option}>{titleFor(option)}</option>)}
            </select>
        </label>
    );
}

function Signal({ item }: { item: Signal }) {
    const color = item.tone === "good" ? "bg-green-400" : item.tone === "warn" ? "bg-yellow-300" : item.tone === "bad" ? "bg-red-400" : "bg-zinc-500";
    return (
        <div className="flex min-w-0 items-start gap-2 border-t border-zinc-700/70 py-2">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
            <div className="min-w-0">
                <p className="m-0 text-[10px] text-zinc-500">{item.label}</p>
                <p className="m-0 mt-0.5 break-words text-[11px] leading-4 text-zinc-200">{item.value}</p>
            </div>
        </div>
    );
}

function MockService({ service, setupOpen = false, compact = false, credentialState = "empty" }: { service: MockServiceState; setupOpen?: boolean; compact?: boolean; credentialState?: CredentialFormState }) {
    return (
        <section className={compact ? "min-w-0 rounded-md border border-zinc-700 bg-zinc-900/70 p-3" : "border-b border-zinc-700/70 py-4 last:border-b-0"}>
            <div className={`flex items-start justify-between gap-4 ${compact ? "flex-col" : ""}`}>
                <div className="min-w-0">
                    <h3 className="m-0 text-sm font-semibold text-white">{service.name}{service.user ? <span className="ml-2 text-[10px] font-normal text-zinc-400">{service.user}</span> : null}</h3>
                    <p className="m-0 mt-1 text-[11px] text-zinc-400">{service.heading}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <button type="button" className="rounded border border-zinc-600 px-2.5 py-1.5 text-[10px] text-zinc-200 hover:bg-zinc-800">{service.action}</button>
                    {service.secondaryAction ? <button type="button" className="rounded px-2.5 py-1.5 text-[10px] text-zinc-400 hover:bg-zinc-800">{service.secondaryAction}</button> : null}
                </div>
            </div>
            <div className={`mt-2 grid ${compact ? "grid-cols-1" : "grid-cols-3"} gap-3`}>
                {service.signals.map((item) => <Signal key={item.label} item={item} />)}
            </div>
            {setupOpen ? (
                <div className="mt-3 rounded border border-zinc-700 bg-zinc-900 p-3">
                    <h4 className="m-0 text-xs font-semibold text-zinc-100">{service.name} developer credentials</h4>
                    {credentialState === "server-error" ? <Notice tone="error" text="The platform rejected these sample credentials." /> : null}
                    <div className="mt-2 grid grid-cols-2 gap-3">
                        <label className="text-[10px] text-zinc-400">Client ID<input readOnly value={credentialState === "validation-error" ? "invalid sample id" : ""} aria-invalid={credentialState === "validation-error"} placeholder="Sample only" className={`mt-1 block w-full rounded border bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-400 ${credentialState === "validation-error" ? "border-red-500" : "border-zinc-700"}`} /></label>
                        <label className="text-[10px] text-zinc-400">Client Secret<input readOnly type="password" value={credentialState === "saving" ? "sampleonly" : ""} placeholder="Never use real credentials here" className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-400" /></label>
                    </div>
                    {credentialState === "validation-error" ? <p className="mt-1 text-[9px] text-red-300">Client ID format is invalid.</p> : null}
                    <div className="mt-2 flex justify-end gap-2"><button type="button" className="rounded px-2 py-1 text-[10px] text-zinc-400">Cancel</button><button type="button" disabled={credentialState === "saving"} className="rounded bg-melodify-primary px-2 py-1 text-[10px] font-medium text-black disabled:opacity-60">{credentialState === "saving" ? "Saving…" : "Save credentials"}</button></div>
                    <p className="m-0 mt-2 text-[9px] text-zinc-500">Mock data only · never enter real credentials here.</p>
                </div>
            ) : null}
        </section>
    );
}

function MockSettingsContent({ section, state }: { section: SettingsSection; state: string }) {
    if (section === "general") {
        return (
            <div className="space-y-3">
                <SettingRow title="Start with Windows" detail="Launch when you sign in to this PC." on={state !== "defaults"} />
                <SettingRow title="Minimize to tray" detail="Keep the app running when minimized." on={state === "custom-language"} />
                <SettingRow title="Automatic update checks" detail="Updates still require your confirmation to download." on />
                <div className="flex items-center justify-between border-t border-zinc-700 py-3 text-xs"><span>Default reply language</span><span className="text-zinc-300">{state === "custom-language" ? "Türkçe" : "English"}</span></div>
                {state === "update-available" ? <Notice tone="info" text="A stable update is available; download has not started." /> : null}
                {state === "update-error" ? <Notice tone="error" text="The update check failed; retry is available." /> : null}
            </div>
        );
    }
    if (section === "secrets") {
        const filled = state === "configured";
        return (
            <div className="space-y-4">
                {state === "validation-error" ? <Notice tone="error" text="The sample credentials were rejected. Keep the entered value visible so it can be corrected." /> : null}
                {["Spotify", "Kick"].map((service) => <section key={service} className="border-t border-zinc-700 pt-3">
                    <h3 className="m-0 text-xs font-semibold text-zinc-200">{service} developer app</h3>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                        <Field label="Client ID" value={filled ? "••••••••••••" : ""} />
                        <label className="block text-[10px] text-zinc-400">Client Secret<input readOnly type="password" value={filled ? "sample-secret" : ""} placeholder="Not configured" className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-200" /></label>
                    </div>
                    <p className="m-0 mt-2 text-[9px] text-zinc-500">Sample state only · never enter real credentials in this test window.</p>
                </section>)}
            </div>
        );
    }
    if (section === "requests") {
        return (
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                    <SettingRow title="Everyone can request" detail="Requests are limited to allowed badges when off." on={state === "everyone-allowed"} />
                    <Field label="Command prefix" value="!" />
                    <Field label="Kick reward title" value={state === "custom-rewards" ? "Music token" : "Song Request"} />
                    <Field label="Twitch reward title" value="Song Request" />
                    <SettingRow title="Write current song to a file" detail="Updates a local text file from Spotify playback." on={state === "file-output"} />
                </div>
                <div className="rounded border border-zinc-700 bg-zinc-900 p-3">
                    <p className="m-0 text-[10px] text-zinc-500">CHAT REPLY · SAMPLE</p>
                    <p className="mt-3 text-xs text-zinc-200"><span className="text-purple-300">viewer</span> !sr Midnight City</p>
                    <p className="text-xs text-zinc-200"><span className="text-green-300">Melodify</span> Added “Midnight City” by M83.</p>
                    <p className="m-0 mt-3 text-[10px] text-zinc-500">This is a visual sample, not a live API result.</p>
                </div>
            </div>
        );
    }
    if (section === "commands") {
        return (
            <div className="space-y-2">
                <CommandPreview command="!sr" title="Song request" state={state === "disabled" ? "Off" : "On"} aliases={state === "aliases-expanded" ? "!song · !request · !sr" : "!sr · !song"} />
                <CommandPreview command="!volume" title="Spotify volume · moderators only" state="On" aliases="!volume · !vol" />
                <SettingRow title="Reply after success" detail="Uses the configured message template." on={state !== "replies-off"} />
                {state === "replies-off" ? <Notice tone="warning" text="Chat replies are disabled; request processing can still occur." /> : null}
            </div>
        );
    }
    if (section === "logs") {
        if (state === "empty") return <EmptyState text="No log entries in this sample." />;
        if (state === "filtered-empty") return <EmptyState text="No sample events match the selected filter." />;
        if (state === "error") return <Notice tone="error" text="Log entries could not be loaded. Retry the read operation." />;
        return <div className="space-y-0 border-t border-zinc-700"><LogPreview time="21:42:18" level="INFO" message="Song request processed · Midnight City" /><LogPreview time="21:40:02" level="WARN" message="Twitch listener started; delivery not confirmed" /><LogPreview time="21:31:10" level="ERROR" message="Spotify queue request was rejected" /></div>;
    }
    return (
        <div className="space-y-2">
            {state === "loading" ? <EmptyState text="Runtime checks are still loading." /> : null}
            {state === "warning" ? <Notice tone="warning" text="A service needs attention; check its connection details." /> : null}
            <LogPreview time="21:42:18" level={state === "warning" ? "WARN" : "INFO"} message="Development sample · no account or profile data loaded" />
            <SettingRow title="Command timing" detail="Sample value · 184 ms average" on />
        </div>
    );
}

function SettingRow({ title, detail, on }: { title: string; detail: string; on?: boolean }) {
    return <div className="flex items-center justify-between gap-4 border-b border-zinc-700 py-3"><div><p className="m-0 text-xs text-zinc-200">{title}</p><p className="m-0 mt-1 text-[10px] text-zinc-500">{detail}</p></div><span className={`rounded px-2 py-1 text-[9px] ${on ? "bg-green-500/10 text-green-300" : "bg-zinc-800 text-zinc-400"}`}>{on ? "On" : "Off"}</span></div>;
}

function Field({ label, value }: { label: string; value: string }) {
    return <label className="block text-[10px] text-zinc-400">{label}<input readOnly value={value} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-200" /></label>;
}

function CommandPreview({ command, title, state, aliases }: { command: string; title: string; state: string; aliases: string }) {
    return <div className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-700 py-3"><code className="text-xs text-melodify-primary">{command}</code><span><span className="block text-xs text-zinc-200">{title}</span><span className="block text-[10px] text-zinc-500">Aliases: {aliases}</span></span><span className="text-[10px] text-zinc-400">{state}</span></div>;
}

function LogPreview({ time, level, message }: { time: string; level: string; message: string }) {
    const tone = level === "ERROR" ? "text-red-300" : level === "WARN" ? "text-yellow-300" : "text-blue-300";
    return <div className="grid grid-cols-[64px_48px_minmax(0,1fr)] gap-3 border-b border-zinc-700/60 py-3 text-[10px]"><time className="text-zinc-500">{time}</time><span className={tone}>{level}</span><span className="break-words text-zinc-300">{message}</span></div>;
}

function Notice({ tone, text }: { tone: "info" | "warning" | "error"; text: string }) {
    const color = tone === "error" ? "border-red-500/50 text-red-200" : tone === "warning" ? "border-yellow-500/50 text-yellow-100" : "border-blue-500/50 text-blue-100";
    return <p role="status" className={`m-0 rounded border-l-2 bg-zinc-900 px-3 py-2 text-[11px] ${color}`}>{text}</p>;
}

function EmptyState({ text }: { text: string }) {
    return <div role="status" className="grid min-h-36 place-items-center rounded border border-dashed border-zinc-700 px-5 text-center text-xs text-zinc-400"><span>{text}</span></div>;
}

function MockUpdateDialog({
    state,
    progress,
    onClose,
    onDownload,
    onRetry,
    onInstall,
}: {
    state: UpdateState;
    progress: number;
    onClose: () => void;
    onDownload: () => void;
    onRetry: () => void;
    onInstall: () => void;
}) {
    if (state === "idle") return null;
    const text: Record<Exclude<UpdateState, "idle">, { title: string; body: string }> = {
        checking: { title: "Checking for updates", body: "The update check is in progress." },
        available: { title: "Update available", body: "A stable update is ready; download has not started." },
        downloading: { title: "Downloading update", body: `Sample download in progress · ${progress}%.` },
        downloaded: { title: "Update ready", body: "The user can install and restart, or wait until later." },
        error: { title: "Update could not be completed", body: "Retry is available." },
    };
    return (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 p-5" role="presentation">
            <section className="w-full max-w-[390px] rounded-md border border-zinc-600 bg-zinc-900 p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="mock-update-title">
                <div className="flex items-start justify-between gap-4">
                    <div><h3 id="mock-update-title" className="m-0 text-sm font-semibold text-zinc-100">{text[state].title}</h3><p className="mt-1 text-xs leading-5 text-zinc-400">{text[state].body}</p></div>
                    <button type="button" className="text-zinc-400 hover:text-white" onClick={onClose} aria-label="Close update preview"><X size={15} /></button>
                </div>
                {state === "downloading" && (
                    <div className="mt-3 h-1 overflow-hidden rounded bg-zinc-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                        <div className="h-full bg-melodify-primary transition-[width]" style={{ width: `${progress}%` }} />
                    </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                    {state === "available" && <><button type="button" className="rounded px-2 py-1 text-[10px] text-zinc-400" onClick={onClose}>Later</button><button type="button" className="rounded bg-melodify-primary px-2.5 py-1 text-[10px] font-medium text-black" onClick={onDownload}>Download</button></>}
                    {state === "downloaded" && <><button type="button" className="rounded px-2 py-1 text-[10px] text-zinc-400" onClick={onClose}>Later</button><button type="button" className="rounded bg-melodify-primary px-2.5 py-1 text-[10px] font-medium text-black" onClick={onInstall}>Install and restart</button></>}
                    {state === "error" && <><button type="button" className="rounded px-2 py-1 text-[10px] text-zinc-400" onClick={onClose}>Dismiss</button><button type="button" className="rounded border border-zinc-600 px-2.5 py-1 text-[10px]" onClick={onRetry}>Try again</button></>}
                </div>
            </section>
        </div>
    );
}

export default function UITestPage() {
    const [route, setRoute] = useState<Route>("home");
    const [spotifyState, setSpotifyState] = useState<SpotifyState>("loading");
    const [kickState, setKickState] = useState<KickState>("loading");
    const [twitchState, setTwitchState] = useState<TwitchState>("loading");
    const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
    const [updateState, setUpdateState] = useState<UpdateState>("idle");
    const [settingsState, setSettingsState] = useState("defaults");
    const [setupService, setSetupService] = useState<SetupService>("none");
    const [credentialFormState, setCredentialFormState] = useState<CredentialFormState>("empty");
    const [songRequests, setSongRequests] = useState(0);
    const [showLastRequest, setShowLastRequest] = useState(false);
    const [updateProgress, setUpdateProgress] = useState(0);
    const [showUpdatePreview, setShowUpdatePreview] = useState(false);
    const updateProgressRef = useRef(0);
    const updateCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateDownloadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearMockUpdateTimers = () => {
        if (updateCheckTimerRef.current) clearTimeout(updateCheckTimerRef.current);
        if (updateDownloadTimerRef.current) clearInterval(updateDownloadTimerRef.current);
        updateCheckTimerRef.current = null;
        updateDownloadTimerRef.current = null;
    };

    useEffect(() => () => {
        if (updateCheckTimerRef.current) clearTimeout(updateCheckTimerRef.current);
        if (updateDownloadTimerRef.current) clearInterval(updateDownloadTimerRef.current);
    }, []);

    const setPreset = (id: string) => {
        const preset = UI_TEST_PRESETS.find((item) => item.id === id);
        if (!preset) return;
        clearMockUpdateTimers();
        setSpotifyState(preset.spotify);
        setKickState(preset.kick);
        setTwitchState(preset.twitch);
        setSongRequests(preset.requestCount);
        setShowLastRequest(preset.lastRequest);
        setUpdateState("idle");
        setUpdateProgress(0);
        updateProgressRef.current = 0;
        setShowUpdatePreview(false);
        setSetupService("none");
        setCredentialFormState("empty");
    };

    const simulateUpdateCheck = () => {
        clearMockUpdateTimers();
        setUpdateProgress(0);
        updateProgressRef.current = 0;
        setShowUpdatePreview(true);
        setUpdateState("checking");
        updateCheckTimerRef.current = setTimeout(() => {
            updateCheckTimerRef.current = null;
            setUpdateState("available");
        }, 900);
    };

    const simulateUpdateDownload = () => {
        clearMockUpdateTimers();
        updateProgressRef.current = 0;
        setUpdateProgress(0);
        setUpdateState("downloading");
        updateDownloadTimerRef.current = setInterval(() => {
            const next = advanceMockDownloadProgress(updateProgressRef.current);
            updateProgressRef.current = next.percent;
            setUpdateProgress(next.percent);
            if (next.complete) {
                if (updateDownloadTimerRef.current) clearInterval(updateDownloadTimerRef.current);
                updateDownloadTimerRef.current = null;
                setUpdateState("downloaded");
            }
        }, 350);
    };

    const selectUpdateState = (value: string) => {
        clearMockUpdateTimers();
        const nextState = value as UpdateState;
        const nextProgress = nextState === "downloading" ? 45 : nextState === "downloaded" ? 100 : 0;
        updateProgressRef.current = nextProgress;
        setUpdateProgress(nextProgress);
        setUpdateState(nextState);
        setShowUpdatePreview(nextState !== "idle");
    };

    const finishMockInstall = () => {
        clearMockUpdateTimers();
        setShowUpdatePreview(false);
        setUpdateState("idle");
        updateProgressRef.current = 0;
        setUpdateProgress(0);
    };

    const services: MockServiceState[] = [
        spotifyStates[spotifyState],
        kickStates[kickState],
        twitchStates[twitchState],
    ];
    const activeSettingsState = UI_TEST_SETTINGS_STATES[settingsSection].includes(settingsState as never)
        ? settingsState
        : UI_TEST_SETTINGS_STATES[settingsSection][0];

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-zinc-900 text-white">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700/70 bg-zinc-900 px-4 py-3">
                <div className="flex items-center gap-2">
                    <TestTube size={18} className="text-melodify-primary" aria-hidden="true" />
                    <div><h1 className="m-0 text-sm font-semibold">UI state lab</h1><p className="m-0 text-[10px] text-zinc-500">Development only · mock data · no live integrations</p></div>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-[10px] text-zinc-400">Preview screen
                        <select value={route} onChange={(event) => setRoute(event.target.value as Route)} className="ml-2 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-100">
                            {UI_TEST_ROUTES.map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
                        </select>
                    </label>
                    <button type="button" className="rounded border border-zinc-600 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800" onClick={() => setPreset("first-run")}><RotateCcw size={12} className="mr-1 inline" />Reset</button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                <aside className="w-[260px] shrink-0 overflow-y-auto border-r border-zinc-700/70 bg-zinc-900 p-3" aria-label="State controls">
                    <h2 className="mb-2 text-[11px] font-semibold text-zinc-200">Scenario presets</h2>
                    <div className="flex flex-col gap-1">
                        {UI_TEST_PRESETS.map((preset) => <button key={preset.id} type="button" className="rounded px-2 py-1.5 text-left text-[10px] text-zinc-300 hover:bg-zinc-800" onClick={() => setPreset(preset.id)}>{preset.label}</button>)}
                    </div>
                    <div className="my-3 border-t border-zinc-700" />
                    <h2 className="mb-2 text-[11px] font-semibold text-zinc-200">Service states</h2>
                    <div className="space-y-2">
                        <SelectControl label="Spotify" value={spotifyState} options={UI_TEST_CONNECTION_STATES.spotify} onChange={(value) => setSpotifyState(value as SpotifyState)} />
                        <SelectControl label="Kick" value={kickState} options={UI_TEST_CONNECTION_STATES.kick} onChange={(value) => setKickState(value as KickState)} />
                        <SelectControl label="Twitch" value={twitchState} options={UI_TEST_CONNECTION_STATES.twitch} onChange={(value) => setTwitchState(value as TwitchState)} />
                        <SelectControl label="Update dialog" value={updateState} options={UI_TEST_UPDATE_STATES} onChange={selectUpdateState} />
                        <SelectControl label="Credential form" value={setupService} options={["none", "Spotify", "Kick", "Twitch"]} onChange={(value) => setSetupService(value as SetupService)} />
                        <SelectControl label="Credential form state" value={credentialFormState} options={UI_TEST_CREDENTIAL_FORM_STATES} onChange={(value) => setCredentialFormState(value as CredentialFormState)} />
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" className="rounded border border-zinc-600 px-2 py-1.5 text-[10px] text-zinc-300 hover:bg-zinc-800" onClick={simulateUpdateCheck}>Run update flow</button>
                            <button type="button" className="rounded border border-red-500/40 px-2 py-1.5 text-[10px] text-red-300 hover:bg-red-500/10" onClick={() => selectUpdateState("error")}>Force error</button>
                        </div>
                        {updateState !== "idle" && !showUpdatePreview && <button type="button" className="w-full rounded px-2 py-1 text-left text-[10px] text-melodify-primary hover:bg-zinc-800" onClick={() => setShowUpdatePreview(true)}>Show current update state</button>}
                    </div>
                    <div className="my-3 border-t border-zinc-700" />
                    <h2 className="mb-2 text-[11px] font-semibold text-zinc-200">Overview data</h2>
                    <label className="block text-[10px] text-zinc-400">Request count<input type="number" min="0" value={songRequests} onChange={(event) => setSongRequests(Math.max(0, Number.parseInt(event.target.value, 10) || 0))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-[11px] text-white" /></label>
                    <label className="mt-2 flex items-center gap-2 text-[10px] text-zinc-300"><input type="checkbox" checked={showLastRequest} onChange={(event) => setShowLastRequest(event.target.checked)} />Show sample last request</label>
                    {route === "settings" && <>
                        <div className="my-3 border-t border-zinc-700" />
                        <h2 className="mb-2 text-[11px] font-semibold text-zinc-200">Settings state</h2>
                        <SelectControl label="Section" value={settingsSection} options={UI_TEST_SETTINGS_SECTIONS} onChange={(value) => { const next = value as SettingsSection; setSettingsSection(next); setSettingsState(UI_TEST_SETTINGS_STATES[next][0]); }} />
                        <SelectControl label="Variant" value={activeSettingsState} options={UI_TEST_SETTINGS_STATES[settingsSection]} onChange={setSettingsState} />
                    </>}
                    <p className="mt-4 border-l-2 border-melodify-secondary pl-2 text-[9px] leading-4 text-zinc-500">Controls in this window only change the preview. They never read or write the real app profile.</p>
                </aside>

                <main className="relative min-w-0 flex-1 overflow-auto bg-zinc-950 p-5" aria-label="UI state preview">
                    <div className="mb-4 flex items-end justify-between gap-3 border-b border-zinc-700/70 pb-3">
                        <div><p className="m-0 text-[10px] text-zinc-500">PREVIEW / {titleFor(route)}</p><h2 className="m-0 mt-1 text-base font-semibold text-white">{route === "home" ? "Home screen" : "Settings"}</h2></div>
                        <span className="text-right text-[9px] text-zinc-500">Sample content · preview actions do not contact services</span>
                    </div>

                    {route === "home" && <>
                        <div className="mb-5 flex items-center justify-between gap-4 border-b border-zinc-700 py-3">
                            <div><p className="m-0 text-[11px] text-zinc-400">Requests today · this session</p><p className="m-0 mt-1 text-3xl font-semibold text-melodify-primary">{songRequests}</p></div>
                            <div className="text-right">{showLastRequest ? <><p className="m-0 text-[10px] text-zinc-500">Last processed · sample</p><p className="m-0 mt-1 text-xs text-zinc-100">Midnight City <span className="text-zinc-400">by M83</span></p></> : <p className="m-0 max-w-48 text-[11px] text-zinc-500">No request in the sample session.</p>}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {services.map((service) => <MockService key={service.name} service={service} compact setupOpen={setupService === service.name} credentialState={credentialFormState} />)}
                        </div>
                        <p className="mb-0 mt-4 text-[10px] text-zinc-500">The activity count is sample data; the real counter is session-memory only.</p>
                    </>}

                    {route === "settings" && <div className="max-w-[700px]">
                        <nav className="mb-4 flex flex-wrap gap-1 border-b border-zinc-700" aria-label="Settings preview sections">
                            {UI_TEST_SETTINGS_SECTIONS.map((section) => <button key={section} type="button" className={`border-b-2 px-2.5 py-2 text-[10px] ${settingsSection === section ? "border-melodify-primary text-white" : "border-transparent text-zinc-400 hover:text-white"}`} onClick={() => { setSettingsSection(section); setSettingsState(UI_TEST_SETTINGS_STATES[section][0]); }}>{titleFor(section)}</button>)}
                        </nav>
                        <div className="space-y-3"><div className="mb-2"><p className="m-0 text-[10px] text-zinc-500">{titleFor(settingsSection)}</p><p className="m-0 mt-1 text-[11px] text-zinc-300">State: {titleFor(activeSettingsState)}</p></div><MockSettingsContent section={settingsSection} state={activeSettingsState} /></div>
                    </div>}

                    {showUpdatePreview && <MockUpdateDialog
                        state={updateState}
                        progress={updateProgress}
                        onClose={() => setShowUpdatePreview(false)}
                        onDownload={simulateUpdateDownload}
                        onRetry={simulateUpdateCheck}
                        onInstall={finishMockInstall}
                    />}
                </main>
            </div>
        </div>
    );
}
