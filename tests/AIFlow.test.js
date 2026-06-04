import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import AIChat from "../src/components/ai/AIChat";

const AI_TEST_STATE = vi.hoisted(() => {
  const geminiResponses = [];

  const mockQueryDashboard = {
    connectionInfo: { serverUrl: "http://localhost:8081" },
    jwtToken: "Bearer test-token",
    executeQuery: vi.fn(async (_serverUrl, query) => {
      if (/datname|show databases/i.test(query)) {
        return {
          data: [
            { database_name: "main_db" },
            { database_name: "analytics_db" },
          ],
        };
      }

      return {
        data: [
          { order_id: 1, total: 120 },
          { order_id: 2, total: 150 },
        ],
      };
    }),
    fetchNamedQueries: vi.fn(async () => ([
      {
        id: 1,
        name: "first_query",
        description: "First query",
        preferred_display: "table",
        query_group: "default",
      },
      {
        id: 2,
        name: "second_query",
        description: "Second query",
        preferred_display: "table",
        query_group: "default",
      },
      {
        id: 3,
        name: "third_query",
        description: "Third query",
        preferred_display: "line",
        query_group: "default",
      },
    ])),
    getNamedQuery: vi.fn(async (_serverUrl, queryName) => ({
      name: queryName,
      description: "Third named query",
      preferred_display: "line",
    })),
    executeNamedQuery: vi.fn(async () => ([
      { month: "2024-01", total: 120 },
      { month: "2024-02", total: 150 },
    ])),
  };

  const mockAIConfig = {
    config: {
      geminiApiKey: "valid-api-key",
      geminiModel: "gemini-2.5-flash",
      isValid: true,
      rememberMe: false,
    },
    hasValidConfig: true,
    needsConfig: false,
    isValidating: false,
    validationError: null,
    availableModels: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "free", default: true },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "paid", default: false },
    ],
    defaultModel: "gemini-2.5-flash",
    model: "gemini-2.5-flash",
    setAIConfig: vi.fn(),
    clearConfig: vi.fn(),
    updateModel: vi.fn(),
    revalidateConfig: vi.fn(),
  };

  const emptyGeminiResponse = () => ({
    response: {
      functionCalls: () => [],
      text: () => "",
    },
  });

  const sendMessageMock = vi.fn(async () => geminiResponses.shift() ?? emptyGeminiResponse());

  return {
    geminiResponses,
    mockQueryDashboard,
    mockAIConfig,
    sendMessageMock,
  };
});

vi.mock("../src/context/useAIConfig", () => ({
  useAIConfig: () => AI_TEST_STATE.mockAIConfig,
}));

vi.mock("../src/context/QueryDashboardContext.jsx", () => ({
  useQueryDashboard: () => AI_TEST_STATE.mockQueryDashboard,
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: function GoogleGenerativeAI() {
    return {
      getGenerativeModel: vi.fn().mockReturnValue({
        startChat: vi.fn().mockReturnValue({
          sendMessage: AI_TEST_STATE.sendMessageMock,
        }),
      }),
    };
  },
  FunctionCallingMode: {
    AUTO: "AUTO",
  },
}));

vi.mock("../src/components/dashboardcomponents/DataTable.jsx", () => ({
  default: ({ data = [], title = "Results" }) => React.createElement(
    "div",
    { "data-testid": "result-table" },
    React.createElement("div", null, title),
    React.createElement("div", null, `rows:${data.length}`),
    ...data.map((row, index) => React.createElement("div", { key: index }, JSON.stringify(row)))
  ),
}));

vi.mock("../src/components/DisplayCharts.jsx", () => ({
  default: ({ data = [], view }) => React.createElement(
    "div",
    { "data-testid": "display-charts" },
    `view:${view} rows:${data.length}`
  ),
}));

vi.mock("../src/components/dashboardcomponents/namedquery/QueryViews", () => ({
  QueryResultDisplay: ({ queryName, data = [] }) => React.createElement(
    "div",
    { "data-testid": "query-result-display" },
    React.createElement("div", null, queryName),
    React.createElement("div", null, `rows:${data.length}`)
  ),
}));

vi.mock("../src/components/utils/useVisualizationFallback.js", () => ({
  useVisualizationFallback: ({ onDisplayChange }) => ({
    fallbackToTable: false,
    handleDisplayChange: onDisplayChange,
  }),
}));

vi.mock("../src/components/ai/util/MessageRenderer.jsx", () => ({
  default: ({ message }) => React.createElement(
    "div",
    { "data-testid": `chat-message-${message.kind || "text"}` },
    `${message.role}:${message.content || ""}`
  ),
}));

