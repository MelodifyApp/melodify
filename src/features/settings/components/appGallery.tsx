import "./settingsPreviewEnvironment";
import "@/core/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Inbox, RefreshCw } from "lucide-react";
import Settings, { type SettingsSectionId } from "./Settings";
import CredentialSetupDialog from "./sections/CredentialSetupDialog";
import { initializeCredentialStatusStore } from "@/features/settings/credentialStatusStore";
import HomePage from "@/ui/components/HomePage";
import Titlebar from "@/ui/components/Titlebar";
import InlineError from "@/ui/components/InlineError";
import {
    Button,
    IconButton,
    Input,
    Select,
    ServiceCard,
    StatusChip,
    StudioTheme,
    Toggle,
} from "@/ui/components/studio";
import type { StudioLookName, StudioThemeName } from "@/ui/components/studio";
import "./appGallery.css";

type StoryId = string;

interface Story {
    title: string;
    description: string;
    params: Record<string, string>;
}

const STORIES: Record<StoryId, Story> = {
    "home-populated": {
        title: "Home · Populated",
        description: "Fixture session with a now-playing track, queue and connection rail.",
        params: { screen: "home", home: "populated" },
    },
    "home-empty": {
        title: "Home · Empty queue",
        description: "Session loaded with no queued requests.",
        params: { screen: "home", home: "empty" },
    },
    "home-loading": {
        title: "Home · Loading",
        description: "Session request is still pending.",
        params: { screen: "home", home: "loading" },
    },
    "home-error": {
        title: "Home · Error",
        description: "Session request failed and recovery is offered.",
        params: { screen: "home", home: "error" },
    },
    "settings-general": {
        title: "Settings · General",
        description: "Application, language and update preferences with silent auto-save.",
        params: { screen: "settings", section: "general" },
    },
    "settings-secrets": {
        title: "Settings · API Keys",
        description: "State-only service cards; setup happens in the guided dialog.",
        params: { screen: "settings", section: "secrets", scenario: "not-set-up" },
    },
    "settings-requests": {
        title: "Settings · Song Requests",
        description: "Reply templates, cooldowns, platform rewards and moderators.",
        params: { screen: "settings", section: "requests" },
    },
    "settings-commands": {
        title: "Settings · Commands",
        description: "Command cards with aliases, replies and permissions.",
        params: { screen: "settings", section: "commands" },
    },
    "settings-logs": {
        title: "Settings · Logs",
        description: "Filterable session log with level counts and live rows.",
        params: { screen: "settings", section: "logs", logs: "populated" },
    },
    "settings-debug": {
        title: "Settings · Debug",
        description: "Runtime diagnostics and internal test actions.",
        params: { screen: "settings", section: "debug" },
    },
    "api-not-set-up": {
        title: "API Keys · Not set up",
        description: "First-run state: one clean card per service and a single Set up action.",
        params: { screen: "settings", section: "secrets", scenario: "not-set-up" },
    },
    "api-checking": {
        title: "API Keys · Checking",
        description: "Stored credentials are being verified at startup; no Unverified flash.",
        params: { screen: "settings", section: "secrets", scenario: "checking" },
    },
    "api-connected": {
        title: "API Keys · Connected",
        description: "Verified pair with a quiet Replace credentials action.",
        params: { screen: "settings", section: "secrets", scenario: "connected" },
    },
    "api-failed": {
        title: "API Keys · Couldn't verify",
        description: "Provider rejected the stored pair; Update credentials reopens the dialog.",
        params: { screen: "settings", section: "secrets", scenario: "failed" },
    },
    "api-unavailable": {
        title: "API Keys · Couldn't reach provider",
        description: "Verification could not reach the provider; Try again retries it.",
        params: { screen: "settings", section: "secrets", scenario: "unavailable" },
    },
    "api-mixed": {
        title: "API Keys · Mixed",
        description: "Connected, rejected and unreachable states side by side.",
        params: { screen: "settings", section: "secrets", scenario: "mixed" },
    },
    components: {
        title: "Components",
        description: "Real Studio primitives, their variants and their states.",
        params: { screen: "components" },
    },
    "motion-toggle": {
        title: "Motion · Toggle",
        description:
            "The same toggle at four timings. Click each one and compare the settle.",
        params: { screen: "motion" },
    },
};

