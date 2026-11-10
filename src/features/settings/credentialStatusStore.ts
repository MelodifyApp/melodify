import { useSyncExternalStore } from "react";
import {
    deriveCredentialStatus,
    statusAfterVerification,
    type CredentialStatus,
} from "./credentialState";
import { SECRET_SERVICES, type SecretServiceId } from "./secretsSave";

export interface CredentialStatusBridge {
    invoke(channel: string, data?: unknown): Promise<unknown>;
}

export interface StoredCredentialSnapshot {
    clientIds: Record<SecretServiceId, string>;
    storedSecrets: Record<SecretServiceId, boolean>;
}

export interface CredentialStatusSnapshot extends StoredCredentialSnapshot {
    statuses: Partial<Record<SecretServiceId, CredentialStatus>>;
    baselineStatuses: Partial<Record<SecretServiceId, CredentialStatus>>;
    ready: boolean;
}

function serviceIds(): SecretServiceId[] {
    return SECRET_SERVICES.map((service) => service.id);
}

function emptyClientIds(): Record<SecretServiceId, string> {
    return Object.fromEntries(
        SECRET_SERVICES.map((service) => [service.id, ""])
    ) as Record<SecretServiceId, string>;
}

function emptyStoredSecrets(): Record<SecretServiceId, boolean> {
    return Object.fromEntries(
        SECRET_SERVICES.map((service) => [service.id, false])
    ) as Record<SecretServiceId, boolean>;
}

