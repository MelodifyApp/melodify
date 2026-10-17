/**
 * Kick chat listener adapter: strictly-gated lifecycle around the negotiated
 * guest transport, plus event routing into the existing sinks.
 *
 * Isolated from Electron/config/Spotify so the focused tests can inject the
 * client and sink callbacks (see test/kick-chat.test.cjs).
 */

import type {
    KickGuestEvent,
    KickGuestMessageEvent,
    KickGuestRewardEvent,
    KickGuestState,
} from "./guestChat";

export interface KickChatClientLike {
    start(): Promise<void>;
    stop(): void;
}

export interface KickChatClientHandlers {
    onEvent(event: KickGuestEvent): void;
    onState(state: KickGuestState): void;
}

export interface KickChatAdapterOptions {
    createClient(handlers: KickChatClientHandlers): KickChatClientLike;
    onMessage(event: KickGuestMessageEvent): void;
    onReward(event: KickGuestRewardEvent): void;
    /** Fired once per connection, only after the client confirms readiness. */
    onConnected(): void;
    /** Fired once per loss of a confirmed connection. */
    onDisconnected(): void;
    onError(error: unknown): void;
    onStateChange?(state: KickGuestState): void;
}

export interface KickChatAdapter {
    start(): void;
    stop(): void;
    isActive(): boolean;
}

/**
 * Owns the current client generation. Stale callbacks from a stopped or
 * replaced client are inert, starts are idempotent, and stop is unconditional.
 */
export function createKickChatAdapter(
    options: KickChatAdapterOptions
): KickChatAdapter {
    let client: KickChatClientLike | null = null;
    let generation = 0;
    let active = false;
    let connected = false;

    const isCurrent = (gen: number): boolean => active && gen === generation;

    function handleState(gen: number, state: KickGuestState): void {
        if (!isCurrent(gen)) return;
        options.onStateChange?.(state);
        if (state === "connected") {
            if (!connected) {
                connected = true;
                options.onConnected();
            }
            return;
        }
        if (state === "reconnecting") {
            if (connected) {
                connected = false;
                options.onDisconnected();
            }
            return;
        }
        // Terminal states end this client generation.
        if (state === "failed" || state === "stopped") {
            if (connected) {
                connected = false;
                options.onDisconnected();
            }
            active = false;
            client = null;
        }
    }

    function handleEvent(gen: number, event: KickGuestEvent): void {
        if (!isCurrent(gen)) return;
        if (event.kind === "message") {
            options.onMessage(event);
            return;
        }
        options.onReward(event);
    }

    function abandonClient(gen: number, error: unknown): void {
        if (!isCurrent(gen)) return;
        const current = client;
        // Deactivate before stopping so the client's own "stopped" state
        // callback cannot produce a second disconnect/error notification.
        active = false;
        client = null;
        const wasConnected = connected;
        connected = false;
        if (current) {
            try {
                current.stop();
            } catch {
                /* the original start failure is the reportable error */
            }
        }
        if (wasConnected) {
            options.onDisconnected();
        }
        options.onError(error);
    }

    return {
        start(): void {
            if (active) return;
            active = true;
            connected = false;
            generation += 1;
            const gen = generation;
            let created: KickChatClientLike;
            try {
                created = options.createClient({
                    onEvent: (event) => handleEvent(gen, event),
                    onState: (state) => handleState(gen, state),
                });
            } catch (error) {
                abandonClient(gen, error);
                return;
            }
            client = created;
            let started: unknown;
            try {
                started = created.start();
            } catch (error) {
                abandonClient(gen, error);
                return;
            }
            Promise.resolve(started).catch((error) => abandonClient(gen, error));
        },
        stop(): void {
            if (!active && !client) return;
            active = false;
            connected = false;
            generation += 1;
            const current = client;
            client = null;
            if (!current) return;
            try {
                current.stop();
            } catch (error) {
                options.onError(error);
            }
        },
        isActive(): boolean {
            return active;
        },
    };
}
