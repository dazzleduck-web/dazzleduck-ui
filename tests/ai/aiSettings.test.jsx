import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
    loadAiSettings, saveAiSettings, applySettingsChange, validateBaseUrl, settingsProblem,
    isInsecurePage, STORAGE_KEY, DEFAULT_SETTINGS,
} from "../../src/ai/aiSettings";
import { normalizeAiConfig } from "../../src/ai/config";
import { QueryDashboardProvider } from "../../src/context/QueryDashboardContext";
import AiProvider from "../../src/context/AiContext";
import { useAi } from "../../src/context/aiContextCore";
import AiSettingsSection from "../../src/components/ai/AiSettingsSection";
import QueryRow from "../../src/components/dashboardcomponents/QueryRow";

const KEY = "AIza-test-SECRET-key-123456";

beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
});

describe("aiSettings store", () => {
    it("defaults to Gemini + gemini-3.1-flash-lite with no key", () => {
        expect(loadAiSettings()).toEqual({ provider: "gemini", model: "gemini-3.1-flash-lite", baseUrl: "", apiKey: "" });
        expect(settingsProblem(DEFAULT_SETTINGS)).toBe("no_key");
    });

    it("keeps settings in sessionStorage only", () => {
        saveAiSettings({ ...DEFAULT_SETTINGS, apiKey: KEY });
        expect(sessionStorage.getItem(STORAGE_KEY)).toContain(KEY);
        expect(loadAiSettings().apiKey).toBe(KEY);
        expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
        expect(document.cookie).not.toContain(KEY);
    });

    it("survives broken or blocked storage", () => {
        sessionStorage.setItem(STORAGE_KEY, "{not json");
        expect(loadAiSettings()).toEqual({ ...DEFAULT_SETTINGS });
        const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
        expect(loadAiSettings(throwing)).toEqual({ ...DEFAULT_SETTINGS });
        expect(() => saveAiSettings(DEFAULT_SETTINGS, throwing)).not.toThrow();
    });

    it("switching provider swaps the default model and drops the base URL", () => {
        const compat = applySettingsChange(DEFAULT_SETTINGS, { provider: "openai-compatible" });
        expect(compat.model).toBe("");
        const withUrl = applySettingsChange(compat, { baseUrl: "https://api.groq.com/openai/v1", model: "llama" });
        const claude = applySettingsChange(withUrl, { provider: "claude" });
        expect(claude).toMatchObject({ provider: "claude", model: "claude-haiku-5-5", baseUrl: "" });
        expect(applySettingsChange(DEFAULT_SETTINGS, { provider: "nope" })).toEqual({ ...DEFAULT_SETTINGS });
    });

    it("requires https base URLs except for localhost", () => {
        expect(validateBaseUrl("https://openrouter.ai/api/v1")).toBeNull();
        expect(validateBaseUrl("http://localhost:11434/v1")).toBeNull();
        expect(validateBaseUrl("http://127.0.0.1:1234/v1")).toBeNull();
        expect(validateBaseUrl("http://example.com/v1")).toMatch(/https/);
        expect(validateBaseUrl("not a url")).toMatch(/full URL/);
        expect(settingsProblem({ provider: "openai", model: "", baseUrl: "", apiKey: "k" })).toMatch(/model/);
        expect(settingsProblem({ provider: "openai", model: "m", baseUrl: "", apiKey: "k" })).toBeNull();
    });

    it("flags http pages on non-local hosts", () => {
        expect(isInsecurePage({ protocol: "http:", hostname: "example.com" })).toBe(true);
        expect(isInsecurePage({ protocol: "http:", hostname: "localhost" })).toBe(false);
        expect(isInsecurePage({ protocol: "https:", hostname: "example.com" })).toBe(false);
    });

    it("AI is available unless explicitly disabled", () => {
        expect(normalizeAiConfig({}).available).toBe(true);
        expect(normalizeAiConfig({ enabled: "false" }).available).toBe(false);
        expect(normalizeAiConfig({ defaultLimit: "50" }).defaultLimit).toBe(50);
    });
});

