# Changelog

All notable Beta-Stock changes will be documented here. The project will follow [Semantic Versioning](https://semver.org/) once the first release is tagged.

## Unreleased

No post-`v0.1.0` changes are recorded yet.

## 0.1.0 - pending release

This section describes the current release candidate. It is not evidence that a `v0.1.0` tag, GitHub release, clean-clone audit, CI run, visual review, or credential revocation has completed. Those gates are tracked in [docs/RELEASE-QA.md](docs/RELEASE-QA.md).

### Added

- Deterministic US, Hong Kong and Mainland China simulation domain with exact arithmetic.
- Effective-dated market rules, fees, validation, order events, partial fills, settlement and snapshot restoration.
- Loopback Fastify API, SQLite persistence, explicit synthetic-data provenance and optional server-side DeepSeek boundary.
- Windows DPAPI key setup and E:-scoped data/cache/runtime/browser launch scripts.
- Responsive React workspaces for overview, markets, instrument trading, portfolio, orders/journal and AI research.
- Unit, integration and security test suites plus browser/visual QA scaffolding.

### Security

- Browser bundles never receive the DeepSeek credential.
- Origin/host checks, rate limits, CSP/security headers, strict bodies and redacted logging are enabled on the local API.

### Known limitations

- Deterministic synthetic market data only in the default build.
- Weekend-aware calendar without a maintained holiday/halt package.
- No extended-hours execution model.
- Simplified Hong Kong closing-auction cutoff and estimated simulator fee profiles.
- Node 22 currently labels `node:sqlite` experimental.
- No in-app backup, export, undo, or cross-version database-restore guarantee.
- No licensed replay, delayed, or live data adapter and no brokerage connection.
