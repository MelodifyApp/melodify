import type { TrustedPublicKey } from "basic-electron-updater";

/**
 * Update trust anchor. The private key stays outside this repository in the
 * release secret store; only the public key is compiled into the app.
 */
export const UPDATE_APP_ID = "com.emirhanpisgin.melodify";

export const UPDATE_SIGNING_KEYS: TrustedPublicKey[] = [
    {
        keyId: "melodify-release-2026-11",
        publicKey:
            "MCowBQYDK2VwAyEAwgi/+kpY4E2EFCfRjFKYQHRZNnUUI4hT/GLGYPRT/BY=",
    },
];
