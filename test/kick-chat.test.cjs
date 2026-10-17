"use strict";

/**
 * Focused Kick guest-chat tests for the connection hotfix
 * (plan: docs/superpowers/plans/2026-10-18-kick-connection-hotfix.md).
 *
 * Exercises the isolated guest transport and the listener adapter with
 * injected fakes. No Electron, config, Spotify, or network access.
 * Identities/content are synthetic.
 *
 * Run: npm run test:kick
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseKickFrames,
    decodeKickEvent,
    createGuestChatClient,
} = require("../src/features/kick/chat/guestChat");
const { createKickChatAdapter } = require("../src/features/kick/chat/adapter");
const {
    getKickCardView,
} = require("../src/features/kick/components/kickCardView");

const CHATROOM_ID = "987654";
const MESSAGE_CHANNEL = `chatrooms.${CHATROOM_ID}.v2`;
const REWARDS_CHANNEL = `chatroom_${CHATROOM_ID}`;
const SOCKET_URL =
    "wss://realtime.us-east-1.platform.kick.com/connection/websocket";

/* ------------------------------------------------------------------ fakes */

class FakeSocket {
    constructor(url) {
        this.url = url;
        this.sent = [];
        this.closed = false;
        this.listeners = new Map();
        FakeSocket.instances.push(this);
    }
    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }
    send(data) {
        this.sent.push(String(data));
    }
    close() {
        this.closed = true;
    }
    emit(type, event = {}) {
        for (const listener of [...(this.listeners.get(type) ?? [])]) {
            listener(event);
        }
    }
    frames() {
        return this.sent.map((raw) => JSON.parse(raw));
    }
    subscribeFrames() {
        return this.frames().filter((frame) => frame.subscribe);
    }
}
FakeSocket.instances = [];

function resetSockets() {
    FakeSocket.instances = [];
}

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

const NEGOTIATED_CONNECTION = {
    data: {
        mode: "websocket",
        connections: [
            {
                provider: "centrifugo",
                credentials: { url: SOCKET_URL },
            },
        ],
    },
};

