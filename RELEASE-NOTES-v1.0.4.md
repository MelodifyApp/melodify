# Melodify 1.0.4

This hotfix restores Kick chat connection using Kick's negotiated anonymous
WebSocket transport. Kick chat can be read without a Kick sign-in; sending chat
replies still requires a valid Kick connection.

The existing desktop interface, Twitch behavior, and request/reward handling
remain unchanged. This release does not include the planned desktop redesign,
website/API rebuild, or `!queue` feature.

Live QA verified receipt of one normal chat message and one loyalty-reward event
on the designated test channel. This was a connection/event-receipt check,
not full end-to-end Spotify, chat-reply, reward-redemption, or refund testing.

Kick's negotiated guest transport depends on undocumented website endpoints and
may need another compatibility update if Kick changes them.
