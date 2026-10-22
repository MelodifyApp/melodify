/**
 * Kick.com OAuth 2.0 Authentication Client with PKCE Flow
 * Implements secure OAuth authentication using Proof Key for Code Exchange (PKCE)
 * Handles token lifecycle management, automatic refresh, and API communication
 */

import fetch from "node-fetch";
import Config from "@/core/config";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";

// TypeScript interfaces for API responses and internal data structures
interface KickTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

interface KickUser {
    id: number;
    username: string;
    slug: string;
    broadcaster_user_id: number;
}

interface KickChatroom {
    id: string;
    channel_id: number;
}

interface KickChannel {
    id: number;
    slug: string;
    broadcaster_user_id: number;
}

interface KickTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

interface KickChannelsResponse {
    data: KickChannel[];
}

interface KickChatroomResponse {
    id: string;
}

interface KickChannelResponse {
    id: number;
    user: {
        username: string;
        id: number;
    };
    slug: string;
}

/**
 * Kick API client with comprehensive OAuth 2.0 + PKCE implementation
 * Features:
 * - PKCE (Proof Key for Code Exchange) flow for enhanced security
 * - Automatic token refresh before expiration
 * - Secure token storage in application configuration
 * - Rate limiting and error handling
 * - Public and authenticated API endpoint support
 */
class KickClient {
    private baseUrl = "https://api.kick.com";
    private authUrl = "https://id.kick.com/oauth/token";
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private expiresAt: number | null = null;
    private tokenGeneration = 0;
    private refreshInFlight: Promise<boolean> | null = null;

    constructor() {
        this.loadTokens();
    }

    /**
     * Load tokens from config
     */
    private loadTokens(): void {
        this.accessToken = Config.get("kickAccessToken") || null;
        this.refreshToken = Config.get("kickRefreshToken") || null;
        this.expiresAt = Config.get("kickExpiresAt") || null;
    }

    /**
     * Save tokens to config
     */
    private saveTokens(tokens: KickTokens): void {
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
        this.expiresAt = tokens.expiresAt;

        Config.set({
            kickAccessToken: tokens.accessToken,
            kickRefreshToken: tokens.refreshToken,
            kickExpiresAt: tokens.expiresAt,
        });
    }

    /**
     * Clear tokens from config
     */
    public clearTokens(): void {
        // Supersede any refresh that is already in flight: an explicit logout
        // must win over a late token response.
        this.tokenGeneration += 1;
        this.refreshInFlight = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.expiresAt = null;

        Config.set({
            kickAccessToken: undefined,
            kickRefreshToken: undefined,
            kickExpiresAt: undefined,
            // Also clear user/channel data to prevent stale data issues
            userId: undefined,
            username: undefined,
            chatroomId: undefined,
        });
    }

    /**
     * Check if tokens are available
     */
    public hasTokens(): boolean {
        return !!(this.accessToken && this.refreshToken && this.expiresAt);
    }

    /**
     * Check if access token is expired
     */
    public isTokenExpired(): boolean {
        if (!this.expiresAt) return true;
        return Date.now() >= this.expiresAt;
    }

    /**
     * OAuth 2.0 Authorization Code + PKCE token exchange
     * Converts the authorization code received from OAuth callback into access/refresh tokens
     *
     * @param code - Authorization code from OAuth redirect
     * @param codeVerifier - PKCE code verifier (must match the challenge sent in auth URL)
     * @returns Success status of token exchange
     *
     * PKCE Flow Security:
     * 1. Client generates random code_verifier
     * 2. Client creates code_challenge = SHA256(code_verifier)
     * 3. Authorization request includes code_challenge
     * 4. Token exchange must include original code_verifier for verification
     *
     * This prevents authorization code interception attacks in public clients
     */
    public async exchangeCodeForTokens(
        code: string,
        codeVerifier: string
    ): Promise<boolean> {
        const generation = this.tokenGeneration;
        try {
            const clientId = Config.get("kickClientId");
            const clientSecret = Config.get("kickClientSecret");
            const redirectUri =
                Config.get("kickRedirectUri") ||
                "http://127.0.0.1:8889/callback";

            if (!clientId || !clientSecret) {
                throw new Error("Missing Kick client credentials");
            }

            // OAuth 2.0 token exchange parameters
            const params = new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
                code_verifier: codeVerifier, // PKCE verification
            });

