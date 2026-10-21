import fetch from "node-fetch";
import Config from "@/core/config";
import { logWarn } from "@/core/logging";

interface TwitchTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

class TwitchClient {
    private authUrl = "https://id.twitch.tv/oauth2/token";
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private expiresAt: number | null = null;
    private tokenGeneration = 0;
    private refreshInFlight: Promise<string | null> | null = null;

    constructor() {
        this.loadTokens();
    }

    private loadTokens(): void {
        this.accessToken = Config.get("twitchAccessToken") || null;
        this.refreshToken = Config.get("twitchRefreshToken") || null;
        this.expiresAt = Config.get("twitchExpiresAt") || null;
    }

    private saveTokens(tokens: TwitchTokens): void {
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
        this.expiresAt = tokens.expiresAt;

        Config.set({
            twitchAccessToken: tokens.accessToken,
            twitchRefreshToken: tokens.refreshToken,
            twitchExpiresAt: tokens.expiresAt,
        });
    }

    public clearTokens(): void {
        this.tokenGeneration++;
        this.refreshInFlight = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.expiresAt = null;

        Config.set({
            twitchAccessToken: undefined,
            twitchRefreshToken: undefined,
            twitchExpiresAt: undefined,
        });
    }

    public hasTokens(): boolean {
        return !!(this.accessToken && this.refreshToken && this.expiresAt);
    }

    public isTokenExpired(): boolean {
        if (!this.expiresAt) return true;
        return Date.now() >= this.expiresAt;
    }

    public getAccessToken(): string | null {
        return this.accessToken;
    }

    public async getValidAccessToken(): Promise<string | null> {
        if (!this.isTokenExpired()) return this.accessToken;
        if (!this.refreshToken) return null;
        if (this.refreshInFlight) return this.refreshInFlight;

        const generation = this.tokenGeneration;
        const refresh = this.refreshAccessToken(generation);
        this.refreshInFlight = refresh;
        try {
            return await refresh;
        } finally {
            if (this.refreshInFlight === refresh) this.refreshInFlight = null;
        }
    }

    private async refreshAccessToken(generation: number): Promise<string | null> {
        const refreshToken = this.refreshToken;
        const clientId = Config.get("twitchClientId");
        const clientSecret = Config.get("twitchClientSecret");
        if (!refreshToken || !clientId || !clientSecret) return null;

        try {
            const response = await fetch(this.authUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                }).toString(),
                signal: AbortSignal.timeout(15000),
            });
            const data = (await response.json()) as {
                access_token?: unknown;
                refresh_token?: unknown;
                expires_in?: unknown;
                message?: unknown;
            };
            if (generation !== this.tokenGeneration) return null;
            if (!response.ok) {
                // Only a definitive refresh-token rejection discards the session.
                // Network, rate-limit, server and client-configuration errors retain it.
                if (
                    (response.status === 400 || response.status === 401) &&
                    typeof data?.message === "string" &&
                    data.message.toLowerCase() === "invalid refresh token"
                ) {
                    this.clearTokens();
                }
                logWarn(`Twitch token refresh rejected (HTTP ${response.status})`);
                return null;
            }
            if (
                typeof data?.access_token !== "string" || !data.access_token.trim() ||
                typeof data.expires_in !== "number" ||
                !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
                (data.refresh_token !== undefined &&
                    (typeof data.refresh_token !== "string" || !data.refresh_token.trim()))
            ) {
                logWarn("Twitch token refresh returned invalid token data");
                return null;
            }
            this.saveTokens({
                accessToken: data.access_token,
                refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : refreshToken,
                expiresAt: Date.now() + data.expires_in * 1000,
            });
            return this.accessToken;
        } catch {
            // Do not log token endpoint response bodies or credential-bearing errors.
            logWarn("Twitch token refresh unavailable; saved session retained");
            return null;
        }
    }

    public updateTokens(tokens: TwitchTokens): void {
        this.tokenGeneration++;
        this.refreshInFlight = null;
        this.saveTokens(tokens);
    }
}

export const twitchClient = new TwitchClient();