function createFetchHarness() {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        const parsed = init.body ? JSON.parse(init.body) : {};
        calls.push({ url: String(url), body: parsed });
        if (String(url).endsWith("/realtime/connection")) {
            return jsonResponse(NEGOTIATED_CONNECTION);
        }
        if (String(url).endsWith("/realtime/auth/connection")) {
            return jsonResponse({ data: { token: "guest-connection-token" } });
        }
        if (String(url).endsWith("/realtime/auth/channel")) {
            return jsonResponse({ data: { token: "" } });
        }
        throw new Error(`Unexpected fetch call: ${url}`);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

function createTimerHarness() {
    const scheduled = [];
    let nextId = 1;
    return {
        scheduled,
        setTimeout(fn, ms) {
            const record = {
                id: nextId++,
                fn,
                ms,
                cleared: false,
                fired: false,
            };
            scheduled.push(record);
            return record.id;
        },
        clearTimeout(id) {
            const record = scheduled.find((entry) => entry.id === id);
            if (record) record.cleared = true;
        },
        pending() {
            return scheduled.filter((entry) => !entry.cleared && !entry.fired);
        },
    };
}

function makeClient(overrides = {}) {
    resetSockets();
    const timers = createTimerHarness();
    const fetchImpl = overrides.fetchImpl ?? createFetchHarness();
    const events = [];
    const states = [];
    const client = createGuestChatClient({
        chatroomId: CHATROOM_ID,
        onEvent: (event) => events.push(event),
        onState: (state) => states.push(state),
        fetchImpl,
        createSocket: overrides.createSocket ?? ((url) => new FakeSocket(url)),
        timers: {
            setTimeout: timers.setTimeout,
            clearTimeout: timers.clearTimeout,
        },
    });
    return {
        client,
        timers,
        events,
        states,
        fetchImpl,
        socket: () => FakeSocket.instances[FakeSocket.instances.length - 1],
        sockets: () => FakeSocket.instances,
    };
}

async function flush() {
    await new Promise((resolve) => setImmediate(resolve));
}

/** Starts the client and completes the Centrifugo connect acknowledgement. */
async function startSocket(h) {
    await h.client.start();
    const socket = h.socket();
    assert.ok(socket, "expected the client to create a socket");
    socket.emit("open");
    const connectFrame = socket.frames().find((frame) => frame.connect);
    assert.ok(connectFrame, "expected a Centrifugo connect frame");
    socket.emit("message", {
        data: JSON.stringify({
            id: connectFrame.id,
            connect: { expires: true, ttl: 2700, ping: 25 },
        }),
    });
    return { socket, connectFrame };
}

function ackAllSubscriptions(socket) {
    for (const frame of socket.subscribeFrames()) {
        socket.emit("message", {
            data: JSON.stringify({ id: frame.id, subscribe: {} }),
        });
    }
}

/** Starts the client and completes the full handshake (both acks). */
async function startConnected(h) {
    const { socket } = await startSocket(h);
    ackAllSubscriptions(socket);
    return socket;
}

/* -------------------------------------------------------- parsing/decoding */

test("parseKickFrames splits newline-batched frames and drops malformed lines", () => {
    const frames = parseKickFrames(
        '\n{"id":1}\nnot-json\n{"id":2,"connect":{}}\r\n[1,2]\n"x"\n'
    );
    assert.deepEqual(frames, [{ id: 1 }, { id: 2, connect: {} }]);
});

test("decodeKickEvent decodes a double-encoded chat message with badges", () => {
    const payload = {
        event: "App\\Events\\ChatMessageEvent",
        data: JSON.stringify({
            sender: {
                username: "viewer_x",
                identity: { badges: [{ type: "subscriber", text: "Sub" }] },
            },
            content: "!sr Test Song",
        }),
    };
    const event = decodeKickEvent(payload);
    assert.ok(event, "expected the message to decode");
    assert.equal(event.kind, "message");
    assert.equal(event.username, "viewer_x");
    assert.equal(event.message, "!sr Test Song");
    assert.deepEqual(event.badges, ["subscriber"]);
    assert.equal(event.raw.content, "!sr Test Song");
});

test("decodeKickEvent tolerates a message without badges or an object body", () => {
    const event = decodeKickEvent({
        event: "ChatMessageEvent",
        data: { sender: { username: "viewer_x" }, content: "hello" },
    });
    assert.ok(event);
    assert.equal(event.kind, "message");
    assert.deepEqual(event.badges, []);
});

test("decodeKickEvent rejects messages without a validated username or content", () => {
    assert.equal(
        decodeKickEvent({ event: "ChatMessageEvent", data: { sender: {}, content: "hi" } }),
        null
    );
    assert.equal(
        decodeKickEvent({
            event: "ChatMessageEvent",
            data: { sender: { username: "viewer_x" }, content: "" },
        }),
        null
    );
    assert.equal(
        decodeKickEvent({ event: "ChatMessageEvent", data: "not json" }),
        null
    );
});

test("decodeKickEvent decodes a double-encoded reward and trims user input", () => {
    const event = decodeKickEvent({
        event: "App\\Events\\RewardRedeemedEvent",
        data: JSON.stringify({
            reward_title: "Song Request",
            username: "viewer_y",
            user_input: "  Some Song  ",
        }),
    });
    assert.ok(event, "expected the reward to decode");
    assert.equal(event.kind, "reward");
    assert.equal(event.username, "viewer_y");
    assert.equal(event.rewardTitle, "Song Request");
    assert.equal(event.userInput, "Some Song");
});

test("decodeKickEvent tolerates a reward without user input", () => {
    const event = decodeKickEvent({
        event: "RewardRedeemedEvent",
        data: { reward_title: "Song Request", username: "viewer_y" },
    });
    assert.ok(event);
    assert.equal(event.kind, "reward");
    assert.equal(event.userInput, "");
});

test("decodeKickEvent returns null for unknown or malformed publications", () => {
    assert.equal(decodeKickEvent({ event: "App\\Events\\FollowEvent", data: {} }), null);
    assert.equal(decodeKickEvent({}), null);
    assert.equal(decodeKickEvent(null), null);
    assert.equal(decodeKickEvent("x"), null);
    assert.equal(decodeKickEvent({ event: 42, data: {} }), null);
});

/* ----------------------------------------------------------- guest transport */

test("client negotiates anonymously and reports connected only after both subscription acks", async () => {
    const h = makeClient();
    await h.client.start();

    // The anonymous handshake happened before any socket was created.
    const negotiateCall = h.fetchImpl.calls.find((call) =>
        call.url.endsWith("/realtime/connection")
    );
    assert.ok(negotiateCall);
    assert.equal(negotiateCall.body.client.type, "web");
    assert.ok(
        negotiateCall.body.capabilities.accepted_providers.some(
            (provider) => provider.provider === "centrifugo"
        )
    );
    const channelAuthCalls = h.fetchImpl.calls
        .filter((call) => call.url.endsWith("/auth/channel"))
        .map((call) => call.body.channel)
        .sort();
    assert.deepEqual(
        channelAuthCalls,
        [MESSAGE_CHANNEL, REWARDS_CHANNEL].sort()
    );

    const socket = h.socket();
    assert.equal(socket.closed, false);
    assert.equal(h.states.includes("connected"), false);

    socket.emit("open");
    const connectFrame = socket.frames().find((frame) => frame.connect);
    assert.ok(connectFrame, "expected a Centrifugo connect frame");
    assert.equal(typeof connectFrame.connect.name, "string");
    assert.equal(connectFrame.connect.token, "guest-connection-token");

    socket.emit("message", {
        data: JSON.stringify({
            id: connectFrame.id,
            connect: { expires: true, ttl: 2700, ping: 25 },
        }),
    });
    const subs = socket.subscribeFrames();
    assert.deepEqual(
        subs.map((frame) => frame.subscribe.channel).sort(),
        [MESSAGE_CHANNEL, REWARDS_CHANNEL].sort()
    );
    for (const frame of subs) {
        assert.equal("token" in frame.subscribe, false, "public channels omit tokens");
    }

    // One acknowledgement is not enough to report connected.
    socket.emit("message", {
        data: JSON.stringify({ id: subs[0].id, subscribe: {} }),
    });
    assert.equal(h.states.includes("connected"), false);

    socket.emit("message", {
        data: JSON.stringify({ id: subs[1].id, subscribe: {} }),
    });
    assert.equal(h.states[h.states.length - 1], "connected");
});

test("client rejects a socket destination outside Kick's domains", async () => {
    const fetchImpl = async (url) => {
        if (String(url).endsWith("/realtime/connection")) {
            return jsonResponse({
                data: {
                    mode: "websocket",
                    connections: [
                        {
                            provider: "centrifugo",
                            credentials: {
                                url: "wss://ws-us2.pusher.com/app/legacy",
                            },
                        },
                    ],
                },
            });
        }
        if (String(url).endsWith("/realtime/auth/connection")) {
            return jsonResponse({ data: { token: "guest-connection-token" } });
        }
        return jsonResponse({ data: { token: "" } });
    };
    const h = makeClient({ fetchImpl });
    await h.client.start();
    assert.equal(h.sockets().length, 0);
    assert.equal(h.states.includes("connected"), false);
});

test("client answers an empty JSON ping with an empty JSON pong", async () => {
    const h = makeClient();
    await startConnected(h);
    const socket = h.socket();
    const sentBefore = socket.sent.length;
    socket.emit("message", { data: "{}" });
    assert.equal(socket.sent.length, sentBefore + 1);
    assert.equal(socket.sent[socket.sent.length - 1], "{}");
    assert.equal(h.events.length, 0);
});

test("client accepts newline batches and emits decoded message and reward events once", async () => {
    const h = makeClient();
    const socket = await startConnected(h);
    const messageEnvelope = JSON.stringify({
        event: "App\\Events\\ChatMessageEvent",
        data: JSON.stringify({
            sender: { username: "viewer_x", identity: { badges: [] } },
            content: "hello",
        }),
    });
    const rewardBody = JSON.stringify({
        reward_title: "Song Request",
        username: "viewer_y",
        user_input: "Some Song",
    });
    const batched = [
        JSON.stringify({
            id: 2,
            push: { channel: MESSAGE_CHANNEL, pub: { data: messageEnvelope } },
        }),
        JSON.stringify({
            id: 3,
            push: {
                channel: REWARDS_CHANNEL,
                pub: {
                    data: JSON.stringify({
                        event: "App\\Events\\RewardRedeemedEvent",
                        data: rewardBody,
                    }),
                },
            },
        }),
        JSON.stringify({
            id: 4,
            push: { channel: MESSAGE_CHANNEL, pub: { data: 42 } },
        }),
        JSON.stringify({
            id: 5,
            push: {
                channel: MESSAGE_CHANNEL,
                pub: { data: JSON.stringify({ event: "FollowEvent", data: {} }) },
            },
        }),
        "not-json",
    ].join("\n");

    socket.emit("message", { data: batched });

    assert.equal(h.events.length, 2);
    const [message, reward] = h.events;
    assert.equal(message.kind, "message");
    assert.equal(message.username, "viewer_x");
    assert.equal(message.message, "hello");
    assert.equal(reward.kind, "reward");
    assert.equal(reward.username, "viewer_y");
    assert.equal(reward.userInput, "Some Song");
});

test("client start is idempotent: repeated calls create one negotiation and one socket", async () => {
    const h = makeClient();
    await Promise.all([h.client.start(), h.client.start()]);
    await h.client.start();
    assert.equal(
        h.fetchImpl.calls.filter((call) =>
            call.url.endsWith("/realtime/connection")
        ).length,
        1
    );
    assert.equal(h.sockets().length, 1);
});

test("client stop during negotiation aborts cleanly without opening a socket", async () => {
    let releaseConnection;
    const fetchImpl = async (url) => {
        if (String(url).endsWith("/realtime/connection")) {
            return new Promise((resolve) => {
                releaseConnection = () => resolve(jsonResponse(NEGOTIATED_CONNECTION));
            });
        }
        if (String(url).endsWith("/realtime/auth/connection")) {
            return jsonResponse({ data: { token: "guest-connection-token" } });
        }
        return jsonResponse({ data: { token: "" } });
    };
    const h = makeClient({ fetchImpl });
    const started = h.client.start();
    h.client.stop();
    assert.equal(
        h.timers.pending().length,
        0,
        "stop must clear the negotiation timer"
    );
    releaseConnection();
    await started;
    assert.equal(h.sockets().length, 0);
    assert.equal(h.states.includes("connected"), false);
    assert.equal(h.states[h.states.length - 1], "stopped");
    assert.equal(h.timers.pending().length, 0);
});

test("client stop closes the socket, clears timers, and ignores stale callbacks", async () => {
    const h = makeClient();
    const socket = await startConnected(h);
    assert.ok(h.timers.pending().length >= 1, "expected a session refresh timer");

    h.client.stop();
    assert.equal(socket.closed, true);
    assert.equal(h.timers.pending().length, 0);

    const eventCount = h.events.length;
    const stateCount = h.states.length;
    socket.emit("message", {
        data: JSON.stringify({
            id: 9,
            push: {
                channel: MESSAGE_CHANNEL,
                pub: {
                    data: JSON.stringify({
                        event: "ChatMessageEvent",
                        data: {
                            sender: { username: "late" },
                            content: "late",
                        },
                    }),
                },
            },
        }),
    });
    socket.emit("close", {});
    socket.emit("error", {});
    assert.equal(h.events.length, eventCount);
    assert.equal(h.states.length, stateCount);
    assert.equal(h.sockets().length, 1, "no stale reconnect may open a socket");
    assert.equal(h.timers.pending().length, 0);
});

test("client refreshes its guest session before expiry without overlapping readers", async () => {
    const h = makeClient();
    const first = await startConnected(h);
    const refresh = h.timers.pending().find((timer) => timer.ms > 60_000);
    assert.ok(refresh, "expected a refresh timer before the advertised expiry");

    refresh.fired = true;
    refresh.fn();
    await flush();

    assert.equal(first.closed, true);
    assert.equal(h.sockets().length, 2);
    const second = h.socket();
    assert.notEqual(second, first);
    assert.equal(h.states[h.states.length - 1], "connected");

    second.emit("open");
    const connectFrame = second.frames().find((frame) => frame.connect);
    second.emit("message", {
        data: JSON.stringify({
            id: connectFrame.id,
            connect: { expires: true, ttl: 2700, ping: 25 },
        }),
    });
    for (const frame of second.subscribeFrames()) {
        second.emit("message", {
            data: JSON.stringify({ id: frame.id, subscribe: {} }),
        });
    }
    assert.equal(h.states[h.states.length - 1], "connected");
    assert.equal(h.sockets().length, 2);
});

test("a failed initial negotiation retries with backoff and never reports connected", async () => {
    let fail = true;
    const base = createFetchHarness();
    const fetchImpl = async (url, init) => {
        if (fail && String(url).endsWith("/realtime/connection")) {
            return jsonResponse({}, 503);
        }
        return base(url, init);
    };
    const h = makeClient({ fetchImpl });
    await h.client.start();
    assert.equal(h.states.includes("connected"), false);
    assert.equal(h.states[h.states.length - 1], "reconnecting");
    const timer = h.timers.pending()[0];
    assert.ok(timer, "expected a backoff retry timer");
    assert.ok(timer.ms >= 1000, "first retry delay should be at least one second");

    fail = false;
    timer.fired = true;
    timer.fn();
    await flush();
    const socket = h.socket();
    assert.ok(socket, "expected a retry socket");
    socket.emit("open");
    const connectFrame = socket.frames().find((frame) => frame.connect);
    socket.emit("message", {
        data: JSON.stringify({
            id: connectFrame.id,
            connect: { expires: true, ttl: 2700, ping: 25 },
        }),
    });
    ackAllSubscriptions(socket);
    assert.equal(h.states[h.states.length - 1], "connected");
});

test("client reconnects with bounded backoff and gives up after repeated failures", async () => {
    let failTransport = false;
    const base = createFetchHarness();
    const fetchImpl = async (url, init) => {
        if (failTransport && String(url).endsWith("/realtime/connection")) {
            throw new Error("network down");
        }
        return base(url, init);
    };
    const h = makeClient({ fetchImpl });
    const socket = await startConnected(h);

    failTransport = true;
    socket.emit("close", {});
    assert.equal(h.states[h.states.length - 1], "reconnecting");

    const delays = [];
    for (let i = 0; i < 12; i++) {
        const timer = h.timers.pending().find((entry) => !entry.fired);
        if (!timer) break;
        delays.push(timer.ms);
        timer.fired = true;
        timer.fn();
        await flush();
    }

    assert.equal(h.states[h.states.length - 1], "failed");
    assert.equal(h.timers.pending().length, 0);
    assert.ok(delays.length >= 3, "expected several backoff retries");
    for (let i = 1; i < delays.length; i++) {
        assert.ok(
            delays[i] >= delays[i - 1],
            "backoff delays must not shrink"
        );
    }
    assert.ok(delays[delays.length - 1] <= 30_000, "backoff must be capped");

    // A terminal failure can be started again later.
    failTransport = false;
    await h.client.start();
    assert.equal(h.sockets().length, 2);
});

/* ------------------------------------------- bounded negotiation (r2 review) */

test("a stalled negotiation times out once and a late completion cannot open a stale socket", async () => {
    resetSockets();
    const base = createFetchHarness();
    let releaseConnection = null;
    let connectionCalls = 0;
    const fetchImpl = async (url, init) => {
        if (String(url).endsWith("/realtime/connection")) {
            connectionCalls += 1;
            if (connectionCalls === 1) {
                return new Promise((resolve) => {
                    releaseConnection = () =>
                        resolve(jsonResponse(NEGOTIATED_CONNECTION));
                });
            }
        }
        return base(url, init);
    };
    const h = makeClient({ fetchImpl });
    const started = h.client.start();

    const negotiationTimer = h.timers.pending().find((timer) => !timer.fired);
    assert.ok(negotiationTimer, "expected the negotiation phase to be bounded");
    assert.ok(negotiationTimer.ms <= 60_000, "the negotiation bound must be short");
    negotiationTimer.fired = true;
    negotiationTimer.fn();
    await flush();

    assert.equal(h.states[h.states.length - 1], "reconnecting");
    assert.equal(h.sockets().length, 0);
    const retryTimer = h.timers.pending().find((timer) => !timer.fired);
    assert.ok(retryTimer && retryTimer.ms >= 1000, "expected one bounded retry");

    // Complete the original fetch after the timeout; it must be inert.
    releaseConnection();
    await flush();
    await started;
    assert.equal(h.sockets().length, 0, "late negotiation must not open a stale socket");
    assert.equal(
        h.timers.pending().filter((timer) => !timer.fired).length,
        1,
        "the late completion must not schedule a second retry"
    );
    assert.equal(
        h.states.filter((state) => state === "reconnecting").length,
        1,
        "the timeout must be recorded exactly once"
    );
    assert.equal(
        base.calls.length,
        0,
        "a superseded cycle must not issue further requests"
    );

    retryTimer.fired = true;
    retryTimer.fn();
    await flush();
    const socket = h.socket();
    assert.ok(socket, "the retry cycle should open a socket");
    socket.emit("open");
    const connectFrame = socket.frames().find((frame) => frame.connect);
    socket.emit("message", {
        data: JSON.stringify({
            id: connectFrame.id,
            connect: { expires: true, ttl: 2700, ping: 25 },
        }),
    });
    ackAllSubscriptions(socket);
    assert.equal(h.states[h.states.length - 1], "connected");
});

test("repeatedly stalled negotiations exhaust the bounded retries", async () => {
    resetSockets();
    const fetchImpl = async (url) => {
        if (String(url).endsWith("/realtime/connection")) {
            return new Promise(() => {});
        }
        throw new Error(`Unexpected fetch call: ${url}`);
    };
    const h = makeClient({ fetchImpl });
    void h.client.start();

    for (let index = 0; index < 12; index += 1) {
        const timer = h.timers.pending().find((entry) => !entry.fired);
        if (!timer) break;
        timer.fired = true;
        timer.fn();
        await flush();
    }

    assert.equal(h.states[h.states.length - 1], "failed");
    assert.equal(h.timers.pending().length, 0);
    assert.equal(h.sockets().length, 0);
});

test("client stop during an unacknowledged socket handshake clears all owned timers", async () => {
    const h = makeClient();
    await h.client.start();
    const socket = h.socket();
    socket.emit("open");
    const connectFrame = socket.frames().find((frame) => frame.connect);
    assert.ok(
        h.timers.pending().length >= 1,
        "expected an in-flight handshake timer"
    );

    h.client.stop();
    assert.equal(socket.closed, true);
    assert.equal(
        h.timers.pending().length,
        0,
        "stop must clear the handshake timer"
    );

    socket.emit("message", {
        data: JSON.stringify({
            id: connectFrame.id,
            connect: { expires: true, ttl: 2700, ping: 25 },
        }),
    });
    assert.equal(h.states.includes("connected"), false);
    assert.equal(h.sockets().length, 1);
});

/* ------------------------------------------------------------ adapter */

function createAdapterHarness(overrides = {}) {
    const created = [];
    const messages = [];
    const rewards = [];
    const states = [];
    const errors = [];
    let connectedCount = 0;
    let disconnectedCount = 0;
    const adapter = createKickChatAdapter({
        createClient(handlers) {
            if (overrides.createClientImpl) {
                return overrides.createClientImpl(handlers);
            }
            const client = {
                handlers,
                started: 0,
                stopped: 0,
                start() {
                    this.started += 1;
                    return overrides.startImpl ? overrides.startImpl() : Promise.resolve();
                },
                stop() {
                    this.stopped += 1;
                },
                emitEvent(event) {
                    handlers.onEvent(event);
                },
                emitState(state) {
                    handlers.onState(state);
                },
            };
            created.push(client);
            return client;
        },
        onMessage: (event) => messages.push(event),
        onReward: (event) => rewards.push(event),
        onConnected: () => {
            connectedCount += 1;
        },
        onDisconnected: () => {
            disconnectedCount += 1;
        },
        onError: (error) => errors.push(error),
        onStateChange: (state) => states.push(state),
    });
    return {
        adapter,
        created,
        messages,
        rewards,
        states,
        errors,
        counts: () => ({
            connected: connectedCount,
            disconnected: disconnectedCount,
        }),
    };
}

test("adapter routes one received event to exactly one sink", () => {
    const h = createAdapterHarness();
    h.adapter.start();
    const client = h.created[0];
    client.emitEvent({
        kind: "message",
        username: "viewer_x",
        message: "hello",
        badges: [],
        raw: {},
    });
    client.emitEvent({
        kind: "reward",
        username: "viewer_y",
        rewardTitle: "Song Request",
        userInput: "Some Song",
        raw: {},
    });
    assert.equal(h.messages.length, 1, "the message reaches the message sink once");
    assert.equal(h.rewards.length, 1, "the reward reaches the reward sink once");
    assert.equal(h.messages[0].message, "hello");
    assert.equal(h.rewards[0].userInput, "Some Song");
});

test("adapter start is idempotent: concurrent starts create one reader", () => {
    const h = createAdapterHarness();
    h.adapter.start();
    h.adapter.start();
    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].started, 1);
});

