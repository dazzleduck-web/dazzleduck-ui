# Spec: AI Query Assistant (Natural Language → SQL, UI-only)

| | |
|---|---|
| **Status** | Draft v3: bring-your-own-key — for review |
| **Branch** | `feat/llm-integration` |
| **Scope (v1)** | Analytics tab query rows |
| **LLM** | Any supported provider, using the **user's own API key** entered in Connection Settings (Gemini, Claude, OpenAI, OpenAI-compatible) |
| **Constraint** | Everything runs in the UI/browser. No backend, no proxy, no extra server. The project ships **no** API key. |

### What changed in v3
dazzleduck-ui is open source, so the project should not ship a shared key. Instead:
1. **Connection Settings get an optional "AI Assistant" section.** The user picks a **provider** and
   enters **their own API key** (and optionally a model).
2. **No key = exactly today's app.** SQL runs as before and no AI code runs at all.
3. **With a key**, the SQL box accepts SQL **and** plain-English questions.
4. The key built into the app via `.env.local` (v2) is replaced by the user-entered key (§6.6, Q8).
5. Key storage and authentication details are **open**, to be decided in the next discussion (§6.3, §18).

---

## 1. Summary

With an AI key configured, a user types **either SQL or a plain-English question** into the existing
SQL box of an Analytics query row and presses **Run**:

