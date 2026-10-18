# Melodify 1.0.6

Fixes Spotify sign-in after changing the saved Spotify Client ID or secret. The
app now rebuilds its cached Spotify API client from the saved credentials before
the next sign-in attempt. Credential-validation errors are also shown correctly.

Includes the 1.0.4 Kick guest-chat fix and the 1.0.5 window-close fix.
