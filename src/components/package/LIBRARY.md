# DazzleduckUI NPM Library

A simplified React component library for displaying DazzleDuck query results with three viewing modes: Search, Analytics, and Charts.

---

## Overview

`DazzleduckUI` is a single, easy-to-use React component that provides instant query result visualization with minimal setup. It handles authentication, data fetching, filtering, and visualization all in one component.

### Why Use DazzleduckUI?

- **Zero Configuration**: Just pass your JWT and query - it handles everything else
- **Three Display Modes**: Search, Analytics, and Chart views in one component
- **Optimized Performance**: Debounced search with memoized filtering
- **Built-in Validation**: Clear error messages for missing or invalid props
- **Variable Substitution**: Easy parameter substitution in SQL queries
- **JWT-Only Mode**: Direct token authentication for API integrations
- **Responsive Charts**: D3.js visualizations with customizable dimensions

---

## Installation

```bash
npm install dazzleduck-arrow-ui --legacy-peer-deps
```

### Peer Dependencies

Ensure your project has these dependencies installed:

```json
{
  "react": "^18.0.0 || ^19.0.0",
  "react-dom": "^18.0.0 || ^19.0.0",
  "d3": "^7.9.0",
  "js-cookie": "^3.0.5",
  "react-icons": "^5.5.0",
  "tailwindcss": "^4.1.16"
}
```
> If the latest versions cause conflicts, pin your dependencies to the versions used in the dazzleduck-ui reference project.

---

## Quick Start

### 1. Wrap Your App with Provider

```jsx
import { QueryDashboardProvider } from 'dazzleduck-arrow-ui';

function App() {
  return (
    <QueryDashboardProvider>
      <YourAppComponents />
    </QueryDashboardProvider>
  );
}
```

### 2. Use DazzleduckUI Component

```jsx
import { DazzleduckUI } from 'dazzleduck-arrow-ui';

<DazzleduckUI
  tab="analytics"
  jwt="Bearer your-jwt-token"
  config={{
    serverUrl: "http://localhost:8081",
    query: "SELECT * FROM users",
  }}
  view="table"
/>
```

---

## Component API

### Props Reference

| Prop | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `tab` | `"search" \| "analytics" \| "chart"` | ✅ Yes | - | Display mode for results |
| `jwt` | `string` | ✅ Yes | - | JWT authentication token |
| `config` | `object` | ✅ Yes | - | Query configuration object |
| `config.serverUrl` | `string` | ✅ Yes | - | DazzleDuck server URL |
| `config.query` | `string` | ✅ Yes | - | SQL query to execute |
| `config.variables` | `object` | ❌ No | - | Query variables for substitution |
| `view` | `"table" \| "line" \| "bar" \| "pie"` | ❌ No | `"table"` | View type for analytics/chart modes |
| `width` | `number` | ❌ No | `1200` | Chart width (pixels) |
| `height` | `number` | ❌ No | `430` | Chart height (pixels) |

---

## Display Modes

### 1. Search Mode (`tab="search"`)

Interactive table with client-side search, pagination, and detailed row expansion.

```jsx
<DazzleduckUI
  tab="search"
  jwt="Bearer your-jwt-token"
  config={{
    serverUrl: "http://localhost:8081",
    query: "SELECT * FROM products WHERE price > {minPrice}",
    variables: { minPrice: 100 }
  }}
/>
```

**Features:**
- Debounced auto-search (300ms delay)
- Memoized filtering for performance
- Pagination (5, 10, 20, 50, 100 rows per page)
- Row expansion with JSON detail view
- Field sidebar for column selection

### 2. Analytics Mode (`tab="analytics"`)

Displays results with selectable view type (table, line, bar, pie).

```jsx
<DazzleduckUI
  tab="analytics"
  jwt="Bearer your-jwt-token"
  config={{
    serverUrl: "http://localhost:8081",
    query: "SELECT date, sales FROM orders",
  }}
  view="line"
  width={800}
  height={400}
/>
```

**View Types:**
- `view="table"`: Standard data table with sticky headers
- `view="line"`: Line chart for time series
- `view="bar"`: Bar chart for categorical data
- `view="pie"`: Pie chart for proportions

### 3. Chart Mode (`tab="chart"`)

Chart-focused view with auto-sizing and responsive layout.

```jsx
<DazzleduckUI
  tab="chart"
  jwt="Bearer your-jwt-token"
  config={{
    serverUrl: "http://localhost:8081",
    query: "SELECT category, SUM(amount) as total FROM sales GROUP BY category",
  }}
  view="pie"
  width={600}
  height={400}
/>
```

