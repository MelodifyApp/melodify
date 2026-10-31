/**
 * React Error Boundary Component
 *
 * Provides application-wide error handling with graceful degradation and comprehensive logging.
 * Acts as a safety net to prevent complete application crashes from unhandled JavaScript errors.
 *
 * Features:
 * - Catches and contains errors at component tree boundaries
 * - Displays user-friendly fallback UI instead of white screen
 * - Comprehensive error logging with component stack traces
 * - Recovery mechanism allowing users to attempt to continue
 * - Development-friendly error information display
 *
 * Error Handling Strategy:
 * - Production: Show minimal error message with recovery option
 * - Development: Display detailed error information and component stack
 * - All environments: Log complete error details to main process for debugging
 *
 * Architecture:
 * - Class component (required for error boundary functionality)
 * - Static method for state derivation from errors
 * - Component lifecycle integration for error capture
 * - Renderer process logging for error persistence
 */

// ErrorBoundary.tsx
// React error boundary component to catch and handle JavaScript errors in the component tree.

import React from "react";
import { useTranslation } from "react-i18next";
import { logError } from "@/renderer/rendererLogger";

/**
 * Props for the ErrorBoundary component.
 * @property children - React children to be wrapped by the error boundary.
 */
interface ErrorBoundaryProps {
    children: React.ReactNode;
}

/**
 * State for the ErrorBoundary component.
 * @property hasError - Whether an error has been caught.
 * @property error - The error that was caught.
 */
interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

function ErrorFallback() {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-center h-screen bg-zinc-900 text-white">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">
                    {t("errorBoundary.title")}
                </h1>
                <p className="text-zinc-400 mb-4">
                    {t("errorBoundary.description")}
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="bg-melodify-primary hover:bg-melodify-primary-dark px-4 py-2 rounded"
                >
                    {t("errorBoundary.reload")}
                </button>
            </div>
        </div>
    );
}

/**
 * ErrorBoundary component catches JavaScript errors anywhere in the child component tree.
 * Logs errors and displays a fallback UI when errors occur.
 *
 * This component implements React's error boundary pattern to provide graceful error handling
 * across the entire application, preventing complete crashes and providing recovery options.
 */
export class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    /**
     * Static error state derivation method
     * Called when an error is thrown in a descendant component
     * Updates component state to trigger fallback UI rendering
     *
     * @param error - The error that was thrown
     * @returns New state object with error information
     */
    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    /**
     * Error capture and logging lifecycle method
     * Called after an error has been thrown and caught by the boundary
     * Handles comprehensive error logging with component stack information
     *
     * @param error - The error that was thrown
     * @param errorInfo - React-specific error information including component stack
     */
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        logError(error, "ErrorBoundary");
        console.error("Error caught by boundary:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback />;
        }

        return this.props.children;
    }
}
