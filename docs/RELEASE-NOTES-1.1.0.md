# Melodify 1.1.0 — release-note planning

## Security

- Credentials are encrypted at rest on Windows with Electron `safeStorage`
  (DPAPI). Client Secrets and OAuth access/refresh tokens use the stable
  `enc:v1:` envelope in `config.json`; Client IDs and preferences remain
  readable JSON.
- A 1.0.7 plaintext config is encrypted automatically on the first 1.1.0
  launch. If decryption is unavailable, existing ciphertext is preserved and
  affected credentials are treated as missing so they can be re-entered.
- The renderer still never receives credentials, and logs continue to redact
  both plaintext secrets and encrypted envelopes.
- **Downgrades:** 1.0.7 cannot read `enc:v1:` values. After upgrading to
  1.1.0, falling back to 1.0.7 is not supported.
