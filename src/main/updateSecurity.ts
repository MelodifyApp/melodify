import type { TrustedPublicKey } from "basic-electron-updater";
import { APP_ID, UPDATE_KEY_ID } from "@/shared/brand";

/**
 * Update trust anchor. The private key stays outside this repository in the
 * release secret store; only the public key is compiled into the app.
 */
export const UPDATE_APP_ID = APP_ID;

export const UPDATE_SIGNING_KEYS: TrustedPublicKey[] = [
    {
        keyId: UPDATE_KEY_ID,
        publicKey:
            "MCowBQYDK2VwAyEAwgi/+kpY4E2EFCfRjFKYQHRZNnUUI4hT/GLGYPRT/BY=",
    },
];
