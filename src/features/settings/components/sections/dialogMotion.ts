/** Timing shared by the credential dialog's enter/exit lifecycle. */

export const CREDENTIAL_DIALOG_EXIT_MS = 270;

/**
 * Reduced motion suppresses the CSS animation, so the close callback must run
 * immediately instead of waiting for the transition duration.
 */
export function dialogExitDuration(reducedMotion: boolean): number {
    return reducedMotion ? 0 : CREDENTIAL_DIALOG_EXIT_MS;
}