// Shows what the rest of the app can see from the AI context.
const Probe = () => {
    const ai = useAi();
    return <pre data-testid="probe">{JSON.stringify({ enabled: ai.enabled, settings: ai.settings, model: ai.model })}</pre>;
};

const renderSection = ({ isConnected = false } = {}) => render(
    <QueryDashboardProvider>
        <AiProvider config={{}}>
            <AiSettingsSection isConnected={isConnected} />
            <Probe />
        </AiProvider>
    </QueryDashboardProvider>
);

const probe = () => JSON.parse(screen.getByTestId("probe").textContent);

describe("AI Assistant section in Connection Settings", () => {
    it("is off without a key, and on once a key is typed", async () => {
        renderSection();
        expect(screen.getByTestId("ai-status")).toHaveTextContent("AI off");
        fireEvent.click(screen.getByRole("button", { name: /AI Assistant \(optional\)/ }));

        expect(screen.getByLabelText("Provider")).toHaveValue("gemini");
        expect(screen.getByLabelText("Model")).toHaveValue("gemini-3.1-flash-lite");
        const keyInput = screen.getByLabelText("API key");
        expect(keyInput).toHaveAttribute("type", "password");
        expect(keyInput).toHaveAttribute("autocomplete", "off");
        expect(keyInput.closest("form")).toBeNull();

        await act(async () => { fireEvent.change(keyInput, { target: { value: KEY } }); });
        expect(screen.getByTestId("ai-status")).toHaveTextContent("AI on");
        expect(screen.getByTestId("ai-status")).toHaveAttribute("title", "Google Gemini · gemini-3.1-flash-lite");
        expect(keyInput).toHaveAttribute("title", expect.stringContaining("sent to Google Gemini, never query results"));

        // The rest of the app sees hasKey, never the key itself
        expect(probe()).toMatchObject({ enabled: true, settings: { hasKey: true } });
        expect(screen.getByTestId("probe").textContent).not.toContain(KEY);
        expect(sessionStorage.getItem(STORAGE_KEY)).toContain(KEY);
    });

    it("switching to Claude loads its default model; compatible needs a valid base URL", async () => {
        renderSection();
        fireEvent.click(screen.getByRole("button", { name: /AI Assistant/ }));
        await act(async () => { fireEvent.change(screen.getByLabelText("API key"), { target: { value: KEY } }); });

        await act(async () => { fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "claude" } }); });
        expect(screen.getByLabelText("Model")).toHaveValue("claude-haiku-5-5");
        expect(probe()).toMatchObject({ enabled: true, model: "claude-haiku-5-5" });

        await act(async () => { fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai-compatible" } }); });
        expect(probe().enabled).toBe(false); // no model or base URL yet
        await act(async () => {
            fireEvent.change(screen.getByLabelText("Model"), { target: { value: "llama-3" } });
            fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "http://example.com/v1" } });
        });
        expect(screen.getByText(/Use an https:\/\/ address/)).toBeInTheDocument();
        expect(probe().enabled).toBe(false);
        await act(async () => { fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "http://localhost:11434/v1" } }); });
        expect(probe().enabled).toBe(true);
    });

    it("is locked while connected (log out to change it)", () => {
        saveAiSettings({ ...DEFAULT_SETTINGS, apiKey: KEY });
        renderSection({ isConnected: true });
        fireEvent.click(screen.getByRole("button", { name: /AI Assistant/ }));
        expect(screen.getByLabelText("API key")).toBeDisabled();
        expect(screen.getByLabelText("Provider")).toBeDisabled();
        expect(screen.getByLabelText("Model")).toBeDisabled();
        expect(screen.getByTestId("ai-locked")).toHaveTextContent("Log out to change AI settings.");
        expect(screen.getByTestId("ai-status")).toHaveTextContent("AI on");
        expect(screen.queryByRole("button", { name: "Clear key" })).toBeNull();
    });

    it("picks the model from a dropdown, with Other… for any model ID", async () => {
        renderSection();
        fireEvent.click(screen.getByRole("button", { name: /AI Assistant/ }));
        await act(async () => { fireEvent.change(screen.getByLabelText("API key"), { target: { value: KEY } }); });

        const select = screen.getByLabelText("Model");
        expect(select.tagName).toBe("SELECT");
        expect([...select.options].map((o) => o.value)).toEqual(
            ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "__other__"]);

        await act(async () => { fireEvent.change(select, { target: { value: "gemini-3.5-flash-lite" } }); });
        expect(probe().model).toBe("gemini-3.5-flash-lite");
        expect(screen.queryByLabelText("Model ID")).toBeNull();

        await act(async () => { fireEvent.change(select, { target: { value: "__other__" } }); });
        expect(probe().enabled).toBe(false); // no model yet
        await act(async () => { fireEvent.change(screen.getByLabelText("Model ID"), { target: { value: "gemini-4-neon" } }); });
        expect(probe()).toMatchObject({ enabled: true, model: "gemini-4-neon" });
        expect(screen.getByLabelText("Model")).toHaveValue("__other__");

        // a new provider starts from its own list again
        await act(async () => { fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai" } }); });
        expect(screen.getByLabelText("Model")).toHaveValue("gpt-6-luna");
        expect(screen.queryByLabelText("Model ID")).toBeNull();
    });

    it("shows a saved model that isn't in the list under Other…", () => {
        saveAiSettings({ ...DEFAULT_SETTINGS, model: "gemini-4-neon", apiKey: KEY });
        renderSection();
        fireEvent.click(screen.getByRole("button", { name: /AI Assistant/ }));
        expect(screen.getByLabelText("Model")).toHaveValue("__other__");
        expect(screen.getByLabelText("Model ID")).toHaveValue("gemini-4-neon");
    });

    it("is editable before connecting", () => {
        renderSection({ isConnected: false });
        fireEvent.click(screen.getByRole("button", { name: /AI Assistant/ }));
        expect(screen.getByLabelText("API key")).not.toBeDisabled();
        expect(screen.queryByTestId("ai-locked")).toBeNull();
    });

    it("a reloaded tab keeps the key; the field shows that without revealing it", () => {
        saveAiSettings({ ...DEFAULT_SETTINGS, apiKey: KEY });
        renderSection();
        expect(screen.getByTestId("ai-status")).toHaveTextContent("AI on");
        fireEvent.click(screen.getByRole("button", { name: /AI Assistant/ }));
        expect(screen.getByLabelText("API key")).toHaveValue("");
        expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "Key set for this tab");
    });

    it("is hidden when AI is switched off at build time", () => {
        render(
            <QueryDashboardProvider>
                <AiProvider config={{ enabled: "false" }}><AiSettingsSection /></AiProvider>
            </QueryDashboardProvider>
        );
        expect(screen.queryByText(/AI Assistant/)).toBeNull();
    });
});

describe("no-key hint in query rows", () => {
    const row = { id: "1-x", showPanel: true, query: "", view: "table", variables: {}, resultTitle: "" };
    const props = { row, result: null, isConnected: true, totalRows: 1, updateRow: () => {}, removeRow: () => {}, handleRunQuery: () => {}, handleCancelQuery: () => {}, clearRowResults: () => {} };

    it("shows the hint only when AI is available but has no key", () => {
        const { rerender } = render(<QueryRow {...props} aiHint />);
        expect(screen.getByTestId("ai-hint")).toHaveTextContent("Add an AI key in Connection Settings");
        rerender(<QueryRow {...props} aiEnabled />);
        expect(screen.queryByTestId("ai-hint")).toBeNull();
    });
});