---

## Advanced Features

### Variable Substitution

Use `{variableName}` syntax in queries and provide values via `config.variables`:

```jsx
<DazzleduckUI
  tab="analytics"
  jwt="Bearer your-jwt-token"
  config={{
    serverUrl: "http://localhost:8081",
    query: `
      SELECT
        {limit} AS id,
        name,
        email
      FROM users
      WHERE status = '{status}'
    `,
    variables: {
      limit: 100,
      status: 'active'
    }
  }}
  view="table"
/>
```

**Resulting Query:**
```sql
SELECT
  100 AS id,
  name,
  email
FROM users
WHERE status = 'active'
```

### JWT-Only Authentication

For API integrations where you already have a JWT token:

```jsx
<DazzleduckUI
  tab="search"
  jwt="Bearer eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ..."
  config={{
    serverUrl: "https://api.your-domain.com",
    query: "SELECT * FROM data",
  }}
/>
```

No need for username/password - just pass your existing JWT token directly.

### Custom Chart Dimensions

Adjust chart size for your layout:

```jsx
<DazzleduckUI
  tab="chart"
  jwt="Bearer your-jwt-token"
  config={{
    serverUrl: "http://localhost:8081",
    query: "SELECT month, revenue FROM sales",
  }}
  view="line"
  width={1200}  // Default: 1200
  height={430}   // Default: 430
/>
```

---

## Examples

### Example 1: Multiple Widgets

```jsx
import { QueryDashboardProvider, DazzleduckUI } from 'dazzleduck-arrow-ui';

const Dashboard = () => {
  const jwt = "Bearer your-jwt-token";

  return (
    <QueryDashboardProvider>
      <div className="grid grid-cols-2 gap-4 p-4">
        {/* Widget 1: Sales Chart */}
        <DazzleduckUI
          tab="chart"
          jwt={jwt}
          config={{
            serverUrl: "http://localhost:8081",
            query: "SELECT product, SUM(amount) as total FROM sales GROUP BY product",
          }}
          view="bar"
          width={500}
          height={400}
        />

        {/* Widget 2: Revenue Trend */}
        <DazzleduckUI
          tab="chart"
          jwt={jwt}
          config={{
            serverUrl: "http://localhost:8081",
            query: "SELECT date, SUM(amount) as revenue FROM sales GROUP BY date ORDER BY date",
          }}
          view="line"
          width={500}
          height={400}
        />

        {/* Widget 3: Search */}
        <DazzleduckUI
          tab="search"
          jwt={jwt}
          config={{
            serverUrl: "http://localhost:8081",
            query: "SELECT * FROM customers",
          }}
          width={500}
          height={400}
        />

        {/* Widget 4: Top Products */}
        <DazzleduckUI
          tab="analytics"
          jwt={jwt}
          config={{
            serverUrl: "http://localhost:8081",
            query: "SELECT product, category, sales FROM top_products LIMIT 10",
          }}
          view="table"
          width={500}
          height={400}
        />
      </div>
    </QueryDashboardProvider>
  );
};
```

### Example 2: Dynamic Dashboard

