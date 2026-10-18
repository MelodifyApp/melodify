export function spotifyCredentialErrorMessage(
    result: { error?: unknown; message?: unknown } | null | undefined,
    fallback: string
): string {
    const error = result?.error;
    if (typeof error === "string" && error.trim()) return error;
    const message = result?.message;
    if (typeof message === "string" && message.trim()) return message;
    return fallback;
}
