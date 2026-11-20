import { useRef, useState } from "react";
import { Button, IconButton, Input, Select, Textarea, Toggle, StatusChip, SettingCard, SettingGroup, SaveDock, SectionNav, ServiceCard, StudioTheme, CREDENTIAL_STATUS_LABELS } from "../index";
import type { CredentialStatus, StudioThemeName } from "../index";
import { FolderIcon } from "../icons";
import "./preview.css";

export interface StudioPreviewProps { initialTheme?: StudioThemeName }

/** Not exported by the production barrel or wired to a product entry point. */
export function StudioPreview(props: StudioPreviewProps) {
    if (process.env.NODE_ENV === "production") return null;
    return <PreviewContents {...props} />;
}

function PreviewContents({ initialTheme = "graphite" }: StudioPreviewProps) {
    const [theme, setTheme] = useState(initialTheme);
    const [activations, setActivations] = useState(0);
    const [errorShown, setErrorShown] = useState(true);
    const [language, setLanguage] = useState("en");
    const [fileEnabled, setFileEnabled] = useState(true);
    const [trayEnabled, setTrayEnabled] = useState(false);
    const [step, setStep] = useState(0);
    const [activeSection, setActiveSection] = useState("general");
    const [saved, setSaved] = useState("Local example");
    const [draft, setDraft] = useState("Local example");
    const [apiPending, setApiPending] = useState(false);
    const [serviceNotice, setServiceNotice] = useState("");
    const heading = useRef<HTMLHeadingElement>(null);
    const client = useRef<HTMLInputElement>(null);
    const sequence: CredentialStatus[] = ["unverified", "verifying", "verified"];
    const status = sequence[step];
    const groups = [
        { id: "application", label: "Application", items: [{ id: "general", label: "General" }, { id: "api", label: "API Keys" }] },
        { id: "requests", label: "Requests", items: [{ id: "requests", label: "Requests" }, { id: "commands", label: "Commands" }] },
        { id: "diagnostics", label: "Diagnostics", items: [{ id: "logs", label: "Logs" }, { id: "debug", label: "Debug" }] },
    ];
    return (
        <StudioTheme theme={theme} className="studio-preview" data-preview-ready="true">
            <div className="studio-preview-wrap">
                <header className="studio-preview-header">
                    <div><h1 ref={heading} id="preview-heading" tabIndex={-1}>Studio primitives</h1><p>Development component harness. Local presentation state only; no provider, file, OS or preference calls.</p></div>
                    <div className="studio-preview-themes" role="group" aria-label="Preview theme">
                        {(["graphite", "light", "dark"] as const).map(choice => <Button key={choice} size="small" variant={choice === theme ? "primary" : "ghost"} aria-pressed={choice === theme} onClick={() => setTheme(choice)} data-theme-choice={choice}>{choice === "graphite" ? "Graphite" : choice === "light" ? "Light" : "Dark"}</Button>)}
                    </div>
                </header>

                <SettingCard heading="Controls" headingLevel={2} id="preview-controls">
                    <SettingGroup heading="Buttons" headingLevel={3}>
                        <div className="studio-preview-row">
                            <Button variant="primary" data-testid="primary" ref={node => { if (node) node.dataset.refAttached = "true"; }} onClick={() => setActivations(n => n + 1)}>Primary</Button>
                            <Button>Secondary</Button><Button variant="ghost">Ghost</Button><Button size="small">Small</Button>
                            <IconButton label="Choose path" title="Choose path" onClick={() => setActivations(n => n + 1)}><FolderIcon /></IconButton>
                            <Button disabled data-testid="disabled" onClick={() => setActivations(n => n + 1)}>Disabled</Button>
                            <Button loading data-testid="loading" onClick={() => setActivations(n => n + 1)}>Loading</Button>
                        </div>
                        <p className="studio-preview-note" data-testid="activations">Activations: {activations}. The folder action increments this counter only.</p>
                    </SettingGroup>
                    <SettingGroup heading="Fields and feedback" headingLevel={3}>
                        <div className="studio-preview-fields">
                            <Input id="preview-client" ref={client} label="Client ID" helper="Use an example value in this harness." defaultValue="studio-example-id" required />
                            <Input id="preview-secret" label="Client Secret" type="password" placeholder="No stored secret" autoComplete="new-password" />
                            <Select id="preview-language" label="Interface language" value={language} options={[{ value: "en", label: "English" }, { value: "tr", label: "Türkçe" }]} onChange={setLanguage} ref={node => { if (node) node.dataset.refAttached = "true"; }} />
                            <Input id="preview-error" label="Client ID with error" helper="Example field-level validation feedback." error={errorShown ? "Check the Client ID and try again." : undefined} defaultValue="invalid-example" />
                            <Input id="preview-disabled-field" label="Unavailable field" disabled defaultValue="Readable disabled value" />
                            <Textarea id="preview-reply" label="Reply template" rows={3} defaultValue="Added {title} by {artist}" helper="Textarea uses the same label/helper/focus system." ref={node => { if (node) node.dataset.refAttached = "true"; }} />
                        </div>
                        <div className="studio-preview-row"><Button size="small" onClick={() => client.current?.focus()} data-testid="focus-input">Focus Client ID</Button><Button size="small" variant="ghost" onClick={() => setErrorShown(v => !v)} data-testid="toggle-error">Toggle error</Button></div>
                    </SettingGroup>
                    <SettingGroup heading="Switches" headingLevel={3}>
                        <Toggle id="preview-file" label="Save current song to file" helper="This switch changes local preview state only." checked={fileEnabled} onCheckedChange={setFileEnabled} ref={node => { if (node) node.dataset.refAttached = "true"; }} />
                        <Toggle id="preview-tray" label="Minimize to tray" checked={trayEnabled} onCheckedChange={setTrayEnabled} />
                        <Toggle id="preview-disabled-switch" label="Automatic updates enabled" helper="Disabled state remains readable." checked disabled />
                    </SettingGroup>
                </SettingCard>

                <SettingCard heading="Credential states and motion" headingLevel={2} id="preview-statuses">
                    <div className="studio-preview-row" data-testid="all-statuses">{(Object.keys(CREDENTIAL_STATUS_LABELS) as CredentialStatus[]).map(value => <StatusChip key={value} status={value} announce={false} />)}</div>
                    <p className="studio-preview-note">Verified is an explicit caller-provided credential state, never inferred from Save. These fixtures do not check a provider.</p>
                    <div className="studio-preview-motion">
                        <div className="studio-preview-motion-status"><StatusChip status={status} data-testid="motion-status" /></div>
                        <Button onClick={() => setStep(n => (n + 1) % sequence.length)} data-testid="next-state">Next state</Button>
                        <Button variant="ghost" onClick={() => setStep(0)} data-testid="reset-state">Reset</Button>
                    </div>
                    <p className="studio-preview-note">Next state: Unverified → Verifying → Verified. Manual presentation sequence; no timer or verification operation. Reduced motion removes the spinner/check motion, not the state changes.</p>
                </SettingCard>

                <SettingGroup heading="Service composition" headingLevel={2} id="preview-services">
                    <ServiceCard service="spotify" status={status} announceStatus={false} actions={<><Button variant="primary" disabled={status !== "verified"} onClick={() => setServiceNotice("Preview callback only; nothing was saved.")}>Save</Button><Button variant="ghost" onClick={() => setServiceNotice("")}>Cancel draft</Button><Button size="small" variant="ghost">Setup guide</Button></>} note={serviceNotice || "Presentation fixture only. Save availability is supplied by the caller, not verification logic in ServiceCard."}>
                        <Input label="Spotify Client ID" defaultValue="example-client-id" />
                        <Input label="Spotify Client Secret" type="password" placeholder="Enter an example value" autoComplete="new-password" />
                    </ServiceCard>
                    <div className="studio-preview-brand-cards"><ServiceCard service="kick" status="needed" announceStatus={false} note="Real icon; no provider wiring." /><ServiceCard service="twitch" status="failed" announceStatus={false} note="Failure is caller-owned; this component does not discard drafts." /></div>
                </SettingGroup>

                <SettingCard heading="Navigation and save dock" headingLevel={2} id="preview-composition">
                    <div className="studio-preview-composition">
                        <SectionNav groups={groups} activeId={activeSection} onSelect={setActiveSection} onHome={() => { setActiveSection("general"); heading.current?.focus(); }} />
                        <div className="studio-preview-docks">
                            <p className="studio-preview-note" data-testid="active-section">Selected example: {activeSection}. Home returns focus to the preview heading.</p>
                            <div className="studio-preview-dock-frame" data-testid="ordinary-dock-frame">
                                <div className="studio-preview-scroll" tabIndex={0} aria-label="Example scroll pane">
                                    <div className="studio-preview-scroll-content"><Input id="preview-draft" label="Local example setting" value={draft} onChange={e => setDraft(e.currentTarget.value)} helper="Save/Discard changes only this harness state." /><p>The footer reserves its own height.</p><p>Scroll this small example to check the dock stays in view.</p></div>
                                </div>
                                <SaveDock dirty={draft !== saved} onSave={() => setSaved(draft)} onDiscard={() => setDraft(saved)} data-testid="ordinary-dock" />
                            </div>
                            <Button size="small" variant="ghost" onClick={() => setApiPending(v => !v)} data-testid="api-draft-toggle">Toggle API draft example</Button>
                            <SaveDock mode="api" draftPending={apiPending} data-testid="api-dock" />
                        </div>
                    </div>
                </SettingCard>
            </div>
        </StudioTheme>
    );
}