const GROUPS: Array<{ title: string; ids: StoryId[] }> = [
    {
        title: "Home",
        ids: ["home-populated", "home-empty", "home-loading", "home-error"],
    },
    {
        title: "Settings",
        ids: [
            "settings-general",
            "settings-secrets",
            "settings-requests",
            "settings-commands",
            "settings-logs",
            "settings-debug",
        ],
    },
    {
        title: "API Keys states",
        ids: [
            "api-not-set-up",
            "api-checking",
            "api-connected",
            "api-failed",
            "api-unavailable",
            "api-mixed",
        ],
    },
    { title: "Components", ids: ["components"] },
    { title: "Motion", ids: ["motion-toggle"] },
];

const THEMES: Array<{ value: StudioThemeName; label: string }> = [
    { value: "graphite", label: "Graphite" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
];

const WIDTHS = [1200, 640, 480];
const FRAME_HEIGHT = 800;
const LOOKS: Array<{ value: StudioLookName; label: string }> = [
    { value: "studio", label: "Studio" },
    { value: "aurora", label: "Aurora" },
    { value: "dusk", label: "Dusk" },
    { value: "bloom", label: "Bloom" },
];

function normalizeTheme(value: string | null): StudioThemeName {
    return value === "light" || value === "dark" ? value : "graphite";
}

export function StudioPreview() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("embed") === "1") {
        return <EmbeddedApp params={params} />;
    }
    return <GalleryShell />;
}

/* ------------------------------------------------------------------ */
/* Embedded app                                                        */
/* ------------------------------------------------------------------ */

