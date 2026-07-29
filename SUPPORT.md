# Support

Beta-Stock is an early open-source simulator maintained by [@frabcd](https://github.com/frabcd) with help from contributors. The current tree is a `v0.1.0` release candidate, not proof that a public tag or support channel is live.

Use the right channel so questions remain useful to others:

- **Setup and usage questions:** [GitHub Discussions](https://github.com/frabcd/Beta-Stock/discussions) after the repository is published.
- **Reproducible defects:** after publication, use the [bug report form](https://github.com/frabcd/Beta-Stock/issues/new?template=bug.yml).
- **Focused proposals:** after publication, use the [feature proposal form](https://github.com/frabcd/Beta-Stock/issues/new?template=feature.yml).
- **Security vulnerabilities:** follow [SECURITY.md](SECURITY.md) and use private vulnerability reporting once enabled. Never open a public security issue.
- **DeepSeek billing, credentials or service availability:** contact DeepSeek support; do not share a key with Beta-Stock maintainers.
- **Investment or trading advice:** this project cannot provide it.

Before posting, remove API keys, cookies, personal portfolio data, prompt history, licensed market data and account identifiers. Include the Beta-Stock commit/version, operating system, Node version, data classification (`SYNTHETIC`, `REPLAY`, `DELAYED` or `LIVE`), market, session, currency, exact reproduction and sanitized evidence.

Response times are best-effort. A public roadmap item is not a promise of delivery, and simulation behavior must be verified before it is used for education or research.

For local troubleshooting, stop the recorded server with `.\scripts\Stop-BetaStock.ps1`, then inspect `E:\Beta-Stock\.logs\server.stderr.log` and `E:\Beta-Stock\.logs\server.stdout.log`. Sanitize those files before sharing them. Paper-account state is stored under `E:\Beta-Stock\.data`; do not attach that directory to a public report.
