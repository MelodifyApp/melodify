import { forwardRef, useId } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../shared/utils";
import SpotifyIcon from "../../../features/spotify/components/SpotifyIcon";
import KickIcon from "../../../features/kick/components/KickIcon";
import TwitchIcon from "../../../features/twitch/components/TwitchIcon";
import { StatusChip } from "./StatusChip";
import type { CredentialStatus } from "./StatusChip";

const services = {
    spotify: { label: "Spotify", Icon: SpotifyIcon },
    kick: { label: "Kick", Icon: KickIcon },
    twitch: { label: "Twitch", Icon: TwitchIcon },
};
export interface ServiceCardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    service: keyof typeof services;
    status: CredentialStatus;
    statusLabel?: string;
    announceStatus?: boolean;
    description?: ReactNode;
    actions?: ReactNode;
    note?: ReactNode;
    headingLevel?: 2 | 3 | 4;
}

/** Presentational only: no credentials, providers, verification or persistence logic. */
export const ServiceCard = forwardRef<HTMLElement, ServiceCardProps>(
    ({ service, status, statusLabel, announceStatus = true, description, actions, note, headingLevel = 3, className, children, ...props }, ref) => {
        const titleId = useId();
        const { label, Icon } = services[service];
        const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
        return (
            <article {...props} ref={ref} className={cn("studio-card", "studio-service-card", className)} aria-labelledby={titleId}>
                <header className="studio-service-head">
                    <div className="studio-service-identity">
                        <span className="studio-service-tile" data-service={service} aria-hidden="true"><Icon aria-hidden="true" tabIndex={-1} /></span>
                        <div className="studio-service-identity-copy">
                            <Heading id={titleId}>{label}</Heading>
                            {description && <p className="studio-service-purpose">{description}</p>}
                        </div>
                    </div>
                    <StatusChip status={status} label={statusLabel} announce={announceStatus} />
                </header>
                {children && <div className="studio-service-fields">{children}</div>}
                {note && <div className="studio-service-note">{note}</div>}
                {actions && <div className="studio-service-actions">{actions}</div>}
            </article>
        );
    }
);
ServiceCard.displayName = "ServiceCard";
