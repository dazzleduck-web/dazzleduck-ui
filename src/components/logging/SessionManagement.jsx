import React, { useState } from "react";

const SessionManagement = ({
    isConnected,
    fileInputRef,
    handleSaveSession,
    handleOpenSession,
    handleImportFromUrl,
    openFileDialog
}) => {
    const [urlMode, setUrlMode] = useState(false);
    const [sessionUrl, setSessionUrl] = useState("");

    const handleUrlModeToggle = () => {
        setUrlMode(!urlMode);
        setSessionUrl("");
    };

    const handleImportUrl = () => {
        handleImportFromUrl(sessionUrl);
    };

    const handleOpenFileDialog = () => {
        openFileDialog();
        setUrlMode(false);
    }

    return (
        <div className="mt-4 pt-4 border-t border-gray-300 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Session Management</h3>

            <button
                onClick={handleSaveSession}
                disabled={!isConnected}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
                Save Session
            </button>

            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleOpenSession}
                className="hidden"
            />

            {urlMode && (
                <div className="space-y-2">
                    <input
                        type="url"
                        value={sessionUrl}
                        onChange={(e) => setSessionUrl(e.target.value)}
                        placeholder="https://example.com/session.json"
                        className="w-full border border-gray-400 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            )}

            <div className="flex gap-2">
                <button
                    onClick={handleOpenFileDialog}
                    className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-medium py-2 rounded-lg transition cursor-pointer"
                >
                    Local
                </button>

                {urlMode && sessionUrl.trim() ? (
                    <button
                        onClick={handleImportUrl}
                        className="flex-1 bg-indigo-800 hover:bg-indigo-900 text-white font-medium py-2 rounded-lg transition cursor-pointer"
                    >
                        Import
                    </button>
                ) : (
                    <button
                        onClick={handleUrlModeToggle}
                        className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-medium py-2 rounded-lg transition cursor-pointer"
                    >
                        {urlMode ? "Cancel" : "Remote"}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SessionManagement;