import React from 'react'
import { QueryDashboardProvider } from '../../context/QueryDashboardContext';
import DazzleduckUI from './DazzleduckUI'

const Demo = () => {

    const jwt = "Bearer eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTc3NDYyMjE3NX0.QaWYH8xuEjoOQrT_3mRMcAH4X4FTBf4j6WdW_Km60T6mV9mQGMcwBQMT5oJgPvhNLg2EqvMqvMZUTmi57JopXQ";

    let query = `SELECT 1 AS StudentID, 'Alice' AS FirstName, 'Smith' AS LastName, 7.8 AS GPA UNION ALL SELECT 2, 'Bob', 'Johnson', 6.5 UNION ALL SELECT 3, 'Charlie', 'Davis', 8.9 UNION ALL SELECT 4, 'Rohan', 'Garg', 8.2;`;

    let analyticsQuery = `SELECT 1 AS StudentID, 'Alice' AS FirstName, 'Smith' AS LastName, 7.8 AS GPA UNION ALL SELECT 2, 'Bob', 'Johnson', 6.5 UNION ALL SELECT 3, 'Charlie', 'Davis', 8.9 UNION ALL SELECT 4, 'Rohan', 'Garg', 8.2 UNION ALL SELECT 5, 'Sarah', 'Miller', 9.1 UNION ALL SELECT 6, 'Kevin', 'Wilson', 7.2 UNION ALL SELECT 7, 'Priya', 'Sharma', 8.5 UNION ALL SELECT 8, 'Leo', 'Brown', 6.9 UNION ALL SELECT 9, 'Emma', 'Jones', 9.4 UNION ALL SELECT 10, 'Liam', 'Garcia', 7.5 UNION ALL SELECT 11, 'Olivia', 'Wang', 8.8 UNION ALL SELECT 12, 'Noah', 'Martinez', 6.2 UNION ALL SELECT 13, 'Sophia', 'Taylor', 8.1;`;

    // Example query with variable substitution
    let queryWithVariables = `SELECT {limit} AS StudentID, 'Alice' AS FirstName, 'Smith' AS LastName, 7.8 AS GPA UNION ALL SELECT 2, 'Bob', 'Johnson', 6.5 UNION ALL SELECT 3, 'Charlie', 'Davis', 8.9;`;

    const analyticsConfig = {
        serverUrl: "http://localhost:8081",
        query: analyticsQuery,
        variables: {}
    };

    const variablesConfig = {
        serverUrl: "http://localhost:8081",
        query: queryWithVariables,
        variables: { limit: 3 } // This will substitute {limit} with 3
    };

    return (
        <QueryDashboardProvider>
            <div className='p-5 m-10 grid grid-cols-2 gap-10'>
                {/* Example with variable substitution */}
                <DazzleduckUI
                    tab="analytics"
                    jwt={jwt}
                    config={variablesConfig}
                    view="bar"
                    width={500}
                    height={400}
                />

            <DazzleduckUI
                tab="analytics"
                jwt={jwt}
                config={{
                    serverUrl: "http://localhost:8081",
                    query: query,
                    variables: {}
                }}
                view="pie"
                width={500}
                height={400}
            />

            <DazzleduckUI
                tab="search"
                jwt={jwt}
                config={{
                    serverUrl: "http://localhost:8081",
                    query: query,
                    variables: {}
                }}
                view="pie"
                width={500}
                height={400}
            />

            <DazzleduckUI
                tab="analytics"
                jwt={jwt}
                config={analyticsConfig}
                view="table"
                width={500}
                height={400}
            />
            </div>
        </QueryDashboardProvider>
    )
}

export default Demo
