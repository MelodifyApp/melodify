import { randomUUID } from "node:crypto";
import { generateCodeVerifier } from "./pkce";

export type OAuthFlowProvider = "kick" | "twitch" | "spotify";

export interface OAuthFlow {
    provider: OAuthFlowProvider;
    state: string;
    codeVerifier: string;
    createdAt: number;
    expiresAt: number;
}

export type OAuthFlowTake =
    | { status: "ok"; flow: OAuthFlow }
    | "missing"
    | "mismatch"
    | "expired";

export interface OAuthFlowBeginOptions {
    state?: string;
    codeVerifier?: string;
    ttlMs?: number;
    now?: number;
}

export interface OAuthFlowStore {
    begin(provider: OAuthFlowProvider, options?: OAuthFlowBeginOptions): OAuthFlow;
    take(
        provider: OAuthFlowProvider,
        state: unknown,
        now?: number
    ): OAuthFlowTake;
    peek(
        provider: OAuthFlowProvider,
        now?: number
    ): OAuthFlow | null;
    cancel(provider: OAuthFlowProvider): void;
}

export interface OAuthFlowStoreOptions {
    now?: () => number;
    createState?: () => string;
    createVerifier?: () => string;
    defaultTtlMs?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function createOAuthFlowStore(
    options: OAuthFlowStoreOptions = {}
): OAuthFlowStore {
    const flows = new Map<OAuthFlowProvider, OAuthFlow>();
    const now = options.now ?? Date.now;
    const createState = options.createState ?? randomUUID;
    const createVerifier = options.createVerifier ?? (() => generateCodeVerifier());
    const defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;

    return {
        begin(provider, beginOptions = {}) {
            const createdAt = beginOptions.now ?? now();
            const ttlMs = beginOptions.ttlMs ?? defaultTtlMs;
            const flow: OAuthFlow = {
                provider,
                state: beginOptions.state ?? createState(),
                codeVerifier:
                    beginOptions.codeVerifier ?? createVerifier(),
                createdAt,
                expiresAt: createdAt + ttlMs,
            };
            // Replacing a provider's flow invalidates its previous state.
            flows.set(provider, flow);
            return flow;
        },

        take(provider, state, at = now()) {
            const flow = flows.get(provider);
            if (!flow) return "missing";
            if (at >= flow.expiresAt) {
                flows.delete(provider);
                return "expired";
            }
            if (typeof state !== "string" || state !== flow.state) {
                // Never consume or destroy a valid flow for an invalid callback.
                return "mismatch";
            }
            flows.delete(provider);
            return { status: "ok", flow };
        },

        peek(provider, at = now()) {
            const flow = flows.get(provider);
            if (!flow) return null;
            if (at >= flow.expiresAt) {
                flows.delete(provider);
                return null;
            }
            return flow;
        },

        cancel(provider) {
            flows.delete(provider);
        },
    };
}

export const oauthFlows = createOAuthFlowStore();