test("adapter reports connected only after the client confirms both subscriptions", () => {
    const h = createAdapterHarness();
    h.adapter.start();
    const client = h.created[0];
    client.emitState("connecting");
    assert.deepEqual(h.counts(), { connected: 0, disconnected: 0 });
    client.emitState("connected");
    assert.deepEqual(h.counts(), { connected: 1, disconnected: 0 });
    client.emitState("reconnecting");
    assert.deepEqual(h.counts(), { connected: 1, disconnected: 1 });
    client.emitState("connected");
    assert.deepEqual(h.counts(), { connected: 2, disconnected: 1 });
    assert.deepEqual(h.states, [
        "connecting",
        "connected",
        "reconnecting",
        "connected",
    ]);
});

test("adapter stop during negotiation prevents later callbacks", () => {
    const h = createAdapterHarness();
    h.adapter.start();
    const client = h.created[0];
    h.adapter.stop();
    assert.equal(client.stopped, 1);
    client.emitState("connected");
    client.emitEvent({
        kind: "message",
        username: "viewer_x",
        message: "late",
        badges: [],
        raw: {},
    });
    assert.deepEqual(h.counts(), { connected: 0, disconnected: 0 });
    assert.equal(h.messages.length, 0);
    assert.equal(h.adapter.isActive(), false);
});

