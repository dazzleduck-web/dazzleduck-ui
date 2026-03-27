/**
 * Validate required props for DazzleduckUI component
 * @param {string} tab - Tab type
 * @param {string} jwt - JWT token
 * @param {object} config - Configuration object
 * @returns {object|null} Returns error object if validation fails, null if valid
 */
export const validateRequiredProps = (tab, jwt, config) => {
    if (!tab || !jwt || !config || !config.serverUrl || !config.query) {
        return {
            type: 'error',
            title: 'Missing Required Props',
            message: 'Please provide: tab, jwt, and config object with serverUrl and query.',
            example: `
            <DazzleduckUI
                tab="analytics"
                jwt="YOUR_JWT_TOKEN"
                config={{
                  serverUrl: "https://api.example.com",
                  query: "SELECT * FROM users",
                  variables: { num: 5 }
                }}
                view="table"
                width={500}  // optional for "chart" tab
                height={400} // optional for "chart" tab
             />
             `
        };
    }
    return null;
};

/**
 * Validate tab value
 * @param {string} tab - Tab type to validate
 * @returns {object|null} Returns error object if validation fails, null if valid
 */
export const validateTab = (tab) => {
    const validTabs = ['search', 'analytics', 'chart'];
    if (!validTabs.includes(tab)) {
        return {
            type: 'warning',
            title: 'Invalid Tab Value',
            message: 'Tab must be one of: "search", "analytics", or "chart".'
        };
    }
    return null;
};
