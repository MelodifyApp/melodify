import type {
    CredentialFailureCode,
    CredentialVerificationResult,
} from "./credentialFailure";

export type CredentialProvider = "spotify" | "kick" | "twitch";

/**
 * Official app/client-credential token endpoints. These checks use only the
 * application's client ID and secret; no user access token is sent or stored.
 * Kick and Twitch publish the client_credentials grant for app access tokens.
 * Kick: https://docs.kick.com/getting-started/generating-tokens-oauth2-flow
 * Twitch: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
 */
export const VERIFICATION_ENDPOINTS: Readonly<Record<CredentialProvider, string>> =
    Object.freeze({
        spotify: "https://accounts.spotify.com/api/token",
        kick: "https://id.kick.com/oauth/token",
        twitch: "https://id.twitch.tv/oauth2/token",
    });

export type FetchLike = (
    input: string | URL | Request,
    init?: RequestInit
) => Promise<Pick<Response, "ok" | "status">>;

function failure(code: CredentialFailureCode): CredentialVerificationResult {
    return { success: false, code };
}

function statusFailure(status: number): CredentialVerificationResult {
    return failure(
        status === 400 || status === 401 || status === 403
            ? "invalid_credentials"
            : "verification_unavailable"
    );
}

/**
 * Checks app credentials against a provider without returning or logging the
 * provider response, its access token, or the supplied values. Only stable
 * failure codes cross this boundary.
 */
export async function verifyAppCredentials(
    provider: CredentialProvider,
    credentials: { clientId: string; clientSecret: string },
    fetchImpl?: FetchLike
): Promise<CredentialVerificationResult> {
    const clientId = credentials.clientId.trim();
    const clientSecret = credentials.clientSecret.trim();
    if (!clientId || !clientSecret) {
        return failure("missing_credentials");
    }

    const endpoint = VERIFICATION_ENDPOINTS[provider];
    const request = fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
    if (!request) {
        return failure("verification_unavailable");
    }

    const body = new URLSearchParams({
        grant_type: "client_credentials",
    });
    const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
    };

    if (provider === "spotify") {
        headers.Authorization =
            "Basic " +
            Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    } else {
        body.set("client_id", clientId);
        body.set("client_secret", clientSecret);
    }

    try {
        const response = await request(endpoint, {
            method: "POST",
            headers,
            body: body.toString(),
        });
        return response.ok ? { success: true } : statusFailure(response.status);
    } catch {
        return failure("verification_unavailable");
    }
}
