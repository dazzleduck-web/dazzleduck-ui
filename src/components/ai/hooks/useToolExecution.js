import { useCallback } from "react";
import { useQueryDashboard } from "../../../context/QueryDashboardContext";
import { runTool } from "../tools/toolRegistry";

export function useToolExecution() {
  const queryDashboard = useQueryDashboard();

  const createToolContext = useCallback(() => {
    return {
      serverUrl: queryDashboard.connectionInfo?.serverUrl,
      jwtToken: queryDashboard.jwtToken,
      executeQuery: queryDashboard.executeQuery,
      fetchNamedQueries: queryDashboard.fetchNamedQueries,
      getNamedQuery: queryDashboard.getNamedQuery,
      executeNamedQuery: queryDashboard.executeNamedQuery,
    };
  }, [queryDashboard]);

  const callTool = useCallback(async (name, args = {}) => {
    const context = createToolContext();
    return await runTool(name, args, context);
  }, [createToolContext]);

  const listDatabases = useCallback(async () => {
    return await callTool("listDatabases");
  }, [callTool]);

  const listTables = useCallback(async (databaseName = "") => {
    return await callTool("listTables", { databaseName });
  }, [callTool]);

  const listNamedQueries = useCallback(async () => {
    return await callTool("listNamedQueries");
  }, [callTool]);

  const getNamedQuery = useCallback(async (queryName) => {
    return await callTool("getNamedQuery", { queryName });
  }, [callTool]);

  const executeQuery = useCallback(async (query, explanation = "") => {
    return await callTool("executeQuery", { query, explanation });
  }, [callTool]);

  const executeNamedQuery = useCallback(async (queryName, parameters = {}) => {
    return await callTool("executeNamedQuery", { queryName, parameters });
  }, [callTool]);

  const executeAllNamedQueries = useCallback(async (queryGroup = "") => {
    return await callTool("executeAllNamedQueries", { queryGroup });
  }, [callTool]);

  const describeTable = useCallback(async (tableName, databaseName = "") => {
    return await callTool("describeTable", { tableName, databaseName });
  }, [callTool]);

  return {
    createToolContext,
    callTool,
    listDatabases,
    listTables,
    listNamedQueries,
    getNamedQuery,
    executeQuery,
    executeNamedQuery,
    executeAllNamedQueries,
    describeTable,
  };
}

export default useToolExecution;