function emptyVersions(): Record<SecretServiceId, number> {
    return Object.fromEntries(
        SECRET_SERVICES.map((service) => [service.id, 0])
    ) as Record<SecretServiceId, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function readClientId(config: Record<string, unknown>, key: string): string {
    const value = config[key];
    return typeof value === "string" ? value.trim() : "";
}

/**
 * Loads the renderer-safe config and the main-process "has stored secret"
 * flags. No secret or token crosses this boundary.
 */
export async function loadStoredCredentialSnapshot(
    bridge: CredentialStatusBridge
): Promise<StoredCredentialSnapshot> {
    let config: Record<string, unknown> = {};
    try {
        const value = await bridge.invoke("config:get");
        if (isRecord(value)) config = value;
    } catch {
        // Keep an empty config: no client ID means no startup verification.
    }

    const storedEntries = await Promise.all(
        SECRET_SERVICES.map(async (service) => {
            try {
                const stored = await bridge.invoke(
                    `${service.id}:hasSecrets`
                );
                return [service.id, stored === true] as const;
            } catch {
                return [service.id, false] as const;
            }
        })
    );
    const storedSecrets = Object.fromEntries(
        storedEntries
    ) as Record<SecretServiceId, boolean>;

    const clientIds = Object.fromEntries(
        SECRET_SERVICES.map((service) => [
            service.id,
            readClientId(config, service.clientIdKey),
        ])
    ) as Record<SecretServiceId, string>;

    return { clientIds, storedSecrets };
}

/**
 * Stored pairs start Unverified until the startup check finishes; services
 * without a pair are Needs credentials.
 */
export function initialCredentialStatuses(
    snapshot: StoredCredentialSnapshot
): Record<SecretServiceId, CredentialStatus> {
    return Object.fromEntries(
        SECRET_SERVICES.map((service) => {
            const clientId = snapshot.clientIds[service.id] ?? "";
            const stored = snapshot.storedSecrets[service.id] === true;
            return [
                service.id,
                stored && clientId
                    ? "unverified"
                    : deriveCredentialStatus({
                          clientId,
                          secretDraft: "",
                          stored,
                          storedClientId: stored ? clientId : "",
                      }),
            ];
        })
    ) as Record<SecretServiceId, CredentialStatus>;
}

function verificationStatus(result: unknown): CredentialStatus {
    if (!isRecord(result) || typeof result.success !== "boolean") {
        return "verification-unavailable";
    }
    if (!result.success) {
        return statusAfterVerification({
            success: false,
            code: typeof result.code === "string" ? result.code : undefined,
        });
    }
    return "verified";
}

/**
 * Verifies stored pairs through the main-process verify channels. The payload
 * contains only the client ID; the main process supplies the stored secret.
 * Services without a stored pair are never sent to the network.
 */
export async function verifyStoredCredentials(
    bridge: CredentialStatusBridge,
    snapshot: StoredCredentialSnapshot,
    onStatus?: (serviceId: SecretServiceId, status: CredentialStatus) => void
): Promise<Record<SecretServiceId, CredentialStatus>> {
    const statuses = initialCredentialStatuses(snapshot);

    await Promise.all(
        SECRET_SERVICES.map(async (service) => {
            const clientId = snapshot.clientIds[service.id] ?? "";
            if (!snapshot.storedSecrets[service.id] || !clientId) return;

            onStatus?.(service.id, "verifying");
            let status: CredentialStatus;
            try {
                const result = await bridge.invoke(service.verifyChannel, {
                    [service.clientIdKey]: clientId,
                });
                status = verificationStatus(result);
            } catch {
                status = "verification-unavailable";
            }
            statuses[service.id] = status;
            onStatus?.(service.id, status);
        })
    );

    return statuses;
}

/**
 * Re-runs the stored-pair verification for one service. Used by the
 * "Try again" card state; no credential draft or secret crosses the bridge.
 */
export async function retryStoredCredentialVerification(
    bridge: CredentialStatusBridge,
    serviceId: SecretServiceId,
    clientIdOverride?: string
): Promise<CredentialStatus> {
    const service = SECRET_SERVICES.find((item) => item.id === serviceId);
    if (!service) return "needs-credentials";
    const clientId =
        (clientIdOverride ?? snapshot.clientIds[serviceId] ?? "").trim();
    if (!snapshot.storedSecrets[serviceId] || !clientId) {
        return "needs-credentials";
    }

    serviceVersions[serviceId] += 1;
    const version = serviceVersions[serviceId];
    publish({
        ...snapshot,
        clientIds: { ...snapshot.clientIds, [serviceId]: clientId },
        statuses: { ...snapshot.statuses, [serviceId]: "verifying" },
    });

    let status: CredentialStatus;
    try {
        const result = await bridge.invoke(service.verifyChannel, {
            [service.clientIdKey]: clientId,
        });
        status = verificationStatus(result);
    } catch {
        status = "verification-unavailable";
    }

    if (serviceVersions[serviceId] !== version) {
        return snapshot.statuses[serviceId] ?? status;
    }

    if (status === "verified") {
        publish({
            ...snapshot,
            statuses: { ...snapshot.statuses, [serviceId]: "verified" },
            baselineStatuses: {
                ...snapshot.baselineStatuses,
                [serviceId]: "verified",
            },
            storedSecrets: { ...snapshot.storedSecrets, [serviceId]: true },
        });
    } else {
        publish({
            ...snapshot,
            statuses: { ...snapshot.statuses, [serviceId]: status },
        });
    }
    return status;
}

function emptySnapshot(): CredentialStatusSnapshot {
    return {
        clientIds: emptyClientIds(),
        storedSecrets: emptyStoredSecrets(),
        statuses: {},
        baselineStatuses: {},
        ready: false,
    };
}

let snapshot = emptySnapshot();
let initializePromise: Promise<CredentialStatusSnapshot> | null = null;
const serviceVersions = emptyVersions();
const listeners = new Set<() => void>();

function publish(next: CredentialStatusSnapshot): void {
    snapshot = next;
    for (const listener of [...listeners]) listener();
}

export function getCredentialStatusSnapshot(): CredentialStatusSnapshot {
    return snapshot;
}

export function subscribeCredentialStatuses(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Boots the session cache once per app open. Verification is repeated in
 * memory on every launch and is never written back as a persisted marker.
 */
export function initializeCredentialStatusStore(
    bridge: CredentialStatusBridge
): Promise<CredentialStatusSnapshot> {
    if (initializePromise) return initializePromise;

    const startupVersions = { ...serviceVersions };
    const run = async () => {
        const stored = await loadStoredCredentialSnapshot(bridge);
        const initial = initialCredentialStatuses(stored);

        const statuses: Partial<Record<SecretServiceId, CredentialStatus>> = {
            ...snapshot.statuses,
        };
        const storedSecrets = { ...snapshot.storedSecrets };
        const clientIds = { ...snapshot.clientIds };
        const initialBaseline = { ...snapshot.baselineStatuses };
        for (const id of serviceIds()) {
            if (serviceVersions[id] !== startupVersions[id]) continue;
            statuses[id] = initial[id];
            storedSecrets[id] = stored.storedSecrets[id];
            clientIds[id] = stored.clientIds[id];
            initialBaseline[id] = initial[id];
        }
        publish({
            ...snapshot,
            clientIds,
            storedSecrets,
            statuses,
            baselineStatuses: initialBaseline,
            ready: true,
        });

        const verified = await verifyStoredCredentials(
            bridge,
            stored,
            (serviceId, status) => {
                if (serviceVersions[serviceId] !== startupVersions[serviceId]) {
                    return;
                }
                publish({
                    ...snapshot,
                    statuses: {
                        ...snapshot.statuses,
                        [serviceId]: status,
                    },
                });
            }
        );

        const finalStatuses = { ...snapshot.statuses };
        const baselineStatuses = { ...snapshot.baselineStatuses };
        for (const id of serviceIds()) {
            if (serviceVersions[id] !== startupVersions[id]) continue;
            finalStatuses[id] = verified[id];
            baselineStatuses[id] = verified[id];
        }
        publish({
            ...snapshot,
            statuses: finalStatuses,
            baselineStatuses,
            ready: true,
        });
        return snapshot;
    };

    initializePromise = run().catch(() => {
        publish({ ...snapshot, ready: true });
        return snapshot;
    });
    return initializePromise;
}

/** A successful save replaces the session baseline and marks the pair stored. */
export function markCredentialSaved(
    serviceId: SecretServiceId,
    clientId?: string
): void {
    serviceVersions[serviceId] += 1;
    publish({
        ...snapshot,
        ...(clientId !== undefined
            ? { clientIds: { ...snapshot.clientIds, [serviceId]: clientId } }
            : {}),
        statuses: { ...snapshot.statuses, [serviceId]: "verified" },
        baselineStatuses: {
            ...snapshot.baselineStatuses,
            [serviceId]: "verified",
        },
        storedSecrets: { ...snapshot.storedSecrets, [serviceId]: true },
    });
}

export function useCredentialStatuses(): CredentialStatusSnapshot {
    return useSyncExternalStore(
        subscribeCredentialStatuses,
        getCredentialStatusSnapshot,
        getCredentialStatusSnapshot
    );
}