function EmbeddedApp({ params }: { params: URLSearchParams }) {
    const theme = normalizeTheme(params.get("theme"));
    const requestedLook = params.get("look") || "dusk";
    const look: StudioLookName = LOOKS.some(
        (option) => option.value === requestedLook
    )
        ? (requestedLook as StudioLookName)
        : "dusk";
    const initialScreen = params.get("screen") || "home";
    const [screen, setScreen] = useState(initialScreen);
    const section = (params.get("section") || "general") as SettingsSectionId;

    useEffect(() => {
        void initializeCredentialStatusStore(
            window.electronAPI as unknown as Parameters<
                typeof initializeCredentialStatusStore
            >[0]
        );
    }, []);

    return (
        <div className="gallery-embed">
            <StudioTheme
                theme={theme}
                look={look}
                className={
                    look === "studio" || look === "dusk"
                        ? "studio-app"
                        : `studio-app look-rich look-${look}`
                }
            >
                <Titlebar
                    theme={theme}
                    onMinimize={() => undefined}
                    onClose={() => undefined}
                    onSettings={() => setScreen("settings")}
                    onHome={() => setScreen("home")}
                    showSettings={screen !== "settings"}
                    canMaximize={false}
                />
                {screen === "settings" && (
                    <Settings
                        onClose={() => setScreen("home")}
                        theme={theme}
                        requestedSection={section}
                    />
                )}
                {screen === "home" && (
                    <HomePage
                        theme={theme}
                        onOpenSettings={() => setScreen("settings")}
                    />
                )}
                {screen === "components" && <ComponentCatalog />}
                {screen === "motion" && <MotionLab />}
            </StudioTheme>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Motion lab                                                          */
/* ------------------------------------------------------------------ */

function MotionLab() {
    const [current, setCurrent] = useState(true);
    const [slow, setSlow] = useState(true);
    const [soft, setSoft] = useState(true);
    const [spring, setSpring] = useState(true);

    return (
        <div className="gallery-catalog">
            <header className="cat-head">
                <h1>Toggle motion</h1>
                <p>
                    The same Studio toggle at four timings. Click each one and
                    compare how it settles. Everything else is unchanged.
                </p>
            </header>

            <section className="cat-section">
                <div className="cat-stack">
                    <div className="motion-toggle-lab motion-toggle-current">
                        <Toggle
                            label="Current"
                            helper="180ms · studio ease"
                            checked={current}
                            onCheckedChange={setCurrent}
                        />
                    </div>
                    <div className="motion-toggle-lab motion-toggle-slow">
                        <Toggle
                            label="Slow"
                            helper="260ms · studio ease"
                            checked={slow}
                            onCheckedChange={setSlow}
                        />
                    </div>
                    <div className="motion-toggle-lab motion-toggle-soft">
                        <Toggle
                            label="Soft settle"
                            helper="300ms · cubic-bezier(.16, 1, .3, 1)"
                            checked={soft}
                            onCheckedChange={setSoft}
                        />
                    </div>
                    <div className="motion-toggle-lab motion-toggle-spring">
                        <Toggle
                            label="Light spring"
                            helper="300ms · cubic-bezier(.3, 1.15, .5, 1)"
                            checked={spring}
                            onCheckedChange={setSpring}
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Component catalogue                                                 */
/* ------------------------------------------------------------------ */

function ComponentCatalog() {
    const [checked, setChecked] = useState(true);
    const [language, setLanguage] = useState("en");
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
        <div className="gallery-catalog">
            <header className="cat-head">
                <h1>Components</h1>
                <p>
                    Real Studio primitives from the product source. Hover, focus,
                    toggle, type and open the dialog.
                </p>
            </header>

            <section className="cat-section">
                <h2>Buttons</h2>
                <div className="cat-row">
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="default">Default</Button>
                    <Button variant="ghost">Ghost</Button>
                </div>
                <div className="cat-row">
                    <Button size="small">Small</Button>
                    <Button size="small" variant="primary">
                        Small primary
                    </Button>
                    <IconButton label="Refresh">
                        <RefreshCw size={16} />
                    </IconButton>
                    <Button loading>Loading</Button>
                </div>
                <div className="cat-row">
                    <Button disabled>Disabled</Button>
                    <Button variant="primary" disabled>
                        Disabled primary
                    </Button>
                    <Button variant="ghost" disabled>
                        Disabled ghost
                    </Button>
                </div>
            </section>

            <section className="cat-section">
                <h2>Fields</h2>
                <div className="cat-grid-2">
                    <Input label="Client ID" placeholder="Enter your Client ID" />
                    <Input
                        label="Client Secret"
                        type="password"
                        placeholder="Enter your Client Secret"
                    />
                    <Input
                        label="With helper"
                        defaultValue="spotify-client-id"
                        helper="Find this in the provider dashboard."
                    />
                    <Input
                        label="Invalid field"
                        defaultValue=""
                        error="This field is required."
                    />
                    <Input label="Disabled" defaultValue="read-only-value" disabled />
                </div>
            </section>

            <section className="cat-section">
                <h2>Toggles</h2>
                <div className="cat-stack">
                    <Toggle
                        label="Check for updates at startup"
                        helper="Download and install manually."
                        checked={checked}
                        onCheckedChange={setChecked}
                    />
                    <Toggle
                        label="Minimize to tray"
                        helper="Closing the window keeps Melodify running."
                        checked={false}
                    />
                    <Toggle label="Disabled toggle" checked disabled />
                </div>
            </section>

            <section className="cat-section">
                <h2>Select</h2>
                <div className="cat-grid-2">
                    <Select
                        label="Interface Language"
                        value={language}
                        options={[
                            { value: "en", label: "English" },
                            { value: "tr", label: "Türkçe" },
                        ]}
                        onChange={(value) => setLanguage(value)}
                    />
                    <Select
                        label="Disabled"
                        value="en"
                        options={[{ value: "en", label: "English" }]}
                        onChange={() => undefined}
                        disabled
                    />
                </div>
            </section>

            <section className="cat-section">
                <h2>Status chips</h2>
                <div className="cat-row">
                    <StatusChip status="verified" label="Connected" />
                    <StatusChip status="needed" label="Not set up" />
                    <StatusChip status="verifying" label="Checking…" />
                    <StatusChip status="unverified" />
                    <StatusChip status="failed" label="Couldn't verify" />
                    <StatusChip status="unavailable" label="Couldn't reach provider" />
                    <StatusChip status="api-draft" />
                </div>
            </section>

            <section className="cat-section">
                <h2>Service cards</h2>
                <div className="cat-cards">
                    <ServiceCard
                        service="spotify"
                        status="needed"
                        statusLabel="Not set up"
                        description="Playback"
                        actions={<Button variant="primary">Set up</Button>}
                    />
                    <ServiceCard
                        service="kick"
                        status="verified"
                        statusLabel="Connected"
                        description="Chat and requests"
                        actions={<Button variant="ghost">Replace credentials</Button>}
                    />
                    <ServiceCard
                        service="twitch"
                        status="failed"
                        statusLabel="Couldn't verify"
                        description="Chat and requests"
                        actions={<Button variant="primary">Update credentials</Button>}
                    />
                    <ServiceCard
                        service="spotify"
                        status="unavailable"
                        statusLabel="Couldn't reach provider"
                        description="Playback"
                        actions={<Button variant="secondary">Try again</Button>}
                    />
                    <ServiceCard
                        service="kick"
                        status="verifying"
                        statusLabel="Checking…"
                        description="Chat and requests"
                    />
                </div>
            </section>

            <section className="cat-section">
                <h2>Feedback</h2>
                <div className="cat-stack">
                    <InlineError message="Please enter a valid Client ID and Client Secret." />
                    <div className="studio-empty-state">
                        <Inbox aria-hidden="true" />
                        <h3>No logs yet</h3>
                        <p>Entries will appear here as the app runs.</p>
                    </div>
                    <div className="cat-row">
                        <span className="studio-spinner" aria-hidden="true" />
                        <span className="cat-meta">Inline spinner</span>
                    </div>
                </div>
            </section>

            <section className="cat-section">
                <h2>Setup dialog</h2>
                <p className="cat-desc">
                    The real two-step dialog. Connect uses the mock bridge and
                    accepts the example values.
                </p>
                <Button variant="primary" onClick={() => setDialogOpen(true)}>
                    Open setup dialog
                </Button>
                {dialogOpen && (
                    <CredentialSetupDialog
                        serviceId="spotify"
                        mode="setup"
                        initialClientId=""
                        config={{}}
                        dashboardUrl="https://developer.spotify.com/dashboard"
                        redirectUri="http://127.0.0.1:8888/callback"
                        onClose={() => setDialogOpen(false)}
                        onConnected={() => setDialogOpen(false)}
                    />
                )}
            </section>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Gallery shell                                                       */
/* ------------------------------------------------------------------ */

function GalleryShell() {
    const [storyId, setStoryId] = useState<StoryId>(() => {
        const requested = new URLSearchParams(window.location.search).get(
            "story"
        );
        return requested && STORIES[requested] ? requested : "home-populated";
    });
    const [theme, setTheme] = useState<StudioThemeName>("graphite");
    const [look, setLook] = useState("dusk");
    const [width, setWidth] = useState(1200);
    const [scale, setScale] = useState(1);
    const stageRef = useRef<HTMLDivElement>(null);
    const story = STORIES[storyId] ?? STORIES["home-populated"];

    const selectStory = (id: StoryId) => {
        setStoryId(id);
        window.history.replaceState(null, "", `?story=${encodeURIComponent(id)}`);
    };

    const src = useMemo(() => {
        const base = window.location.href.split("?")[0].split("#")[0];
        const params = new URLSearchParams({
            embed: "1",
            theme,
            look,
            ...story.params,
        });
        return `${base}?${params.toString()}`;
    }, [story, theme, look]);

    useEffect(() => {
        const element = stageRef.current;
        if (!element) return;
        const update = () => {
            const rect = element.getBoundingClientRect();
            setScale(
                Math.min(
                    1,
                    (rect.width - 48) / width,
                    (rect.height - 48) / FRAME_HEIGHT
                )
            );
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [width]);

    return (
        <div className="gal-shell">
            <aside className="gal-nav">
                <div className="gal-brand">
                    <span className="gal-mark" aria-hidden="true">
                        M
                    </span>
                    <div>
                        <strong>Melodify Live</strong>
                        <small>UI gallery</small>
                    </div>
                </div>

                <nav className="gal-groups" aria-label="Stories">
                    {GROUPS.map((group) => (
                        <section key={group.title} className="gal-group">
                            <h2>{group.title}</h2>
                            {group.ids.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={
                                        id === storyId ? "gal-item is-active" : "gal-item"
                                    }
                                    aria-current={id === storyId ? "page" : undefined}
                                    onClick={() => selectStory(id)}
                                >
                                    {STORIES[id].title.split(" · ").slice(-1)[0]}
                                </button>
                            ))}
                        </section>
                    ))}
                </nav>

                <p className="gal-note">
                    Real components, mock bridge. No live providers or credentials.
                </p>
            </aside>

            <main className="gal-main">
                <header className="gal-top">
                    <div className="gal-heading">
                        <h1>{story.title}</h1>
                        <p>{story.description}</p>
                    </div>
                    <div className="gal-controls">
                        <Segmented
                            label="Look"
                            value={look}
                            options={LOOKS}
                            onChange={setLook}
                        />
                        <Segmented
                            label="Theme"
                            value={theme}
                            options={THEMES.map((item) => ({
                                value: item.value,
                                label: item.label,
                            }))}
                            onChange={(value) => setTheme(normalizeTheme(value))}
                        />
                        <Segmented
                            label="Width"
                            value={String(width)}
                            options={WIDTHS.map((value) => ({
                                value: String(value),
                                label: String(value),
                            }))}
                            onChange={(value) => setWidth(Number(value))}
                        />
                        <button
                            type="button"
                            className="gal-reload"
                            aria-label="Reload story"
                            onClick={() => {
                                const frame = document.getElementById(
                                    "gal-frame"
                                ) as HTMLIFrameElement | null;
                                if (frame) frame.src = src;
                            }}
                        >
                            <RefreshCw size={15} />
                        </button>
                        <a className="gal-open" href={src} target="_blank" rel="noreferrer">
                            <ExternalLink size={14} /> Open
                        </a>
                    </div>
                </header>

                <div className="gal-stage" ref={stageRef}>
                    <div
                        className="gal-frame"
                        style={{
                            width: width * scale,
                            height: FRAME_HEIGHT * scale,
                        }}
                    >
                        <iframe
                            id="gal-frame"
                            key={src}
                            title={story.title}
                            src={src}
                            style={{
                                width,
                                height: FRAME_HEIGHT,
                                transform: `scale(${scale})`,
                            }}
                        />
                    </div>
                </div>

                <footer className="gal-foot">
                    <span>
                        {width} × {FRAME_HEIGHT}
                    </span>
                    <span>{theme}</span>
                    <span>{Math.round(scale * 100)}%</span>
                </footer>
            </main>
        </div>
    );
}

function Segmented({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
}) {
    return (
        <div className="gal-seg" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={option.value === value ? "is-active" : undefined}
                    aria-pressed={option.value === value}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export default StudioPreview;
