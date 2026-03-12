import { useRef, useEffect, useState } from "react";

export const useSessionManagement = (
    saveSession,
    loadSession,
    loadSessionFromUrl,
    restoreSession,
    rows,
    populateConnectionData,
    restoreRows,
    showPopup
) => {
    const fileInputRef = useRef(null);

    const handleSaveSession = async () => {
        try {
            const currentQueries = rows.map(row => ({
                query: row.query,
                variables: row.variables,
                resultTitle: row.resultTitle || ""
            }));
            const sessionData = saveSession(currentQueries);
            const json = JSON.stringify(sessionData, null, 2);

            // Use File System Access API if available (modern browsers)
            if (window.showSaveFilePicker) {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: `dazzleduck-session-${new Date().toISOString().split('T')[0]}.json`,
                    types: [
                        {
                            description: "Dazzleduck-UI Session File",
                            accept: { "application/json": [".json"] },
                        },
                    ],
                });

                const writable = await fileHandle.createWritable();
                await writable.write(json);
                await writable.close();
            } else {
                // Fallback for other browsers: create a download link
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = url;
                a.download = `dazzleduck-session-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                URL.revokeObjectURL(url);
            }

            showPopup("Session saved successfully!", "success");
        } catch (err) {
            if (err?.name === "AbortError") return;
            showPopup("Failed to save session: " + err.message, "error");
        }
    };

    const handleOpenSession = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const sessionData = await loadSession(file);
            await restoreSession(sessionData);

            populateConnectionData(sessionData);
            restoreRows(sessionData.queries || []);

            showPopup(`Session loaded. Please enter password and click Connect.`, "success");

            event.target.value = '';
        } catch (err) {
            showPopup("Failed to load session: " + err.message, "error");
            event.target.value = '';
        }
    };

    const handleImportFromUrl = async (url) => {
        if (!url?.trim()) {
            showPopup("Please enter a session URL", "error");
            return;
        }

        const trimmedUrl = url.trim();

        // Validate URL protocol - only allow HTTP/HTTPS
        if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
            if (trimmedUrl.startsWith("s3://")) {
                showPopup("S3 URLs are not supported. Please use a presigned HTTPS URL or download the file and import it directly.", "error");
            } else {
                showPopup("Only HTTP and HTTPS URLs are supported for session import.", "error");
            }
            return;
        }

        try {
            const sessionData = await loadSessionFromUrl(trimmedUrl);
            await restoreSession(sessionData);

            populateConnectionData(sessionData);
            restoreRows(sessionData.queries || []);

            showPopup(`Session loaded from URL. Please enter password and click Connect.`, "success");
        } catch (err) {
            showPopup("Failed to load session from URL: " + err.message, "error");
        }
    };

    const openFileDialog = () => {
        fileInputRef.current?.click();
    };

    // Auto-import from URL parameter on mount
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionUrl = urlParams.get('session');

        if (sessionUrl) {
            const loadFromUrl = async () => {
                try {
                    const sessionData = await loadSessionFromUrl(sessionUrl);
                    await restoreSession(sessionData);

                    populateConnectionData(sessionData);
                    restoreRows(sessionData.queries || []);

                    showPopup(`Session loaded from URL. Please enter password and click Connect.`, "success");
                } catch (err) {
                    showPopup("Failed to auto-load session from URL: " + err.message, "error");
                }
            };

            loadFromUrl();
        }
    }, []);

    return {
        fileInputRef,
        handleSaveSession,
        handleOpenSession,
        handleImportFromUrl,
        openFileDialog,
    };
};
