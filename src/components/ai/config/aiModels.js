export const AVAILABLE_MODELS = [
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", tier: "free", default: true },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", tier: "paid", default: false },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "paid", default: false },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "free", default: false },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", tier: "free", default: false },
];

export const DEFAULT_MODEL_ID = AVAILABLE_MODELS.find((model) => model.default)?.id || "gemini-2.5-flash";
