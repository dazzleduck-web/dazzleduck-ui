import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQueryDashboard } from "../../context/QueryDashboardContext";
import QueryResults from "../dashboardcomponents/QueryResults";
import SearchTable from "../dashboardcomponents/SearchTable";
import DisplayCharts from "../DisplayCharts";
import { substituteVariables } from "../../hooks/useQueryManagement";
import { validateRequiredProps, validateTab } from "./utils/validateProps.jsx";
import { ValidationError, LoadingComponent, ErrorComponent } from "./utils/uiComponents.jsx";

/**
 * Initialize and fetch data for the DazzleduckUI component
 */
const initializeData = async (config, jwt, executeQuery, substituteVariables) => {
    const variables = config.variables || {};
    const queryWithVars = substituteVariables(config.query, variables);

    const result = await executeQuery(
        config.serverUrl,
        queryWithVars,
        0,
        jwt
    );

    return result.data || [];
};

/**
 * Filter data based on search query
 */
const filterDataBySearch = (data, query) => {
    if (!query || query.trim() === '') {
        return data;
    }

    const lowerQuery = query.toLowerCase();
    return data.filter((row) => {
        return Object.values(row).some((value) =>
            String(value).toLowerCase().includes(lowerQuery)
        );
    });
};

/**
 * Debounce hook to delay function execution
 * @param {Function} callback - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
const useDebounce = (callback, delay) => {
    const timeoutRef = useRef(null);
    const callbackRef = useRef(callback);

    // Keep callback ref in sync with latest callback
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    const debouncedCallback = useCallback((...args) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            callbackRef.current(...args);
        }, delay);
    }, [delay]);

    // Cleanup timeout on unmount or when callback/delay changes
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [delay]);

    return debouncedCallback;
};

/**
 * DazzleduckUI Component
 * A simple UI component for displaying query results in different views.
 *
 * IMPORTANT: This component must be wrapped with QueryDashboardProvider at the app level.
 * Example:
 *   <QueryDashboardProvider>
 *     <YourApp>
 *       <DazzleduckUI tab="analytics" jwt="..." config={{...} view="bar" width={500} height={400}} />
 *     </YourApp>
 *   </QueryDashboardProvider>
 *
 * @param {string} tab - Required: "search", "analytics", or "chart"
 * @param {string} jwt - Required: JWT token for authentication
 * @param {object} config - Required: Configuration object with:
 *   - serverUrl: string (e.g., "https://api.example.com/v1/query")
 *   - query: string (SQL query to execute)
 *   - variables: object (optional query variables)
 * @param {string} view - Optional: View type for "analytics" and "chart" tabs ("table", "line", "bar", "pie"). Default: "table"
 * @param {number} width - Optional: Chart width for "chart" tab. Default: 1200
 * @param {number} height - Optional: Chart height for "chart" tab. Default: 430
 */

const DazzleduckUI = ({ tab, jwt, config, view = "table", width, height }) => {
    const { executeQuery } = useQueryDashboard();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [searchError, setSearchError] = useState("");

    // Validate required props
    const requiredPropsError = validateRequiredProps(tab, jwt, config);
    if (requiredPropsError) {
        return <ValidationError error={requiredPropsError} />;
    }

    // Validate tab value
    const tabError = validateTab(tab);
    if (tabError) {
        return <ValidationError error={tabError} />;
    }

    // Track if initialization has already happened
    const hasInitialized = useRef(false);

    // Execute query on mount
    useEffect(() => {
        const initialize = async () => {
            try {
                setLoading(true);
                setError(null);

                const resultData = await initializeData(config, jwt, executeQuery, substituteVariables);

                setData(resultData);
                setLoading(false);
            } catch (err) {
                setError(err?.message || "Failed to execute query");
                setLoading(false);
            }
        };

        // Only initialize once
        if (!hasInitialized.current) {
            hasInitialized.current = true;
            initialize();
        }
    }, [jwt, config.serverUrl, config.query, JSON.stringify(config.variables), executeQuery, substituteVariables]);

    // Debounced search handler - updates the debounced query after 300ms
    const debouncedSearchHandler = useCallback((query) => {
        setDebouncedSearchQuery(query);
    }, []);

    const handleSearch = useDebounce(debouncedSearchHandler, 300);

    // Sync debounced search query when immediate search query changes
    useEffect(() => {
        handleSearch(searchQuery);
    }, [searchQuery, handleSearch]);

    // Clear search errors when query changes
    useEffect(() => {
        setSearchError("");
    }, [debouncedSearchQuery]);

    // Memoize filtered search data for performance
    const filteredSearchData = useMemo(() => {
        return filterDataBySearch(data, debouncedSearchQuery);
    }, [data, debouncedSearchQuery]);

    // Loading state
    if (loading) {
        return <LoadingComponent />;
    }

    // Error state
    if (error) {
        return <ErrorComponent error={error} />;
    }

    // Render based on tab
    switch (tab) {
        case "search":
            return (
                <SearchTable
                    title="Search Results"
                    data={filteredSearchData}
                    loading={false}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    onSearch={() => {}}
                    error={searchError}
                />
            );

        case "analytics":
            return (
                <QueryResults
                    data={data}
                    loading={false}
                    error={null}
                    view={view}
                    isConnected={true}
                    width={width}
                    height={height}
                />
            );

        case "chart":
            return (
                <div className="border overflow-auto max-h-112.5 bg-white rounded-lg scrollbar-custom p-2">
                    <DisplayCharts data={data} view={view} width={width} height={height} />
                </div>
            );

        default:
            return null;
    }
};

export default DazzleduckUI;
