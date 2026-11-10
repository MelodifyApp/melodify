/** Small tolerance for sub-pixel scroll positions at the end of a log list. */
export const LOG_BOTTOM_THRESHOLD_PX = 8;

export interface LogScrollMetrics {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
}

/** Whether a newly appended log should keep the view pinned to the latest entry. */
export function isLogListAtBottom(
    metrics: LogScrollMetrics,
    threshold = LOG_BOTTOM_THRESHOLD_PX
): boolean {
    const gap = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
    return gap <= threshold;
}