- **SQL** → runs exactly as typed (today's behaviour).
- **Question** → the browser calls the selected AI provider directly with the user's key, gets SQL
  back, validates it against the DazzleDuck server's own SQL parser, and runs it. The SQL box is
  **not** changed; the generated SQL is shown on demand via a **"View generated SQL"** button.

Without a key, nothing changes from today.

---

## 2. Goals and non-goals

### Goals
1. Optional, user-supplied API key with a provider choice, in Connection Settings.
2. One input (the existing SQL textarea) accepts SQL **or** natural language when a key is set.
3. SQL is detected exactly (DuckDB's own parser via the connected server) and passed through unchanged.
4. Natural language is turned into a single read-only DuckDB `SELECT`, validated and executed.
5. Generated SQL is always inspectable ("View generated SQL").
6. Lightweight: no model download; provider code loaded only when first needed.
7. Provider-agnostic: adding a provider is one adapter file; the UI and pipeline don't change.

### Non-goals (v1)
- Named Queries tab integration. (The Search tab got AI in Phase 5.)
- Result summaries / "explain this query".
- Any server, proxy, or shared project key.
- Sending query **results** to the LLM. Results never leave the app.

---

## 3. Architecture overview

```
┌──────────────────────────── Browser (dazzleduck-ui) ───────────────────────────────┐
│                                                                                     │
│  Connection Settings ──► AI settings { provider, apiKey, model, baseUrl }           │
│                                │                                                    │
│  QueryRow [Run] ──► aiQueryPipeline  (only when an AI key is set)                    │
│                       ├─ inputDetector ──────────┐                                  │
│                       ├─ schemaContext (cached)  │ executeMetaQuery / executeQuery  │
│                       ├─ sqlGate (AST checks) ───┼──────────────────────────────────┼──► DazzleDuck server
│                       ├─ executeQuery (run) ─────┘ (user's JWT)                     │     /v1/query
│                       │                                                             │
│                       └─ provider registry ── selected adapter ── user's key ───────┼──► Gemini | Claude |
│                            gemini | claude | openai | openai-compatible             │     OpenAI | compatible
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- The **DazzleDuck server** does what it already does: parsing (`json_serialize_sql`), dry runs
  (`EXPLAIN`), schema reads and execution, always with the user's own JWT.
- The **AI provider** only ever receives the question, the schema (table/column names and types),
  and previous question/SQL turns, sent with **the user's own key**. Never query results.
- The **AI key never goes to the DazzleDuck server** and is never put in cookies or session files.

---

## 4. User flow — pressing Run on a row

```
Run
 │
 ├─ AI key set? ── no ─────────────────────────────────────► executeQuery(text) — today's behaviour
 │      yes
 ├─ 1. Substitute {variables} (existing substituteVariables)
 ├─ 2. Detect (§5)  ── SQL ───────────────────────────────► 6. executeQuery(text as typed)
 │        │ question / unclear
 ├─ 3. Same question as this row's last run? ── yes ──────► 6. run (reuse, §11)
 │        │ no
 ├─ 4. Generate (§7) with the selected provider → { kind, sql, display, explanation }
 │        │   kind = "sql"     → run the user's ORIGINAL text (pass-through)
 │        │   kind = "message" → show the model's message, run nothing
 ├─ 5. Gate (§9): json_serialize_sql AST checks → EXPLAIN → add LIMIT
 │        │   fail → feed SQL + error back, retry (max 3 AI calls, §10)
 └─ 6. executeQuery(generated SQL) → results + AI badge + [View generated SQL]
```

---

## 5. SQL vs natural-language detection

Detection uses **DuckDB's own parser on the connected server**. One cheap round trip, nothing executes:

```sql
SELECT json_serialize_sql('<user text, single quotes doubled>') AS ast
```

| Parser result | Meaning | Action |
|---|---|---|
| Parses, and `EXPLAIN` binds | **SQL** | Run as typed. No AI call. |
| `error_type: "not implemented"`, "Only SELECT statements can be serialized to json!" *(verified)* | **SQL, not a SELECT** (`DESCRIBE`, `SHOW`, `CREATE`…) | Run as typed; the server governs it as today. |
| `error_type: "parser"` (syntax error) *(verified)* | **Natural language** | Generate SQL (§7). |
| Parses, doesn't bind, SQL-shaped (`*`, `,`, `(`, `=`, quotes, `;`, line breaks) | **SQL** (user's own mistake) | Run as typed so the real error shows. No AI call. |
| Parses, doesn't bind, prose-like (`select all failed payments`) | **Unclear** | The AI decides: `kind: "sql"` (run as typed; on failure offer **"Treat as a question instead"**) or `kind: "nl"` (generate). |
| The parse call itself is refused | Heuristic | SQL-shaped → SQL, otherwise a question. |

Detection only runs when an AI key is set, so users without a key pay no extra round trips.

---

## 6. AI providers and the user's key

### 6.1 Supported providers

| Provider | Default model | Key from | Call from browser | Structured (JSON) answer | Notes |
|---|---|---|---|---|---|
| **Google Gemini** | `gemini-3.1-flash-lite` *(verified)* | Google AI Studio | ✅ verified (CORS allows `x-goog-api-key`) | `responseMimeType` + `responseSchema` ✅ verified | Free tier available. `thinkingLevel: "minimal"` → ~1.5 s per answer. **Built (v2).** |
| **Anthropic Claude** | `claude-haiku-5-5` (fastest, cheapest Claude: $0.10 in / $0.50 out per 1M tokens) | Claude Console | ✅ documented, needs an explicit browser opt-in (to verify in Phase 0b) | Structured outputs (`output_config.format` with a JSON schema) (to verify for Haiku 5.5) | No free tier; about $0.0003 per question. Use the official `@anthropic-ai/sdk`, loaded on demand, with browser access enabled. Low `effort` for speed. Check `stop_reason` (handle `refusal`). |
| **OpenAI** | small/fast model (exact default confirmed in Phase 0b) | OpenAI Platform | to verify (CORS) | JSON-schema response format (to verify) | No free tier. |
| **OpenAI-compatible** | user enters model | the service | depends on the service | JSON mode where supported, else prompt-only JSON | One adapter for any service with an OpenAI-style `/chat/completions` endpoint (e.g. Groq, OpenRouter, a local Ollama at `http://localhost:11434/v1`). User enters **Base URL** + model. |

- **The model field is editable for every provider.** The default is pre-filled, and the user may
  type any model ID their key can use.
- **Every adapter implements the same interface:**
  `generate({ system, user, responseSchema, signal }) → { json, usage, ms }`.
  Retries on 429/5xx/network with backoff, a 15 s per-attempt timeout, and abort on Cancel, exactly
  like the Gemini adapter.
- **Errors are mapped to the same codes** (`config`, `quota`, `unavailable`, `aborted`,
  `bad_response`), so the UI shows the same messages whatever the provider.
- **Lazy loading:** an adapter (and any SDK it needs) is loaded with dynamic `import()` only when the
  first question is run with that provider.

### 6.2 Configuration fields (Connection Settings → "AI Assistant (optional)")

| Field | Type | Shown when | Default |
|---|---|---|---|
| Provider | select: Gemini / Claude / OpenAI / OpenAI-compatible (same row as Model) | always | **Gemini** |
| Model | **dropdown** of known models per provider, plus **Other…** (shows a text box for any model ID); OpenAI-compatible: text box only. Switching provider swaps in that provider's default. Lists (2026-11-20): Gemini `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` (checked live: only Flash-Lite models answered reliably on a free key; 2.5 models are closed to new keys, Pro isn't in the free tier, full Flash models timed out); Claude `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`; OpenAI `gpt-6-luna` (default), `gpt-6.1-terra`, `gpt-6.2-sol` (from OpenAI's docs, not yet checked live). Gemini models without a "minimal" thinking level are retried once with "low". | always | **`gemini-3.1-flash-lite`** (Gemini), `claude-haiku-5-5`, `gpt-6-luna` |
| API key | password input with show/hide; **optional**; not autofilled or saved by the browser (§6.5). Its hover text: "Kept only in this tab, cleared on logout. Only questions and table/column names are sent to *<provider>*, never query results." | always | empty |
| Base URL | text input | OpenAI-compatible only | empty |

The section header shows a short status: **AI on** (hover: provider · model), **Incomplete**, or
**AI off**. No intro text, notice box or Clear key button (removed 2026-11-20 to save space).

Behaviour:
- **Empty key → AI off.** No detection, no AI code loaded; SQL runs exactly as today.
- **The AI settings are part of the connection (decided 2026-11-20):** they sit above the
  Connect button and are filled in before connecting. **While connected they are locked**
  ("Log out to change AI settings."). To add or change a key, log out (which clears the key),
  enter it, and connect again. No extra "verify" request is made (Q12).
- The section stays outside the connection `<form>` (the Connect button joins the form with the
  `form=` attribute), so password managers don't capture the key with the DazzleDuck login.

### 6.3 Key storage — session-based, one key per browser (decided 2026-11-19)

- **Storage:** `sessionStorage`. The key survives a page reload and is gone when the tab or browser
  closes. Nothing is written to disk-persistent storage.
- **Scope:** one key per browser, the same for every DazzleDuck connection and server (not tied to
  the connection).
- **Per tab (decided, Q15):** `sessionStorage` is per tab. A new tab starts without the key and the
  user enters it again in Connection Settings. No sharing between tabs, nothing in `localStorage`.
- **No "Test key" request.** No tokens are spent on validation. A bad key surfaces on the first
  question as an "AI configuration error". Key verification will follow a separate plan (§6.4).
- **Clearing:** logout removes it from memory and `sessionStorage`; closing the tab drops it.

Firm rules:
- the key is **never** put in cookies (cookies are sent to servers);
- **never** sent to the DazzleDuck server;
- **never** written to Save Session files or shareable session URLs (provider and model may be saved);
- **never** logged or shown in error messages.

### 6.4 Verifying the key with the user's provider account — LATER

Idea: instead of pasting a key, the user signs in with their provider account and the app gets a
key or token for them. Feasibility differs by provider and is unverified:
- some services offer a "connect your account" flow for apps (e.g. OpenRouter's OAuth PKCE flow
  returns a user key);
- Google offers OAuth sign-in that can authorise Gemini API calls;
- others may only support pasted keys.

To be discussed separately. The provider interface does not need to change, since it only needs
"a credential to send".

### 6.5 Protecting the key (Q14 — proposal for review)

**Honest baseline:** with no backend, the key has to exist in the browser to be sent to the
provider. Nothing in the page can make it truly secret from code running in that same page. The
best design therefore **shrinks the ways it can leak** and **limits the damage if it does**.

#### Who could get the key (threat model)

| # | Threat | Example | Can we stop it? |
|---|---|---|---|
| T1 | Injected script (XSS) | Malicious HTML in data, a compromised dependency | Mostly: CSP, safe rendering, few dependencies |
| T2 | Accidental leaks | Key in a URL, log, error message, session file, cookie, referrer | Yes: code rules + tests |
| T3 | Network snooping | Page or provider call over plain HTTP | Yes: HTTPS only (warn otherwise) |
| T4 | Shared or unattended computer | Someone uses the open tab or DevTools | Partly: session-only storage, clear on logout |
| T5 | Malicious browser extension | Extension reads page storage | No: out of our control; say so in the notice |
| T6 | Key abused after leaking | Someone else spends the user's quota | Limit damage: provider-side restrictions and spend caps |

#### Layer 1: Keep it out of places it shouldn't be (T2), must-have
- Stored only in `sessionStorage`. Never in cookies, `localStorage`, URLs, Save Session files or the
  DazzleDuck server request (§6.3).
- Sent only in the provider's auth header (`x-goog-api-key`, `x-api-key`, `Authorization: Bearer`).
  Never as a URL query parameter.
- **Only the provider adapter reads the key.** The pipeline, rows and results never receive it.
  The AI context exposes "AI on / provider / model", not the key.
- **Redaction:** every AI error message passes through a helper that replaces the key (if it ever
  appears) with `••••`. No `console.log` of settings.
- The key input:
  - `type="password"`, `autocomplete="off"`, `spellcheck={false}`, so the browser doesn't save or
    suggest it;
  - not inside the connection `<form>`, so password managers don't capture it with the DazzleDuck
    login;
  - the show/hide toggle shows it only on request.
- Tests assert the key never appears in session save output, cookies, request URLs or error text.

#### Layer 2: Make injected scripts hard and harmless (T1), must-have
- **Content Security Policy for the production build.** Sent as a response header via `serve`'s
  `serve.json`, so it also covers what `<meta>` can't (e.g. `frame-ancestors`):
  ```
  default-src 'self';
  script-src 'self';                      # no inline or remote scripts: blocks classic XSS payloads
  style-src 'self' 'unsafe-inline';       # React inline styles
  img-src 'self' data:;
  connect-src 'self' https://generativelanguage.googleapis.com https://api.anthropic.com
              https://api.openai.com <DazzleDuck server origins> <OpenAI-compatible base URLs>;
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
  ```
  - **Trade-off:** the DazzleDuck server URL and the OpenAI-compatible base URL are typed by the
    user, so `connect-src` can't know them at build time.
    - Decided (Q19): the shipped default is `'self' http: https:`. (The first default allowed `http://` only
      to localhost, which blocked DazzleDuck servers on a LAN or intranet over plain http; widened 2026-11-20.)
    - A deployer narrows it in `serve.json` to their own server(s) and providers.
  - Even with a wide `connect-src`, `script-src 'self'` still blocks injected scripts, which is the
    main protection.
  - Dev mode (`npm run dev`) keeps no CSP so Vite's hot reload works.
- **Safe rendering:**
  - React escapes text by default;
  - the single `dangerouslySetInnerHTML` (row JSON viewer) already escapes `&`, `<`, `>`; it stays
    that way, and a test covers it;
  - no other raw-HTML rendering is allowed.
- **No third-party scripts** (analytics, CDN scripts, chat widgets). Everything is bundled.
- **Small dependency surface:**
  - Gemini and OpenAI/compatible use plain `fetch`;
  - only the Claude adapter adds an SDK (`@anthropic-ai/sdk`), and it's loaded on demand;
  - keep `package-lock.json`, build with `npm ci`, and run `npm audit` in CI.

#### Layer 3: Transport and session hygiene (T3, T4), must-have
- **HTTPS:**
  - if the app is served over plain `http://` from a host other than localhost, the AI section
    shows a warning and the key field stays disabled until the user confirms;
  - an OpenAI-compatible base URL must be `https://`, except `localhost`;
  - `Referrer-Policy: no-referrer` header.
- **The key is cleared** on DazzleDuck logout or when the tab closes (`sessionStorage`) (Q17).
  No idle timer (Q18).

#### Layer 4: Limit damage if it leaks (T6), guidance shown to the user
Not shown in the UI (removed to save space); kept here for the README / docs:
- **Gemini:** in Google Cloud, restrict the key to the "Generative Language API" and to **HTTP
  referrers** = the app's domain(s). Prefer a dedicated project for this key.
- **Claude:** use a dedicated workspace with a **monthly spend limit**; create a key just for this
  app.
- **OpenAI:** use a **project key** with a budget limit and only model-call permissions.
- **All:** use a separate key for this app, never your main one. Rotate it if it may have leaked.

#### Not recommended
- **Encrypting the key in `sessionStorage`.** The decryption key would also have to be in the page,
  so injected code could decrypt it too. It adds complexity without real protection.
- **Hiding the key with obfuscation.** Same reason.

#### The only stronger option (out of scope)
A tiny proxy that holds keys server-side. Excluded by the UI-only constraint, but it remains the
upgrade path if a deployment ever needs real secrecy.

### 6.6 Build-time key (v2) → removed

v2 read `VITE_GEMINI_API_KEY` from `.env.local` and inlined it into the bundle. For an open-source
app that ships to anyone, this is replaced by the user-entered key:
- `VITE_GEMINI_API_KEY` / `VITE_GEMINI_MODEL` are removed from the code and `.env.example`;
- `VITE_AI_ENABLED` stays as a feature flag, so the whole AI section can be hidden;
- the `.gitignore` / `.dockerignore` rules from v2 stay, since they are good hygiene anyway;
- **Defaults (decided, Q8):** provider **Gemini**, model **`gemini-3.1-flash-lite`**, both
  changeable by the user in Connection Settings. No build-time pre-selection setting for now.

### 6.7 Provider facts users should know
- **Gemini free tier:**
  - rate limits are per Google Cloud project; temporary `503 "high demand"` errors are common
    (our retries cover them);
  - Google **may use free-tier prompts to improve its products** and reviewers may read them;
  - unpaid use is not allowed for users in the EEA, Switzerland or UK.
- **Claude and OpenAI:** pay per token from the user's own account. The user should set a spending
  limit in that provider's console.
- With bring-your-own-key, **each user uses their own quota and their own terms**. There is no
  shared project quota.

---

## 7. Prompt and context

### 7.1 What the model receives

| Part | Source | Notes |
|---|---|---|
| **Rules** (system) | `src/ai/prompts.js` (static) | DuckDB dialect, one read-only SELECT, only listed tables/file sources, data-free requests allowed, display choice and column order, user-requested display wins, off-topic → message |
| **Current time + timezone** | Browser | For "last hour", "yesterday" |
| **Schema** | Schema cache (§7.2) | Table/file-source names + column names + types only |
| **History** | This row's previous turns (in memory) | Last 3 `{question, sql}` so follow-ups work |
| **Retry feedback** | Previous attempt | Failed SQL + exact error (§10) |
| **The question** | SQL box | After `{variable}` substitution |

**Never sent:** query results, row data, column values, the JWT, passwords, the server URL.

Later, only if accuracy needs it: a per-connection "AI context" hints box, named-query examples,
sample column values.

### 7.2 Schema cache
- **Two kinds of sources.** A DazzleDuck server often has **no catalog tables**; data is read from
  files.
  - **Catalog tables/views:** `duckdb_columns()`, then `information_schema.columns` as a fallback,
    then `SELECT * FROM <claim table> LIMIT 0` for restricted users.
  - **File sources** (`read_parquet('…')`, `read_arrow('…')`, …) found in the text of the row being
    run and every other row. Each is described with `DESCRIBE SELECT * FROM <call>` and listed so
    the AI copies the call into `FROM`.
- **Empty schema is fine.** Data-free questions still work. Verified live: "show me 2 * 2 as table"
  → `SELECT 2 * 2`, and "4 random fake emails" → `… FROM range(4)`. Questions needing unknown data
  get a message saying what to load first.
- **Reads** go through `executeMetaQuery`: direct `/v1/query`, returns rows plus Arrow column info,
  never touches the saved split size.
- **Cached** in memory for the current connection. Cleared on logout, reconnect or reload.

### 7.3 Prompt layout
```
SYSTEM:  <rules> · Current time · # Schema <tables and file sources with columns>
USER:    Earlier turns (Q/SQL) · Input: <text> · [detector note] · [retry feedback]
```

---

## 8. Output schema

```json
{
  "kind":        "nl | sql | message",
  "sql":         "one DuckDB SELECT (empty when kind = sql or message)",
  "display":     "table | line | bar | pie",
  "explanation": "one sentence; for kind=message, the text shown to the user"
}
```

- `kind = "sql"` → run the **user's original text**, never the model's copy.
- `kind = "message"` → off-topic or unanswerable input. The text is shown; nothing runs.
- `display` → the AI picks the view; the row's view switches to it and the user can still change it.
  Column order matches our charts (line/bar: x, measure, optional series; pie: label, value).

Each adapter enforces this schema with its provider's structured-output feature where available.
Every answer is also validated and normalised in `normalizeAnswer()`, so a provider without strict
JSON support still works.

---

## 9. Safety gate (generated SQL only)

The server's default `access_mode = COMPLETE` accepts **any** statement, and the user does not see
generated SQL before it runs. So generated SQL is checked in the UI with the server's own parser:

1. **AST check** (`json_serialize_sql`):
   - exactly one statement, and a SELECT (non-SELECTs fail serialization);
   - `TABLE_FUNCTION`s anywhere in the tree must be a **known file source** (same function and path
     as in the schema) or a generator (`range`, `generate_series`, `unnest`). With a list of files
     (`read_parquet(['a', 'b'])`), **every** path must be a known file, and a path that isn't a plain
     string literal is rejected;
   - generators with literal bounds may produce at most **1,000,000 rows**, alone or multiplied
     together (stops `range(1e12)` or a big cross join from loading the server). Bounds that aren't
     plain numbers (timestamps, `now()`) are not sized;
   - `BASE_TABLE`s must be schema tables (matched on schema and catalog too, when the query gives
     them) or unqualified CTE names.
2. **Dry run:** `EXPLAIN <sql>` must succeed.
3. **LIMIT:** appended when the top-level query has none (default 1000).

User-typed SQL is not gated (unchanged behaviour).

---

## 10. Self-healing
- **Gate failure:** the failed SQL and the exact error go back to the AI, up to **3 AI calls per Run**.
  After that, the error is shown with View generated SQL.
- **Execution-time error** on generated SQL: one repair attempt.
- **With bring-your-own-key the user pays for every AI call** (or spends their own free quota), so the
  caps stay.

---

## 11. Reuse (no persistence)
- Each row (and the Search box) keeps its last question and generated SQL **in memory**. Re-running
  an unchanged question reuses the SQL, with no AI call, as long as the schema is also unchanged.
- The schema is cached per connection, but a failed lookup is not cached, and a repair after an
  execution error reloads it (so tables or files created since the first question are seen).
- Reload, logout or reconnect clears it.

---

## 12. UI changes

| Where | Change |
|---|---|
| **Connection Settings** (`ConnectionPanel.jsx`) | New collapsible **"AI Assistant (optional)"** section with the fields in §6.2. Status chip: "AI off" / "AI on · Gemini · gemini-3.1-flash-lite" |
| `QueryRow.jsx` textarea | Placeholder depends on AI state. Key set: "SQL or a question…". No key: today's SQL placeholder |
| Run button | "Generating SQL…" then "Running…" |
| Results header | Badge **AI-generated from your question** + **[View generated SQL]** |
| `GeneratedSqlPanel.jsx` | SQL, explanation, provider + model + time, **Copy**, **Use as SQL** |
| Error state | Unclear input that fails as SQL gets **"Treat as a question instead"** |
| View radio buttons | Set from the AI's `display`; still user-switchable |
| No key | No AI UI in rows. A one-line hint near the Run buttons: "Add an AI key in Connection Settings to ask in plain English" (decided, Q10) |

---

## 13. Data and privacy

| Data | Sent to the AI provider? |
|---|---|
| The question | ✅ |
| Table/file-source names, column names, column types | ✅ |
| Previous question/SQL turns of that row | ✅ |
| Column values / sample data | ❌ |
| Query results / rows | ❌ never |
| JWT, password, DazzleDuck server URL | ❌ never |
| The AI key | Only to the selected provider, in its auth header |

The key field's hover text names the selected provider. Each provider's own data-use terms apply
to the user's key.

---

## 14. Code layout

```
src/ai/
  config.js                 AI settings shape, defaults per provider, normalisation
  providers/
    registry.js             provider id → { label, defaultModel, needsBaseUrl, load: () => import(adapter) }
    geminiProvider.js       fetch-based (built)
    claudeProvider.js       @anthropic-ai/sdk, loaded on demand (new)
    openaiProvider.js       fetch to /chat/completions; also used for OpenAI-compatible with a base URL (new)
    stubProvider.js         tests
    serializeProvider.js    one AI call at a time (Run All)
  inputDetector.js · sqlParse.js · sqlText.js · sqlGate.js · schemaContext.js
  prompts.js · aiQueryPipeline.js · errors.js                      (built, unchanged)
src/components/ai/
  GeneratedSqlPanel.jsx     (built)
  AiSettingsSection.jsx     provider / key / model / base URL / clear (new)
src/context/
  AiContext.jsx             holds AI settings state + schema cache; builds the selected provider (changed)
  aiContextCore.js          useAi() with a disabled default (built)
```

Changes to existing code:
- **`ConnectionPanel.jsx`:** render `AiSettingsSection`.
- **`AiContext.jsx`:**
  - settings come from user input, not `main.jsx` env values;
  - exposes `settings`, `setSettings`, `clearKey()`;
  - keeps the key in `sessionStorage` (per tab) and hands it only to the provider adapter;
  - "enabled" means a key is set.
- **`main.jsx`:** passes only the `VITE_AI_ENABLED` feature flag.
- **`useSessionManagement` / `saveSession`:** may save provider + model, **never the key**.
- **`.env.example`:** drop the key and model lines.

---

## 15. Error handling

| Situation | Behaviour |
|---|---|
| No key | AI off; SQL runs as today |
| Key rejected / unknown model (400/401/403/404) | "AI configuration error (<provider>): <message>". Shown on the first question; the key is never shown |
| Quota or rate limit (429) | "AI quota or rate limit reached for your <provider> key. Try again later, or enter SQL." |
| Provider 5xx / network / timeout | 2 transport retries, then "<provider> is unavailable" |
| Claude `stop_reason: "refusal"` | Shown as a message; nothing runs |
| `kind = message` | Show the model's message |
| Gate fails after all retries | "Couldn't generate a valid read-only query" + View generated SQL |
| Execution error on generated SQL | 1 repair attempt, then the server error + View generated SQL |
| Cancel during generation | Request aborted; nothing executes |
| Browser call blocked (CORS) for the chosen provider or base URL | "This provider can't be called from the browser" + the provider name |

---

## 16. Testing
- **Unit (vitest):**
  - detector, gate, schema, prompts, pipeline, hook (built: 49 tests);
  - new: each adapter with a mocked fetch/SDK (request shape, key header, JSON extraction, error
    mapping), the registry, the settings section (no key → AI off, provider switch updates the
    default model, base URL only for compatible), key kept in `sessionStorage` only, locked while
    connected, never in session save output or cookies.
- **Live (opt-in):** `tests/ai/live.e2e.test.js` (built for Gemini, 6/6 passing), extended with one
  case per provider when a key for it is available.
- **Manual evaluation set:** 30–50 questions with known answers, for prompt tuning per provider.

---

## 17. Delivery plan

### Implementation status (2026-11-19)
Built and tested with the v2 design (Gemini key from `.env.local`):
- detection, safety gate, schema context with file sources, prompts and the pipeline with repair;
- the Gemini adapter;
- row UI (badge, View generated SQL, Generating…, Cancel, AI-picked view, messages);
- 49 unit tests, plus the live test passing 6 of 6.

v3 changes the **configuration and provider** layers only; the pipeline stays.

**Phase 4 implemented (2026-11-19):**
- `src/ai/aiSettings.js`: settings in `sessionStorage` per tab, provider switching, base-URL and
  HTTPS checks.
- `src/ai/providers/registry.js`: four providers, adapters loaded on demand.
- Adapters:
  - `http.js`: shared retry and timeout, key redaction;
  - `geminiProvider.js`: converts the standard JSON schema to Gemini's dialect;
  - `claudeProvider.js`: `@anthropic-ai/sdk@1.5.0` pinned, structured output, `effort: "low"`,
    refusal handled;
  - `openaiProvider.js`: strict `json_schema` for OpenAI, `json_object` for compatible services.
- `AiContext.jsx` exposes `settings.hasKey`, never the key.
- `AiSettingsSection.jsx` sits in Connection Settings, outside the login form.
- The no-key hint is shown in query rows.
- The key is cleared on logout.
- `public/serve.json` sends the CSP, `Referrer-Policy` and `nosniff` headers (verified with `serve`).
- The build-time key was removed from `main.jsx` and `.env.example`.
- Tests: 73 AI unit/component tests pass.
- Verification:
  - Gemini: verified live through the registry;
  - Claude and OpenAI adapters: tested with mocks only; a live browser check is pending
    (Phase 0b, needs keys).
- Bundle: the Claude SDK chunk (82 KB gzip) is downloaded only when Claude is selected; Gemini and
  OpenAI add ~1–2 KB each.

### Phase 0 — ✅ done (Gemini, server parse/EXPLAIN, file sources)

### Phase 0b — Verify the other providers (½ day, needs test keys)
1. **Claude:** a browser call with the official SDK's browser access enabled, structured JSON output
   on `claude-haiku-5-5`, latency at low effort.
2. **OpenAI:** whether the browser may call the API (CORS), JSON-schema response format, and which
   small model to default to.
3. **OpenAI-compatible:** a CORS check on one or two common services and on local Ollama.

### Phase 4 — Bring-your-own-key
- `AiSettingsSection` in Connection Settings; key in `sessionStorage` (per tab);
- security layers 1–3 from §6.5 (redaction, input attributes, CSP + headers in `serve.json`,
  HTTPS checks) and the layer-4 guidance text;
- provider registry; Claude and OpenAI/compatible adapters;
- the no-key hint (Q10); CSP if Q14 is approved;
- AI context driven by user settings; `main.jsx` passes only the feature flag;
- remove the build-time key; session save excludes the key;
- tests for all of the above.

### Phase 3 — Quality (unchanged)
Evaluation set and prompt tuning, now per provider.

### Phase 5 — Fixes after review (implemented)
- **Search tab:** accepts SQL or a question, same pipeline as a row (detect, generate, safety check,
  one repair, follow-ups with the last 3 turns, reuse). Shows the AI summary and View generated SQL
  with Copy / Use as SQL; no-key hint. Search results are always a table.
- **Chart check:** the AI's display is kept only if the result can be drawn that way (2+ columns,
  a numeric measure, pie ≤ 20 rows, bar ≤ 100 rows, line ≥ 2 rows); otherwise table.
- **Generator size cap** in the safety check (§9).
- **Schema freshness and reuse** (§11).
- **Busy providers:** up to 3 retries on 429/5xx, honouring `Retry-After` (capped at 10 s); timeouts
  stop after 2 attempts.
- **Prompt:** 4 short worked examples on an imaginary schema.
- **UI:** the AI's one-line explanation and model · time · tries are shown next to the badge.
- Stale "set VITE_GEMINI_API_KEY" error text replaced; library build fixed (`SearchTable` was deleted
  earlier: the package now uses and exports `DataTable`).

### Later
AI context hints box, Named Queries tab, a "data sources" list for empty dashboards, opt-in sample
values for filters (changes the names-only rule, needs a decision), Chrome built-in AI, WebLLM
(Appendix A).

---

## 18. Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | ~~Key in `.env` (visible in the bundle)~~ | **Superseded (2026-11-19):** the user enters their own key (§6) |
| Q2 | Per-user key | **Yes (2026-11-19)**: entered in Connection Settings, optional |
| Q3 | AI context hints box | Later, if accuracy needs it |
| Q4 | AI picks the display | Yes |
| Q5 | What schema info is sent | Table/file-source + column names and types; no values |
| Q6 | Persist generated SQL | No: memory only |
| Q7 | Scope of v1 | Keep it simple and evolve; npm library unchanged |
| Q9 | Provider choice | **Yes (2026-11-19)**: Gemini, Claude, OpenAI, OpenAI-compatible |
| Q10 | Hint for users without a key | **Yes (2026-11-19)** |
| Q11 | Key storage | **Session-based (`sessionStorage`) (2026-11-19)**; nothing persisted beyond the session |
| Q12 | "Test key" request | **No (2026-11-19)**: no tokens spent on validation; verification follows a separate plan (§6.4) |
| Q13 | Key scope | **One key per browser (2026-11-19)**, independent of the DazzleDuck connection |
| Q8 | Defaults | **Gemini + `gemini-3.1-flash-lite` (2026-11-19)**, user-changeable; no build-time pre-selection |
| Q15 | New tabs | **Session-only, per tab (2026-11-19)**: a new tab re-enters the key; no sharing between tabs |

| Q14 | Security design | **Approved (2026-11-19):** layers 1–4 in §6.5 |
| Q17 | When is the key cleared? | **On DazzleDuck logout or on tab close (`sessionStorage`) (2026-11-19). The Clear key button was removed (2026-11-20).** |
| Q18 | Auto-clear after idle time | **No (2026-11-19)**: not needed; logout and tab close cover it |
| Q19 | CSP `connect-src` | **`'self' http: https:` by default (2026-11-20; the localhost-only http default blocked LAN servers)**; the deployer narrows it in `serve.json` to their own server(s) |

### Open — for a later discussion
| # | Question | Proposal |
|---|---|---|
| **Q16** | Verify the key with the user's provider account (sign-in flows) | Later, separate discussion (§6.4) |

---

## Appendix A — Other options (kept for later)

All options plug into the same provider interface (§6.1).

| Option | Cost | Download | Data leaves browser | Notes |
|---|---|---|---|---|
| **Chrome built-in AI (Prompt API, Gemini Nano)** | Free | Chrome downloads its own model once per machine | No | Web pages from Chrome 148; needs ≥22 GB free disk, >4 GB VRAM or 16 GB RAM; Chrome desktop only. JSON schema via `responseConstraint`. Could become a no-key provider option. |
| **Puter.js (user-pays)** | Free allowance per user | None | Yes | No API key; each user signs in to Puter. Third-party dependency. |
| **WebLLM (in-browser model)**: last resort | Free | ~0.9–1.7 GB once per browser | No | WebGPU in a Web Worker. Qwen2.5-Coder-1.5B (~1.6 GB GPU memory) or -3B (~2.5 GB). 4K context. |

Groq, OpenRouter and local Ollama are covered by the **OpenAI-compatible** provider (§6.1).