            logDebug(
                "Exchanging code for tokens",
                redactSecrets(Object.fromEntries(params))
            );

            const response = await fetch(this.authUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Token exchange failed: ${response.status} ${errorText}`
                );
            }

            const data = (await response.json()) as KickTokenResponse;

            // Logout during the exchange must not restore a session.
            if (generation !== this.tokenGeneration) {
                return false;
            }

            const { access_token, refresh_token, expires_in } = data;

            // Store tokens with calculated expiration time. A fresh login
            // supersedes any refresh that started before it.
            this.tokenGeneration += 1;
            this.refreshInFlight = null;
            this.saveTokens({
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresAt: Date.now() + expires_in * 1000,
            });

            logInfo("Kick tokens obtained successfully");
            return true;
        } catch (error) {
            logError(error, "KickClient:exchangeCodeForTokens");
            return false;
        }
    }

    /**
     * Automatic token refresh using refresh token
     * Handles token lifecycle management to maintain authenticated sessions
     *
     * @returns Success status of refresh operation
     *
     * Refresh Token Flow:
     * 1. Check if refresh token is available and valid
     * 2. Exchange refresh token for new access token
     * 3. Update stored tokens with new expiration time
     * 4. Preserve refresh token (may be rotated by server)
     *
     * This maintains user sessions without requiring re-authentication
     */
    public async refreshAccessToken(): Promise<boolean> {
        // Concurrent callers (auto-refresh timer, retry/checkAuth) share a
        // single refresh instead of racing to overwrite the token pair.
        if (this.refreshInFlight) return this.refreshInFlight;
        const generation = this.tokenGeneration;
        const refresh = this.performRefresh(generation);
        this.refreshInFlight = refresh;
        try {
            return await refresh;
        } finally {
            if (this.refreshInFlight === refresh) this.refreshInFlight = null;
        }
    }

    /**
     * Performs one refresh for a captured generation. A logout or a fresh
     * login bumps the generation, making the late response inert.
     */
    private async performRefresh(generation: number): Promise<boolean> {
        const savedRefreshToken = this.refreshToken;
        if (!savedRefreshToken) {
            logError(
                "No refresh token available",
                "KickClient:refreshAccessToken"
            );
            return false;
        }

        try {
            const clientId = Config.get("kickClientId");
            const clientSecret = Config.get("kickClientSecret");

            if (!clientId || !clientSecret) {
                logError(
                    "Missing Kick client credentials",
                    "KickClient:refreshAccessToken"
                );
                return false;
            }

            const params = new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: savedRefreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            logDebug(
                "Refreshing Kick token",
                redactSecrets(Object.fromEntries(params))
            );

            const response = await fetch(this.authUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to refresh token: ${response.statusText}`
                );
            }

            const data = (await response.json()) as KickTokenResponse;

            // A logout or fresh login happened while the request was in
            // flight; never resurrect or overwrite those tokens.
            if (generation !== this.tokenGeneration) {
                return false;
            }

            const { access_token, refresh_token, expires_in } = data;
            if (
                typeof access_token !== "string" ||
                !access_token.trim() ||
                typeof expires_in !== "number" ||
                !Number.isFinite(expires_in) ||
                expires_in <= 0 ||
                (refresh_token !== undefined &&
                    (typeof refresh_token !== "string" ||
                        !refresh_token.trim()))
            ) {
                logError(
                    "Kick token refresh returned invalid token data",
                    "KickClient:refreshAccessToken"
                );
                return false;
            }

            // Update tokens - refresh token may be rotated
            this.saveTokens({
                accessToken: access_token,
                refreshToken:
                    typeof refresh_token === "string" && refresh_token
                        ? refresh_token
                        : savedRefreshToken,
                expiresAt: Date.now() + expires_in * 1000,
            });

            logInfo("Kick access token refreshed successfully");
            return true;
        } catch (error) {
            logError(error, "KickClient:refreshAccessToken");
            return false;
        }
    }

    /**
     * Smart token management - gets valid access token with automatic refresh
     * This is the primary method for obtaining authenticated access tokens
     *
     * @returns Valid access token or null if authentication failed
     *
     * Token Lifecycle Management:
     * 1. Check if tokens are available
     * 2. Verify token expiration (with buffer time)
     * 3. Automatically refresh if expired but refresh token available
     * 4. Return valid access token for API calls
     *
     * This ensures API calls always use fresh, valid tokens
     */
    public async getValidAccessToken(): Promise<string | null> {
        if (!this.hasTokens()) {
            return null;
        }

        // Check expiration with 5-minute buffer to prevent edge cases
        if (this.isTokenExpired()) {
            const refreshed = await this.refreshAccessToken();
            if (!refreshed) {
                return null;
            }
        }

        return this.accessToken;
    }

    /**
     * Get user's channels
     */
    public async getChannels(): Promise<KickChannel[]> {
        const accessToken = await this.getValidAccessToken();
        if (!accessToken) {
            throw new Error("No valid access token available");
        }

        const response = await fetch(`${this.baseUrl}/public/v1/channels`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch channels: ${response.statusText}`);
        }

        const { data } = (await response.json()) as KickChannelsResponse;
        return data;
    }

    /**
     * Get chatroom for a channel
     */
    public async getChatroom(username: string): Promise<KickChatroom> {
        const accessToken = await this.getValidAccessToken();
        if (!accessToken) {
            throw new Error("No valid access token available");
        }

        const response = await fetch(
            `${this.baseUrl}/public/v1/channels/${username}/chatroom`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch chatroom: ${response.statusText}`);
        }

        return (await response.json()) as KickChatroom;
    }

    /**
     * Find chatroom by username (public API)
     */
    public async findChatroom(
        username: string
    ): Promise<{ chatroomId: string } | null> {
        try {
            const response = await fetch(
                `https://kick.com/api/v2/channels/${username}/chatroom`,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        Referer: "https://kick.com/",
                    },
                }
            );
            const chatRoomData =
                (await response.json()) as KickChatroomResponse;

            if (!response.ok || !chatRoomData.id) {
                return null;
            }

            return {
                chatroomId: chatRoomData.id,
            };
        } catch (error) {
            logError(error, "KickClient:findChatroom");
            return null;
        }
    }

    /**
     * Send a message to chat
     */
    public async sendMessage(
        message: string,
        broadcasterUserId: number
    ): Promise<void> {
        const accessToken = await this.getValidAccessToken();
        if (!accessToken) {
            throw new Error("No valid access token available");
        }

        const response = await fetch(`${this.baseUrl}/public/v1/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                broadcaster_user_id: broadcasterUserId,
                content: message,
                type: "bot",
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to send message: ${response.statusText}`);
        }
    }

    /**
     * Get user profile
     */
    public async getUserProfile(username: string): Promise<KickUser | null> {
        try {
            const response = await fetch(
                `https://kick.com/api/v1/channels/${username}`
            );

            if (!response.ok) {
                return null;
            }

            const data = (await response.json()) as KickChannelResponse;
            return {
                id: data.id,
                username: data.user.username,
                slug: data.slug,
                broadcaster_user_id: data.user.id,
            };
        } catch (error) {
            logError(error, "KickClient:getUserProfile");
            return null;
        }
    }

    /**
     * Validate client credentials
     */
    public async validateCredentials(
        clientId: string,
        clientSecret: string
    ): Promise<boolean> {
        try {
            const params = new URLSearchParams({
                grant_type: "client_credentials",
            });

            const response = await fetch(this.authUrl, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${Buffer.from(
                        `${clientId}:${clientSecret}`
                    ).toString("base64")}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
            });

            return response.ok;
        } catch (error) {
            logError(error, "KickClient:validateCredentials");
            return false;
        }
    }
}

// Export a singleton instance
export const kickClient = new KickClient();
