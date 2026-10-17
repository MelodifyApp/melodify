#!/usr/bin/env node
"use strict";

/**
 * Read-only Kick guest-chat receipt probe.
 *
 * Usage (from desktop/):
 *   node --require ts-node/register/transpile-only scripts/kick-guest-probe.cjs \
 *     --channel <slug> [--seconds 120]
 *
 * Uses the production negotiated guest transport
 * (src/features/kick/chat/guestChat.ts). It never imports Config, the chat
 * listener, commandManager, Spotify, or reply code; it never sends chat
 * messages, resolves public channel metadata without credentials, and only
 * prints event types, receipt counters, and non-sensitive field metadata.
 * Message text, identities, reward input, guest tokens, and raw frames are
 * never logged.
 */

const {
    createGuestChatClient,
} = require("../src/features/kick/chat/guestChat");

const DEFAULT_SECONDS = 120;
const MIN_SECONDS = 5;
const MAX_SECONDS = 900;
const CHANNEL_PATTERN = /^[a-zA-Z0-9_-]+$/;

const log = (event, fields = {}) =>
    console.log(
        JSON.stringify({ at: new Date().toISOString(), event, ...fields })
    );

function usage() {
    return (
        "Usage: node --require ts-node/register/transpile-only " +
        "scripts/kick-guest-probe.cjs --channel <slug> [--seconds 5..900]"
    );
}

function parseArgs(argv) {
    const options = { channel: null, seconds: DEFAULT_SECONDS };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--channel") {
            options.channel = argv[index + 1];
            index += 1;
        } else if (arg.startsWith("--channel=")) {
            options.channel = arg.slice("--channel=".length);
        } else if (arg === "--seconds") {
            options.seconds = Number(argv[index + 1]);
            index += 1;
        } else if (arg.startsWith("--seconds=")) {
            options.seconds = Number(arg.slice("--seconds=".length));
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    if (typeof options.channel !== "string" || !CHANNEL_PATTERN.test(options.channel)) {
        throw new Error("--channel must be a public Kick channel slug");
    }
    if (
        !Number.isInteger(options.seconds) ||
        options.seconds < MIN_SECONDS ||
        options.seconds > MAX_SECONDS
    ) {
        throw new Error(`--seconds must be an integer between ${MIN_SECONDS} and ${MAX_SECONDS}`);
    }
    return options;
}

async function resolveChatroomId(channel) {
    const response = await fetch(
        `https://kick.com/api/v2/channels/${channel}/chatroom`,
        {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Referer: "https://kick.com/",
            },
            signal: AbortSignal.timeout(10_000),
        }
    );
    if (!response.ok) {
        throw new Error(`Kick channel lookup returned HTTP ${response.status}`);
    }
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    const chatroomId = body && body.id ? String(body.id) : "";
    if (!/^\d+$/.test(chatroomId)) {
        throw new Error("Kick channel lookup returned no public chatroom id");
    }
    return chatroomId;
}

async function main() {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`${error.message}\n${usage()}`);
        process.exitCode = 2;
        return;
    }

    const chatroomId = await resolveChatroomId(options.channel);
    log("probe.channelResolved", {
        channel: options.channel,
        chatroomId,
        credentialFree: true,
    });

    const received = { message: 0, reward: 0 };
    let finished = false;
    let client = null;
    let deadline = null;

    const finish = (reason, exitCode) => {
        if (finished) return;
        finished = true;
        if (deadline) clearTimeout(deadline);
        if (client) client.stop();
        log("probe.finished", {
            reason,
            messages: received.message,
            rewards: received.reward,
        });
        if (exitCode === 0) {
            console.log(
                `PASS: observed ${received.message} normal message(s) and ` +
                    `${received.reward} loyalty reward event(s) on ${options.channel}.`
            );
        } else {
            const missing = [];
            if (received.message === 0) missing.push("normal message");
            if (received.reward === 0) missing.push("loyalty reward event");
            console.log(
                `MISSING EVIDENCE: no ${missing.join(" and no ")} observed within ` +
                    `${options.seconds}s; this run does not prove full receipt.`
            );
        }
        process.exitCode = exitCode;
    };

    client = createGuestChatClient({
        chatroomId,
        onEvent: (event) => {
            if (event.kind === "message") {
                received.message += 1;
                log("probe.messageReceived", {
                    count: received.message,
                    badgeCount: event.badges.length,
                });
            } else {
                received.reward += 1;
                log("probe.rewardReceived", {
                    count: received.reward,
                    hasUserInput: event.userInput.length > 0,
                });
            }
            if (received.message > 0 && received.reward > 0) {
                finish("both-events-observed", 0);
            }
        },
        onState: (state) => {
            log("probe.state", { state });
            if (state === "connected") {
                console.log(
                    `READY: both guest subscriptions acknowledged for ${options.channel}; ` +
                        `waiting up to ${options.seconds}s.`
                );
            }
            if (state === "failed") {
                finish("transport-failed", 1);
            }
        },
    });

    process.once("SIGINT", () => finish("interrupted", 1));

    deadline = setTimeout(() => finish("timeout", 1), options.seconds * 1000);
    log("probe.started", {
        channel: options.channel,
        chatroomId,
        seconds: options.seconds,
        sendsChatMessages: false,
        usesSavedCredentials: false,
    });

    await client.start();
}

main().catch((error) => {
    log("probe.failed", {
        message:
            error instanceof Error ? error.message : "unexpected probe failure",
    });
    process.exitCode = 1;
});
