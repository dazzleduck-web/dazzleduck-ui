import React, { Component } from "react";
import { AiOutlineWarning } from "react-icons/ai";

/**
 * Config Error Boundary
 * Catches errors in AI Config component
 */
class ConfigErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Config Error Boundary caught an error:", error);
    this.setState({ error });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AiOutlineWarning className="text-yellow-600 text-lg flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900">Configuration Error</p>
              <p className="text-xs text-yellow-700 mt-1">
                There was an error with the AI configuration. Please try again or contact support.
              </p>
              <button
                onClick={this.handleReset}
                className="mt-2 text-xs font-medium text-yellow-800 hover:text-yellow-900"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ConfigErrorBoundary;