```jsx
import { useState } from 'react';
import { QueryDashboardProvider, DazzleduckUI } from 'dazzleduck-arrow-ui';

const DynamicDashboard = () => {
  const [selectedTab, setSelectedTab] = useState('analytics');

  return (
    <QueryDashboardProvider>
      <div className="p-6">
        {/* Tab Controls */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setSelectedTab('analytics')}
            className={`px-4 py-2 rounded ${selectedTab === 'analytics' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Analytics
          </button>
          <button
            onClick={() => setSelectedTab('search')}
            className={`px-4 py-2 rounded ${selectedTab === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Search
          </button>
        </div>

        {/* Conditional Display */}
        {selectedTab === 'analytics' && (
          <DazzleduckUI
            tab="analytics"
            jwt="Bearer your-jwt-token"
            config={{
              serverUrl: "http://localhost:8081",
              query: "SELECT * FROM analytics_data",
            }}
            view="bar"
          />
        )}

        {selectedTab === 'search' && (
          <DazzleduckUI
            tab="search"
            jwt="Bearer your-jwt-token"
            config={{
              serverUrl: "http://localhost:8081",
              query: "SELECT * FROM searchable_data",
            }}
          />
        )}
      </div>
    </QueryDashboardProvider>
  );
};
```

### Example 3: API Integration

```jsx
import { useEffect, useState } from 'react';
import { QueryDashboardProvider, DazzleduckUI } from 'dazzleduck-arrow-ui';

const ApiIntegrationDashboard = () => {
  const [jwt, setJwt] = useState(null);

  useEffect(() => {
    // Fetch JWT from your API
    const fetchToken = async () => {
      const response = await fetch('https://your-api.com/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'your-api-key' })
      });
      const data = await response.json();
      setJwt(`Bearer ${data.token}`);
    };

    fetchToken();
  }, []);

  if (!jwt) return <div>Loading...</div>;

  return (
    <QueryDashboardProvider>
      <DazzleduckUI
        tab="analytics"
        jwt={jwt}
        config={{
          serverUrl: "https://dazzleduck.your-domain.com",
          query: "SELECT timestamp, value FROM metrics ORDER BY timestamp DESC LIMIT 100",
        }}
        view="line"
        width={1000}
        height={400}
      />
    </QueryDashboardProvider>
  );
};
```

---

## Validation & Error Handling

The component includes built-in validation for required props:

### Missing Props Error
```
❌ Missing Required Props

Please provide: tab, jwt, and config object with serverUrl and query.

Example:
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
```

### Invalid Tab Error
```
⚠️ Invalid Tab Value

Tab must be one of: "search", "analytics", or "chart".
```

### Data Fetch Error
```
❌ Error

Failed to execute query: Connection refused
```

---

## Performance Features

### Debounced Search
- **Delay**: 300ms after user stops typing
- **Benefit**: Prevents excessive filtering operations
- **Result**: Smoother typing experience on large datasets

### Memoized Filtering
- **Caching**: Filtered results are cached until data or query changes
- **Benefit**: Instant re-renders without re-filtering
- **Result**: Better performance with 1000+ rows

### Optimized Rendering
- **Conditional Rendering**: Components only render when data is available
- **Cleanup**: Proper timeout cleanup on unmount
- **Result**: No memory leaks, smoother UX

---

## Styling

The component uses Tailwind CSS classes for styling. Ensure Tailwind is configured in your project:

### Custom Styling

You can override styles by providing custom CSS or modifying component props:

```jsx
<div className="my-custom-container">
  <DazzleduckUI
    tab="analytics"
    jwt="Bearer your-jwt-token"
    config={{
      serverUrl: "http://localhost:8081",
      query: "SELECT * FROM data",
    }}
    view="table"
  />
</div>
```

---

## FAQ

### Q: Can I use multiple DazzleduckUI components on the same page?
**A:** Yes! Each component is independent and can fetch different queries.

### Q: Does it work with Next.js?
**A:** Yes, but wrap with `'use client'` directive:
```jsx
'use client';
import { QueryDashboardProvider, DazzleduckUI } from 'dazzleduck-arrow-ui';
```

### Q: How do I handle expired JWTs?
**A:** The component will show an error. You'll need to refresh the JWT and remount the component.

### Q: Can I customize the search timeout?
**A:** Currently fixed at 300ms for optimal performance. This may be configurable in future versions.

### Q: Does it support server-side pagination?
**A:** Currently client-side pagination only. Server-side pagination would require backend changes.

### Q: Can I use it without Tailwind CSS?
**A:** The component uses Tailwind classes internally. You'd need to provide equivalent styles or override classes.

### Q: What's the difference between "analytics" and "chart" tabs?
**A:** Both show the same view types. "chart" tab focuses on visualization while "analytics" includes table options. Use whichever fits your needs.

---

## Troubleshooting

### "Failed to execute query"
- **Cause**: Invalid JWT token or server connection issue
- **Solution**: Verify JWT is valid and server is accessible

### "Missing Required Props"
- **Cause**: Missing `tab`, `jwt`, or `config` prop
- **Solution**: Check that all required props are provided

### Charts not rendering
- **Cause**: Insufficient data or wrong column types
- **Solution**: Ensure query returns numeric columns for charts

### Search not filtering
- **Cause**: Search query timing (debounce delay)
- **Solution**: Wait 300ms after typing completes

### Styles not applying
- **Cause**: Tailwind CSS not configured
- **Solution**: Add `node_modules/dazzleduck-arrow-ui` to Tailwind content

---

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Modern browsers with ES6+ support

---

## Contributing

Found a bug or have a feature request? Please open an issue on GitHub.

---

## License

See package repository for licensing information.

---

## Version History

### v1.0.16+
- ✅ Added DazzleduckUI component
- ✅ Implemented debounced search with memoization
- ✅ Added variable substitution support
- ✅ Added JWT-only authentication mode
- ✅ Enhanced error validation and messaging