test("adapter stop after connected detaches the client until a fresh start", () => {
    const h = createAdapterHarness();
    h.adapter.start();
    const first = h.created[0];
    first.emitState("connected");
    h.adapter.stop();
    first.emitState("reconnecting");
    first.emitState("connected");
    first.emitEvent({
        kind: "reward",
        username: "viewer_y",
        rewardTitle: "Song Request",
        userInput: "late",
        raw: {},
    });
    assert.deepEqual(h.counts(), { connected: 1, disconnected: 0 });
    assert.equal(h.rewards.length, 0);

    h.adapter.start();
    assert.equal(h.created.length, 2);
    assert.equal(h.adapter.isActive(), true);
});

test("adapter becomes inactive after a terminal failure so a retry can start fresh", () => {
    const h = createAdapterHarness();
    h.adapter.start();
    const first = h.created[0];
    first.emitState("connected");
    first.emitState("failed");
    assert.deepEqual(h.counts(), { connected: 1, disconnected: 1 });
    assert.equal(h.adapter.isActive(), false);

    h.adapter.start();
    assert.equal(h.created.length, 2);
});

test("adapter contains client start failures without unhandled rejections", async () => {
    const h = createAdapterHarness({
        startImpl: () => Promise.reject(new Error("negotiation exploded")),
    });
    h.adapter.start();
    await flush();
    assert.equal(h.adapter.isActive(), false);
    assert.deepEqual(h.counts(), { connected: 0, disconnected: 0 });
    assert.equal(h.errors.length, 1);
});

