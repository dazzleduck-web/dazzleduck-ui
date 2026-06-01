const HTTP_503_PATTERNS = [
  "503",
  "service unavailable",
  "unavailable",
  "overloaded",
  "overload",
];

const RATE_LIMIT_PATTERNS = [
  "quota_exceeded",
  "resource_exhausted",
  "too_many_requests",
  "429",
];

const INVALID_KEY_PATTERNS = [
  "api_key_invalid",
  "permission denied",
  "permission_denied",
  "unauthenticated",
  "401",
  "403",
];

const MALFORMED_RESPONSE_PATTERNS = [
  "invalid response",
  "malformed response",
  "unexpected response",
  "response.text is not a function",
  "cannot read properties",
];

const normalizeErrorText = (error) => {
  const parts = [
    error?.message,
    error?.status,
    error?.statusText,
    error?.code,
    error?.name,
    error?.response?.status,
    error?.response?.statusText,
    typeof error?.response?.data === "string" ? error.response.data : null,
    typeof error?.response?.data?.message === "string" ? error.response.data.message : null,
    typeof error?.response?.data?.error === "string" ? error.response.data.error : null,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return parts.join(" ");
};

const matchesAnyPattern = (text, patterns) => patterns.some((pattern) => text.includes(pattern));

export const getGeminiErrorMessage = (error, fallbackMessage = "Failed to process request") => {
  const normalized = normalizeErrorText(error);

  if (!normalized) {
    return fallbackMessage;
  }

  if (matchesAnyPattern(normalized, INVALID_KEY_PATTERNS)) {
    return "Invalid API key. Please check your Gemini API key.";
  }

  if (matchesAnyPattern(normalized, HTTP_503_PATTERNS)) {
    return "Gemini is temporarily overloaded. Please try again in a moment.";
  }

  if (matchesAnyPattern(normalized, RATE_LIMIT_PATTERNS)) {
    return "Gemini is temporarily rate-limited. Please try again later.";
  }

  if (matchesAnyPattern(normalized, MALFORMED_RESPONSE_PATTERNS)) {
    return "Gemini returned an invalid response. Please try again.";
  }

  if (normalized.includes("cors")) {
    return "Network error: CORS issue. Please try again.";
  }

  if (normalized.includes("timeout")) {
    return "Request timed out. Please try again.";
  }

  return error?.message || fallbackMessage;
};

export const isRetryableGeminiError = (error) => {
  const normalized = normalizeErrorText(error);
  return matchesAnyPattern(normalized, HTTP_503_PATTERNS) || matchesAnyPattern(normalized, RATE_LIMIT_PATTERNS);
};

export const isMalformedGeminiResponseError = (error) => {
  const normalized = normalizeErrorText(error);
  return matchesAnyPattern(normalized, MALFORMED_RESPONSE_PATTERNS);
};
