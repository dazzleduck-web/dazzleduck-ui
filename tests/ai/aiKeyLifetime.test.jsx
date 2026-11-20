import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";

// A controllable stand-in for the DazzleDuck connection
let connectionInfo = null;
vi.mock("../../src/context/QueryDashboardContext", () => ({
    useQueryDashboard: () => ({ executeMetaQuery: vi.fn(), connectionInfo }),
}));

const { default: AiProvider } = await import("../../src/context/AiContext");
const { useAi } = await import("../../src/context/aiContextCore");

const KEY = "AIza-test-SECRET-key-123456";
let ai;
const Probe = () => { ai = useAi(); return null; };
const renderAi = () => render(<AiProvider config={{}}><Probe /></AiProvider>);

beforeEach(() => {
    sessionStorage.clear();
    connectionInfo = null;
});

describe("AI key lifetime", () => {
    it("is cleared when the connection ends for any reason (e.g. an expired token)", () => {
        connectionInfo = { serverUrl: "http://localhost:8081", username: "admin", loginTime: 1 };
        const view = renderAi();
        act(() => ai.setApiKey(KEY));
        expect(ai.settings.hasKey).toBe(true);

        // automatic logout: the context drops connectionInfo without the Logout button
        connectionInfo = null;
        act(() => view.rerender(<AiProvider config={{}}><Probe /></AiProvider>));
        expect(ai.settings.hasKey).toBe(false);
    });

    it("is kept while not yet connected (entered before Connect)", () => {
        const view = renderAi();
        act(() => ai.setApiKey(KEY));
        act(() => view.rerender(<AiProvider config={{}}><Probe /></AiProvider>));
        expect(ai.settings.hasKey).toBe(true);
    });
});