test("adapter contains client construction failures", () => {
    const h = createAdapterHarness({
        createClientImpl: () => {
            throw new Error("invalid chatroom");
        },
    });
    assert.doesNotThrow(() => h.adapter.start());
    assert.equal(h.adapter.isActive(), false);
    assert.equal(h.errors.length, 1);
    assert.equal(h.created.length, 0);
});

test("adapter stops an abandoned client and reports one honest disconnect", async () => {
    const h = createAdapterHarness({
        startImpl: () => Promise.reject(new Error("start failed")),
    });
    h.adapter.start();
    const client = h.created[0];
    client.emitState("connected");
    assert.deepEqual(h.counts(), { connected: 1, disconnected: 0 });

    await flush();
    assert.equal(h.adapter.isActive(), false);
    assert.equal(client.stopped, 1, "the abandoned client must be stopped");
    assert.deepEqual(h.counts(), { connected: 1, disconnected: 1 });
    assert.equal(h.errors.length, 1);

    // Stale callbacks from the abandoned client stay inert and silent.
    client.emitState("connected");
    client.emitEvent({
        kind: "message",
        username: "viewer_x",
        message: "late",
        badges: [],
        raw: {},
    });
    assert.deepEqual(h.counts(), { connected: 1, disconnected: 1 });
    assert.equal(h.messages.length, 0);
    assert.equal(h.errors.length, 1);
});

