import React from 'react';

/**
 * Render error component for validation failures
 * @param {object} error - Error object with type, title, message, and optional example
 * @returns {JSX.Element}
 */
export const ValidationError = ({ error }) => {
    return (
        <div className={`p-4 h-fit border rounded-md ${error.type === 'error' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-yellow-100 border-yellow-400 text-yellow-700'}`}>
            <h3 className="font-bold text-lg">{error.title}</h3>
            <p className="mt-2 font-semibold">{error.message}</p>
            {error.example && (
                <pre className="mt-2 text-xs bg-red-50 p-2 rounded">
                    {error.example}
                </pre>
            )}
        </div>
    );
};

/**
 * Render loading component
 * @returns {JSX.Element}
 */
export const LoadingComponent = () => (
    <div className="p-8 text-center bg-white rounded-lg border border-gray-300 shadow-md">
        <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading data...</span>
        </div>
    </div>
);

/**
 * Render error component for data fetch errors
 * @param {string} error - Error message
 * @returns {JSX.Element}
 */
export const ErrorComponent = ({ error }) => (
    <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
        <h3 className="font-bold">Error</h3>
        <pre className="mt-2 text-sm whitespace-pre-wrap">{error}</pre>
    </div>
);
