import React from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MessageRenderer from "../src/components/ai/util/MessageRenderer.jsx";
import {
  MESSAGE_KIND,
  createQueryResultMessage,
  createTextMessage,
  createErrorMessage,
  createConfirmationMessage,
  normalizeChatMessage,
} from "../src/components/ai/util/chatMessageUtils.js";

vi.mock("../src/components/ai/util/ChatMessage.jsx", () => ({
  default: ({ message, variant = "default" }) => React.createElement(
    "div",
    {
      "data-testid": `chat-message-${variant}`,
      "data-role": message?.role || "",
      "data-content": message?.content || "",
    },
    message?.content || ""
  ),
}));

vi.mock("../src/components/ai/util/ResultVisualization.jsx", () => ({
  default: ({ title, rows = [], metadata, showPopup, showDisplaySelector, defaultRows }) => React.createElement(
    "div",
    {
      "data-testid": "result-visualization",
      "data-title": title || "",
      "data-rows": String(rows.length),
      "data-metadata": JSON.stringify(metadata || {}),
      "data-show-popup": String(Boolean(showPopup)),
      "data-show-display-selector": String(Boolean(showDisplaySelector)),
      "data-default-rows": String(defaultRows),
    },
    title
  ),
}));

vi.mock("../src/components/dashboardcomponents/namedquery/QueryViews", () => ({
  QueryResultDisplay: ({ queryName, data = [] }) => React.createElement(
    "div",
    {
      "data-testid": "query-result-display",
      "data-query-name": queryName,
      "data-rows": String(data.length),
    },
    queryName
  ),
}));

describe("chatMessageUtils", () => {
  it("creates a query-result message without adding execution logic", () => {
    const message = createQueryResultMessage({
      content: "Preview",
      result: {
        rows: [{ id: 1 }],
        metadata: { preferredDisplay: "table" },
        title: "Query Results",
      },
    });

    expect(message.kind).toBe(MESSAGE_KIND.queryResult);
    expect(message.content).toBe("Preview");
    expect(message.result.rows).toEqual([{ id: 1 }]);
    expect(message.result.metadata).toEqual({ preferredDisplay: "table" });
  });

  it("preserves legacy message shapes during normalization", () => {
    expect(normalizeChatMessage({
      id: "msg-1",
      role: "assistant",
      kind: MESSAGE_KIND.queryResult,
      content: "Done",
      result: { rows: [{ id: 1 }] },
    })).toMatchObject({
      id: "msg-1",
      role: "assistant",
      kind: MESSAGE_KIND.queryResult,
      content: "Done",
    });
  });

  it("creates schema-only text, error, and confirmation messages", () => {
    expect(createTextMessage("user", "hello").kind).toBe(MESSAGE_KIND.text);
    expect(createErrorMessage("boom").kind).toBe(MESSAGE_KIND.error);
    expect(createConfirmationMessage("confirm").kind).toBe(MESSAGE_KIND.confirmation);
  });
});

describe("MessageRenderer", () => {
  it("routes text, error, and confirmation messages to ChatMessage", () => {
    render(<MessageRenderer message={createTextMessage("assistant", "hello")} />);
    expect(screen.getByTestId("chat-message-default")).toHaveTextContent("hello");

    cleanup();
    render(<MessageRenderer message={createErrorMessage("boom")} />);
    expect(screen.getByTestId("chat-message-error")).toHaveTextContent("boom");

    cleanup();
    render(<MessageRenderer message={createConfirmationMessage("confirm")} />);
    expect(screen.getByTestId("chat-message-confirmation")).toHaveTextContent("confirm");
  });

  it("renders query-result messages with ResultVisualization directly", () => {
    render(
      <MessageRenderer
        showPopup={vi.fn()}
        message={createQueryResultMessage({
          content: "Result summary",
          result: {
            rows: [{ id: 1 }, { id: 2 }],
            metadata: { preferredDisplay: "line" },
            title: "Query Results",
          },
        })}
      />
    );

    expect(screen.getByText("Result summary")).toBeInTheDocument();
    expect(screen.getByTestId("result-visualization")).toHaveAttribute("data-title", "Query Results");
    expect(screen.getByTestId("result-visualization")).toHaveAttribute("data-rows", "2");
    expect(screen.getByTestId("result-visualization")).toHaveAttribute(
      "data-metadata",
      JSON.stringify({ preferredDisplay: "line" })
    );
  });

  it("renders bulk named-query messages with per-query results", () => {
    render(
      <MessageRenderer
        showPopup={vi.fn()}
        message={createQueryResultMessage({
          content: "Executed 2 named queries.",
          result: {
            rows: [
              { queryName: "first_query", query_group: "dashboard", preferredDisplay: "table", success: true, rowCount: 2 },
              { queryName: "second_query", query_group: "dashboard", preferredDisplay: "line", success: true, rowCount: 4 },
            ],
            metadata: {
              preferredDisplay: "table",
              bulkResultsData: {
                total: 2,
                queryGroup: "dashboard",
                results: [
                  { queryName: "first_query", query_group: "dashboard", preferredDisplay: "table", data: [{ id: 1 }, { id: 2 }] },
                  { queryName: "second_query", query_group: "dashboard", preferredDisplay: "line", data: [{ id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] },
                ],
                errors: [],
              },
            },
            title: "All Named Query Results",
            bulkResultsData: {
              total: 2,
              queryGroup: "dashboard",
              results: [
                { queryName: "first_query", query_group: "dashboard", preferredDisplay: "table", data: [{ id: 1 }, { id: 2 }] },
                { queryName: "second_query", query_group: "dashboard", preferredDisplay: "line", data: [{ id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] },
              ],
              errors: [],
            },
          },
        })}
      />
    );

    expect(screen.getByText("Executed 2 named queries.")).toBeInTheDocument();
    expect(screen.getAllByTestId("result-visualization")).toHaveLength(2);
    expect(screen.getByText("first_query")).toBeInTheDocument();
    expect(screen.getByText("second_query")).toBeInTheDocument();
    expect(screen.getAllByTestId("result-visualization")[0]).toHaveAttribute("data-rows", "2");
    expect(screen.getAllByTestId("result-visualization")[1]).toHaveAttribute("data-rows", "4");
  });

});
