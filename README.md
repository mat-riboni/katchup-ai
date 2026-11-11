# Katchup

Katchup helps students recover the context of a lecture, understand the current slide and decode its notation without leaving the slide. The working frontend includes all **62 pages of Lecture 5a**, covering Markov Decision Processes, with English explanations, **314 glossary entries** and **718 local symbol definitions**.

## Submission deliverables

| Requirement | Included artifact |
| --- | --- |
| Working implementation | This repository: `web/` for the prototype and `src/agent/` for the optional model-backed agent |
| Technical documentation | This README, including run commands, models, dependencies and custom logic |
| Short architecture description | [Architecture](docs/architecture.md): inputs, knowledge, available operations, decisions and outputs |
| Example interactions, including a boundary | [Seven scenarios](docs/example-interactions.md), [executable runner](scripts/run-examples.mjs) and [captured results](examples/submission-results.json) |
| Optional interface or video | Working browser frontend plus a [two-minute demo walkthrough](docs/demo-walkthrough.md) |

## Run the prototype

**Requirements:** Node.js **22.9 or newer** and a current browser with native MathML support. Extract the complete repository before running it.

From the repository root:

```sh
npm run demo
```

Open **http://localhost:5173**. On macOS, double-clicking **Start Katchup.command** does the same thing. The launcher opens the browser, keeps the server running after it exits, and reuses an already running demo.

No dependency install, API key, backend or model download is required for the Lecture 5a demo. For a foreground server that stops with Ctrl+C, use:

```sh
npm run web
```

If port 5173 is occupied by another application, run `WEB_PORT=5175 npm run demo` on macOS/Linux and use the printed address. Opening `web/index.html` as a file redirects to the default localhost address; it does not start the server. Launcher logs and the server PID are in `.runtime/`.

To stop a server started by the persistent launcher, run `kill "$(cat .runtime/server.pid)"` on macOS/Linux from the same repository, after confirming the PID still belongs to this demo.

## Interact with the prototype

| Control | Behaviour |
| --- | --- |
| **Katchup**, or K | Shows prerequisites and connections to earlier slides in the left panel |
| **Explain this slide**, or E | Shows an explanation and worked calculations in a separate left panel |
| **Glossary**, or G | Shows page-specific terms, formulas and the meaning of each symbol; visible by default |
| Slide selector, numbered strip, arrow keys | Navigate all 62 pages |
| **Home / End** | Jump to the first or last page |
| **Esc** | Close the focused panel |
| **Open PDF** | Open the original PDF at the current page |
| **Revisit the prerequisites** | Navigate to relevant earlier pages |
| **Settings** | Change appearance |
| P, or `/#present` | Open the short presentation and walkthrough |

Opening one left panel closes the other; the glossary remains independently available. Text appears progressively each time a prepared panel opens. Closing it or changing slides cancels the previous animation. The symbol legend stays immediately visible, and mathematical expressions appear intact. Reduced-motion settings show the complete text immediately.

Direct links such as `http://localhost:5173/?start=25` open a chosen slide. The interface is driven by these actions; it does not contain a free-text chat input.

## Models, libraries and frameworks

| Component | Technology used | Role |
| --- | --- | --- |
| Frontend | HTML5, CSS, vanilla JavaScript ES modules | Interface and state, with no React/Vue or build step |
| Mathematical notation | Native MathML and a custom renderer | Subscripts, superscripts, fractions, sums and symbol legends; no math CDN |
| Local servers and agent | Node.js built-ins, including `http`, `fs`, `fetch` and `AbortController` | Asset serving, API, model requests and cancellation |
| Application data | Local JSON, WebP page images and the original PDF | Knowledge and lecture display; no database or vector index |
| Unit and API tests | Built-in `node:test` and `node:assert` | Agent, provider, data and HTTP checks |
| Browser tests | `@playwright/test` **1.56.1**, development dependency | Navigation, panels, equations and responsive layout |

There are **zero npm runtime dependencies** and no agent framework or provider SDK. Additional JSDOM checks were used during development, outside the shipped runtime; the repository's browser test suite is Playwright.

**Models used at runtime:** the shipped Lecture 5a demo selects `mode: "prepared"` and calls **no language model**. It retrieves bundled page-specific answers and simulates streaming in the interface. The original PDF is included, but the application does not perform OCR, speech recognition or automatic PDF ingestion at runtime.

**Implemented model integrations:** the optional agent supports OpenAI Chat Completions, Anthropic Claude Messages and local Ollama Chat through HTTP adapters. The backend uses the `LLM_MODEL` environment value. The repository's non-prepared browser defaults are `gpt-4.1-mini` for OpenAI, `claude-opus-5-5` for Claude, and `gpt-oss:20b` for Ollama. These are configuration strings in the code, not a claim that those models were used or their current availability verified. Select an accessible model compatible with the adapter before running the optional path.

No model was fine-tuned. External model inference was not performed as part of this delivery; provider tests use controlled responses. The main demo remains fully runnable without those services.

## Custom logic