vi.mock("../src/components/ai/page/AIErrorBoundary.jsx", () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));

vi.mock("../src/components/ai/page/ConfigErrorBoundary.jsx", () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));

const queueGeminiToolResponse = (toolCalls, text = "") => {
  AI_TEST_STATE.geminiResponses.push({
    response: {
      functionCalls: () => toolCalls,
      text: () => text,
    },
  });
};

const renderChat = () => render(React.createElement(AIChat));

const sendChatMessage = async (message) => {
  const input = screen.getByPlaceholderText("Ask a database question…");
  await act(async () => {
    fireEvent.change(input, { target: { value: message } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
  });
};

beforeEach(() => {
  AI_TEST_STATE.geminiResponses.length = 0;
  AI_TEST_STATE.sendMessageMock.mockClear();
  AI_TEST_STATE.mockQueryDashboard.executeQuery.mockClear();
  AI_TEST_STATE.mockQueryDashboard.fetchNamedQueries.mockClear();
  AI_TEST_STATE.mockQueryDashboard.getNamedQuery.mockClear();
  AI_TEST_STATE.mockQueryDashboard.executeNamedQuery.mockClear();
  AI_TEST_STATE.mockAIConfig.setAIConfig.mockClear();
  AI_TEST_STATE.mockAIConfig.clearConfig.mockClear();
  AI_TEST_STATE.mockAIConfig.updateModel.mockClear();
  AI_TEST_STATE.mockAIConfig.revalidateConfig.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(callback, 0));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI assistant workflows", () => {
  it("runs the named query flow from list to confirmation to rendered results", async () => {
    renderChat();

    await sendChatMessage("show named queries");

    await waitFor(() => {
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:3")).toBeInTheDocument();
      expect(screen.getByText(/third_query/i)).toBeInTheDocument();
    });

    queueGeminiToolResponse([
      {
        name: "executeNamedQuery",
        args: {
          queryName: "third_query",
          parameters: {},
        },
      },
    ]);

    await sendChatMessage("execute 3rd named query");

    await waitFor(() => {
      expect(screen.getByText("Named Query Preview")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Execute$/i })).toBeInTheDocument();
      expect(screen.getByText(/I prepared a named query for review/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Execute$/i }));

    await waitFor(() => {
      expect(AI_TEST_STATE.mockQueryDashboard.getNamedQuery).toHaveBeenCalledWith(
        "http://localhost:8081",
        "third_query"
      );
      expect(AI_TEST_STATE.mockQueryDashboard.executeNamedQuery).toHaveBeenCalledWith(
        "http://localhost:8081",
        "third_query",
        {}
      );
      expect(screen.getByTestId("display-charts")).toHaveTextContent("view:line rows:2");
    });
  });

  it("runs all named queries from a direct request and renders the bulk summary", async () => {
    renderChat();

    queueGeminiToolResponse([
      {
        name: "executeAllNamedQueries",
        args: {},
      },
    ]);

    await sendChatMessage("run all named queries");

    // Wait for the preview to appear
    const previewButton = await screen.findByRole("button", { name: /^Execute$/i });
    expect(screen.getByText("Named Queries Preview")).toBeInTheDocument();
    expect(screen.getByText(/I prepared all named queries/i)).toBeInTheDocument();

    // Click Execute and wait for results
    await act(async () => {
      fireEvent.click(previewButton);
    });

    await waitFor(() => {
      expect(AI_TEST_STATE.mockQueryDashboard.fetchNamedQueries).toHaveBeenCalledWith(
        "http://localhost:8081",
        0,
        1000
      );
      expect(AI_TEST_STATE.mockQueryDashboard.executeNamedQuery).toHaveBeenCalledTimes(3);
    }, { timeout: 3000 });

    // Check results
    expect(screen.getByText(/first_query/i)).toBeInTheDocument();
    expect(screen.getByText(/second_query/i)).toBeInTheDocument();
    expect(screen.getByText(/third_query/i)).toBeInTheDocument();
  });

  it("runs the SQL query flow from generation to confirmation to rendered results", async () => {
    renderChat();

    queueGeminiToolResponse([
      {
        name: "executeQuery",
        args: {
          query: "SELECT order_id, total FROM orders ORDER BY order_id",
          explanation: "Fetch recent order totals",
        },
      },
    ]);

    await sendChatMessage("generate query");

    await waitFor(() => {
      expect(screen.getByText("SQL Preview")).toBeInTheDocument();
      expect(screen.getByText(/SELECT order_id, total FROM orders/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Execute$/i }));

    await waitFor(() => {
      expect(AI_TEST_STATE.mockQueryDashboard.executeQuery).toHaveBeenCalledWith(
        "http://localhost:8081",
        "SELECT order_id, total FROM orders ORDER BY order_id LIMIT 100",
        0,
        "Bearer test-token"
      );
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:2")).toBeInTheDocument();
    });
  });

  it("renders normalized database rows in the results section", async () => {
    renderChat();

    await sendChatMessage("show databases");

    await waitFor(() => {
      expect(AI_TEST_STATE.mockQueryDashboard.executeQuery).toHaveBeenCalled();
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:2")).toBeInTheDocument();
      expect(screen.getByText(/main_db/i)).toBeInTheDocument();
      expect(screen.getByText(/analytics_db/i)).toBeInTheDocument();
    });
  });

  it("renders normalized named query rows in the results section", async () => {
    renderChat();

    await sendChatMessage("show named queries");

    await waitFor(() => {
      expect(AI_TEST_STATE.mockQueryDashboard.fetchNamedQueries).toHaveBeenCalledWith(
        "http://localhost:8081",
        0,
        1000
      );
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:3")).toBeInTheDocument();
      expect(screen.getByText(/first_query/i)).toBeInTheDocument();
      expect(screen.getByText(/second_query/i)).toBeInTheDocument();
      expect(screen.getByText(/third_query/i)).toBeInTheDocument();
    });
  });

  it("restores the latest result data after the assistant is unmounted and remounted", async () => {
    const firstRender = renderChat();

    await sendChatMessage("show databases");

    await waitFor(() => {
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:2")).toBeInTheDocument();
    });

    expect(sessionStorage.getItem("dazzleduck_ai_chat")).toContain("\"resultRows\"");

    firstRender.unmount();

    renderChat();

    await waitFor(() => {
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:2")).toBeInTheDocument();
      expect(screen.getByText(/main_db/i)).toBeInTheDocument();
      expect(screen.getByText(/analytics_db/i)).toBeInTheDocument();
    });
  });

  it("keeps the current result data when the next assistant message has no new results", async () => {
    renderChat();

    await sendChatMessage("show databases");

    await waitFor(() => {
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:2")).toBeInTheDocument();
    });

    await sendChatMessage("thanks");

    await waitFor(() => {
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:2")).toBeInTheDocument();
      expect(screen.getByText(/main_db/i)).toBeInTheDocument();
      expect(screen.getByText(/analytics_db/i)).toBeInTheDocument();
    });
  });

  it("lists tables from a specific database when the user names one", async () => {
    AI_TEST_STATE.mockQueryDashboard.executeQuery.mockImplementationOnce(async (_serverUrl, query) => {
      if (/SHOW TABLES FROM/i.test(query)) {
        return {
          data: [
            { table_name: "orders" },
            { table_name: "customers" },
          ],
        };
      }

      return {
        data: [],
      };
    });

    renderChat();

    await sendChatMessage("show tables from named_query");

    await waitFor(() => {
      expect(AI_TEST_STATE.mockQueryDashboard.executeQuery).toHaveBeenCalledWith(
        "http://localhost:8081",
        'SHOW TABLES FROM "named_query"',
        0,
        "Bearer test-token"
      );
      expect(screen.getByTestId("result-table")).toBeInTheDocument();
      expect(screen.getByText("rows:2")).toBeInTheDocument();
      expect(screen.getByText(/orders/i)).toBeInTheDocument();
      expect(screen.getByText(/customers/i)).toBeInTheDocument();
    });
  });

  it("prompts for a database when the current database has no tables", async () => {
    AI_TEST_STATE.mockQueryDashboard.executeQuery.mockImplementationOnce(async (_serverUrl, query) => {
      if (/^SHOW TABLES$/i.test(query)) {
        return { data: [] };
      }

      return {
        data: [],
      };
    });

    renderChat();

    await sendChatMessage("show tables");

    await waitFor(() => {
      expect(screen.getByText(/No tables were found in the current database/i)).toBeInTheDocument();
      expect(screen.getByText(/Available databases:/i)).toBeInTheDocument();
      expect(screen.getByText(/main_db/i)).toBeInTheDocument();
      expect(screen.getByText(/analytics_db/i)).toBeInTheDocument();
    });

    expect(screen.queryByTestId("result-table")).not.toBeInTheDocument();
  });
});
