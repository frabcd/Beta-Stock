# Security and privacy model

Beta-Stock is a local simulator, but a loopback service and an AI credential still require a real security boundary.

## Compromised-key warning

Any DeepSeek key pasted into a chat, issue, log, screenshot, or other third-party surface must be treated as compromised and revoked. Beta-Stock does not require a key for demo mode, and no credential is included in this repository.

Never put a replacement in:

- a `VITE_*` variable;
- HTML or browser JavaScript;
- local/session storage;
- a URL or command-line argument;
- a screenshot, fixture, test, log, issue, commit, or pull request.

The Windows setup script accepts a replacement through a masked prompt and stores only a DPAPI-encrypted value under `E:\Beta-Stock\.secrets`. The launcher decrypts it for the server process only. DPAPI is suitable for a single-user local app but does not protect against another process already running as the same Windows account.

## Trust boundaries

```text
Browser on explicit E: profile
        |
        | same-origin loopback HTTP
        v
Fastify API on 127.0.0.1
  |          |            |
  |          |            +--> E:-resident persistence
  |          +--> deterministic simulator
  +--> fixed api.deepseek.com endpoint (optional)
```

The browser never receives the DeepSeek key. AI Lab does, however, compose a context summary in the browser from the current synthetic bootstrap response. That summary includes portfolio equity, position symbols/share quantities, source, classification, and as-of time. The local AI endpoint treats it as client-supplied text and forwards it with the question when DeepSeek mode is enabled; it does not reload or attest portfolio state server-side. AI output cannot mutate account state.

## Third-party AI data flow

- Demo mode is local and sends no request to DeepSeek.
- Connected mode sends the user's question and the UI-composed synthetic context summary to `https://api.deepseek.com/chat/completions`.
- Do not include personal data, real portfolio details, credentials, private research, or licensed content in an AI prompt.
- DeepSeek is a separate service with its own [privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) and [Open Platform terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html). Beta-Stock does not control DeepSeek's processing or retention.
- The current client keeps only the active thread in React state; clearing/reloading the page removes that client state, but it cannot retract a request already sent upstream.

## Local service controls

- Bind only to `127.0.0.1`.
- Serve the production UI and API from one origin.
- Reject disallowed or `null` browser origins; origin-less loopback clients remain possible by design.
- Apply a restrictive CSP and security headers; no CDN scripts or remote fonts.
- Validate request bodies and cap body size, history length, token budget, concurrency and request time.
- Rate-limit AI and order routes independently.
- Allow no generic outbound URL fetch or proxy route.
- Redact authorization headers, cookies, prompts, portfolio details and secrets from logs.
- Cancel the upstream AI request when the browser disconnects.
- Parse AI output through a dependency-free safe Markdown subset: headings, paragraphs, unordered lists, emphasis, strong text, and inline code only. Raw HTML, links, images, unsupported constructs, and unsafe protocols are never interpreted.
- Keep the AI route separate from order mutation. The browser Trade flow uses a review step, but direct loopback API callers can submit to `POST /api/orders` without a human-confirmation primitive.

## Writable paths

Portable core defaults are scoped under the current project; this installation's strict Windows launcher places that project at `E:\Beta-Stock`:

```text
E:\Beta-Stock\.data       account state and SQLite WAL files
E:\Beta-Stock\.cache      npm, browser and QA caches
E:\Beta-Stock\.runtime    process files and the dedicated browser profile
E:\Beta-Stock\.logs       local server and launcher build output
E:\Beta-Stock\.secrets    DPAPI-encrypted local secret
E:\Beta-Stock\artifacts   QA screenshots and reports
```

The launcher sets `BETA_STOCK_STORAGE_POLICY=strict-e`, passes an explicit Edge `--user-data-dir` and `--disk-cache-dir`, and does not repurpose `HOME`, edit a roaming profile, or alter global npm configuration. Manual development uses the portable policy and keeps writable paths beneath its own checkout.

## Reporting

Do not open a public issue for a suspected vulnerability. Use the private security-reporting channel configured on the GitHub repository once available, and include the affected version, reproduction, impact, and a minimal proof without secrets or personal data.