- **Deterministic routing:** the prepared lesson is selected before provider settings, so stale keys or unavailable APIs cannot interrupt the main demo.
- **Local knowledge selection:** each page has separate context, explanation, glossary, symbol definitions and prerequisite references. The loader validates required content and rejects unsafe asset paths and references to future pages.
- **Progressive output:** cancellable text chunks preserve full formula expressions and bold spans. Request tokens prevent late answers from overwriting another slide.
- **Math rendering:** compact Unicode notation becomes escaped MathML, with appropriate scripts, fractions and sums.
- **Bounded model-backed workflow:** the optional agent builds an allowed source window, requests one of three answer types, validates JSON and source IDs, and permits one correction attempt before returning an error.

See [architecture](docs/architecture.md) for the decision flow and output contract, and [lecture content](docs/lecture-content.md) for editing instructions and the numerical clarifications included in the notes.

## Reproduce the example interactions

```sh
npm run examples
```

The runner checks four Lecture 5a interactions, one source-grounded agent response, a future-transcript rejection and rejection of a future citation. It exits unsuccessfully if an assertion fails.

```sh
npm run examples -- --write
node scripts/run-examples.mjs --json
```

The first command refreshes `examples/submission-results.json`; the second prints machine-readable results. Fixed adapter fixtures are explicitly identified. The boundary check rejects a future transcript before any model call, while the invalid-output case exercises the real validator and its two-attempt limit.

## Run the optional model-backed agent

This is a separate evaluation path through the API. Starting it does not change the prepared Lecture 5a interface or reveal provider settings there.

1. Copy `.env.example` to `.env` if no `.env` exists, then configure your provider and model:

   | Provider | Required settings |
   | --- | --- |
   | OpenAI | `LLM_PROVIDER=openai`, `LLM_MODEL=<accessible model>`, `OPENAI_API_KEY=<key>` |
   | Claude | `LLM_PROVIDER=claude`, `LLM_MODEL=<accessible model>`, `ANTHROPIC_API_KEY=<key>` |
   | Ollama | `LLM_PROVIDER=ollama`, `LLM_MODEL=<installed model>`, optionally `OLLAMA_BASE_URL` |

   OpenAI uses Chat Completions with JSON mode. Claude uses Messages. Ollama must be running locally with the selected model available. Backend credentials stay on the server; `.env` is excluded from the delivery archive.

2. Import the small English evaluation lesson once:

   ```sh
   npm run import:lecture -- examples/agent-check/lecture.json
   ```

   Import refuses to overwrite an existing lecture. A second argument can supply a PDF for other lessons. Do not import the full prepared deck just to run the browser demo.

3. Start the API:

   ```sh
   npm start
   ```

4. In another terminal, request an action:

   ```sh
   curl http://127.0.0.1:3001/api/health

   curl http://127.0.0.1:3001/api/lectures/agent-check/actions \
     -H 'Content-Type: application/json' \
     -d '{"action":"context","slideNumber":2,"transcriptThroughSlide":1}'
   ```

The agent prompt requests English. Supported actions are `context`, `explain` and `glossary`. Successful answers include summary, points or terms, missing information and original cited sources. Health reports whether configuration exists, not whether credentials work. For the boundary case, change the cutoff to `3` while retaining slide `2`: the API returns HTTP 400 with `INVALID_CUTOFF`, even without a working model.

The server listens on loopback and allows one generation at a time. A second concurrent action receives HTTP 429. The structured validator checks source IDs and shape; it does not establish semantic truth. Other technical limits and exact guard behaviour are described in [architecture](docs/architecture.md).

## Verification

```sh
npm test
npm run examples
```

The Node suite has no installation requirement. Some API tests bind temporary loopback ports. To run the browser suite:

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

Playwright starts a separate server on port 5174. Installing test dependencies and a browser requires network access. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an existing Chromium executable.

See [verification](docs/verification.md) for the checks performed and the browser-execution limitation in the authoring environment. No successful visual browser run or real-model evaluation is implied by the unit checks.

## Repository guide

| Path | Responsibility |
| --- | --- |
| `web/index.html`, `web/styles.css`, `web/app/main.mjs` | Interface and interaction state |
| `web/app/api/lesson.mjs` | Prepared, provider, backend and sample routing |
| `web/app/reveal.mjs`, `web/app/ui/math.mjs` | Progressive text and mathematical rendering |
| `web/lesson/` | Lecture 5a JSON, original PDF and 62 images |
| `src/agent/` | Context selection, model orchestration and output validation |
| `src/llm/adapter.mjs` | HTTP adapters for three model providers |
| `src/app.mjs`, `src/server.mjs` | Optional agent API and startup |
| `scripts/start-demo.mjs`, `scripts/serve-web.mjs` | Local prototype startup and serving |
| `scripts/run-examples.mjs`, `examples/submission-results.json` | Reproducible scenarios and captured outcomes |
| `test/`, `e2e/` | Node and browser tests |
| `docs/` | Architecture, interaction examples, demo guide and content notes |

`docs/previous-project-notes.md` is retained as historical development context. This README and the linked submission documents describe the current deliverable.
