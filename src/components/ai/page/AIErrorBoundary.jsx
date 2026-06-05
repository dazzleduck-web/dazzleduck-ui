import React, { Component } from "react";
import { AiOutlineExclamationCircle } from "react-icons/ai";

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

/**
 * AI Error Boundary
 * Catches errors in AI components and provides a graceful fallback
 */
class AIErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console in development
    if (isDev) {
      console.error("AI Error Boundary caught an error:", error, errorInfo);
    }

    // Log error details for debugging
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // You can also log the error to an error reporting service here
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="max-w-md text-center">
            <AiOutlineExclamationCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-lg font-semibold text-red-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-red-700 mb-4">
              The AI assistant encountered an unexpected error. You can try resetting the component or contact support if the problem persists.
            </p>

            {this.state.error && (
              <details className="mb-4 text-left">
                <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                  Error details
                </summary>
                <div className="mt-2 p-3 bg-red-100 rounded text-xs font-mono text-red-800 overflow-auto">
                  <div className="font-semibold">{this.state.error.toString()}</div>
                  {this.state.errorInfo && (
                    <div className="mt-2 text-red-700">
                      {this.state.errorInfo.componentStack}
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded hover:bg-gray-700 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AIErrorBoundary;
