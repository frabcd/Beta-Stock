# Contributing to Beta-Stock

Thank you for helping make paper trading more honest, useful, and accessible across markets.

## Ways to contribute

Code is not the only useful contribution. High-value starting points include:

- a reproducible setup, responsive-layout, keyboard, screen-reader, or contrast defect;
- a documentation correction that makes the synthetic-data, AI, reset, or storage boundary clearer;
- a primary-source correction to a US, Hong Kong, or Mainland China rule, with the rule's effective date and affected instrument/board; and
- a focused test case for exact arithmetic, order lifecycle, provenance, or a previously reported regression.

Do not use a real account, paid feed, personal portfolio, or production credential to create a reproduction. The bundled deterministic scenario is the preferred test fixture.

## Before opening code

- Search existing issues and discussions.
- For a material UX, market-rule, schema, or provider change, open a proposal first.
- Never include licensed market data, competitor screenshots, credentials, personal portfolio data, or copied product assets.
- Treat every market rule as effective-dated evidence. Link an exchange, regulator, or other primary source in the change.

## Local setup

Requirements: Node.js 22.12+, npm 10+, and Microsoft Edge or a Playwright-supported browser.

```powershell
git clone https://github.com/frabcd/Beta-Stock.git
Set-Location Beta-Stock
npm ci
npm run dev
```

Core development keeps writable app paths under the repository and is portable. On Windows, cloning to `E:\Beta-Stock` and using `scripts\Setup-BetaStock.ps1` plus `scripts\Start-BetaStock.ps1` enables the stricter E:-drive preset and DPAPI credential flow. Do not place a DeepSeek key in `.env` on a shared machine.

## Development standards

- Keep the browser free of secrets and authoritative portfolio mutation logic.
- Use exact integer/decimal arithmetic for money, price, fees and quantity validation.
- Preserve quote provenance and `SYNTHETIC`/`REPLAY`/`DELAYED`/`LIVE` truth labels.
- Add unit coverage for a rule or engine change and an interaction test for a user-visible workflow.
- Maintain keyboard access, visible focus, AA contrast, reduced motion and non-color-only state.
- Do not claim that a mock, replay or delayed feed is live.
- Do not let AI output execute orders. The current integration may describe an idea in text only; do not add a structured order action without a separately reviewed trust design.

## Quality checks

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:security
npm audit --audit-level=high
npm run build
npm run test:e2e
```

For visual changes, attach before/after captures at `1440×900` and `390×844`, describe the hierarchy or interaction problem being solved, and run the accessibility scan. Update intentional baselines only after reviewing the rendered image.

## Commit and pull-request shape

- Keep commits focused and written in the imperative mood.
- Explain what changed, why, user impact, validation, and any market-rule/source implications.
- Separate generated artifacts and dependency upgrades from product changes where practical.
- Mark incomplete UI or rule behavior clearly; a polished screenshot does not excuse an inaccurate simulator.

Small corrections can go directly to a pull request. For a new workflow, market/provider integration, schema change, or major visual redesign, open a proposal before implementation so scope, evidence, licensing, and trust boundaries can be reviewed without wasting contributor effort. Maintainer responses and roadmap entries are best-effort, not delivery commitments.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and license your contribution under the [MIT License](LICENSE).