/* ------------------------------------------- card auth/chat reconciliation */

test("kick card view keeps showing the running reader after an OAuth failure", () => {
    const view = getKickCardView({
        hasSecrets: true,
        authenticated: false,
        listeningToChat: true,
    });
    assert.equal(view.badge, "listening");
    assert.equal(view.showDisconnect, true);
    assert.equal(view.showLogin, false);
});

test("kick card view keeps disconnect available for a running guest without credentials", () => {
    const view = getKickCardView({
        hasSecrets: false,
        authenticated: false,
        listeningToChat: true,
    });
    assert.equal(view.badge, "listening");
    assert.equal(view.showDisconnect, true);
    assert.equal(view.showConfigure, false);
    assert.equal(view.showLogin, false);
});

test("kick card view offers the login button only when nothing is running", () => {
    const view = getKickCardView({
        hasSecrets: true,
        authenticated: false,
        listeningToChat: false,
    });
    assert.equal(view.badge, "ready");
    assert.equal(view.showDisconnect, false);
    assert.equal(view.showLogin, true);
    assert.equal(view.showConfigure, false);
});

test("kick card view keeps the disconnect control for an authenticated idle card", () => {
    const view = getKickCardView({
        hasSecrets: true,
        authenticated: true,
        listeningToChat: false,
    });
    assert.equal(view.badge, "chat-unavailable");
    assert.equal(view.showDisconnect, true);
    assert.equal(view.showLogin, false);
});

test("kick card view shows the usual listening badge when fully connected", () => {
    const view = getKickCardView({
        hasSecrets: true,
        authenticated: true,
        listeningToChat: true,
    });
    assert.equal(view.badge, "listening");
    assert.equal(view.showDisconnect, true);
    assert.equal(view.showLogin, false);
});

test("kick card view keeps the setup path when credentials are missing", () => {
    const view = getKickCardView({
        hasSecrets: false,
        authenticated: false,
        listeningToChat: false,
    });
    assert.equal(view.badge, "setup");
    assert.equal(view.showConfigure, true);
    assert.equal(view.showDisconnect, false);
    assert.equal(view.showLogin, false);
});
