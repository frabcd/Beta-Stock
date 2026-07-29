# Release QA record

This document is the evidence checklist for the first Beta-Stock release. The current tree is a `v0.1.0` release candidate; it is not a tagged or verified release merely because the implementation and test commands exist.

## Release gates

Record a commit SHA, date, environment, command, result, and artifact path for each completed gate. Do not change a status to passed from memory or from an older build.

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Dependency install | Clean `npm ci` on the supported Node/npm versions | Passed locally 29 July 2026; lock-resolved tree validated on Node 22.19.0/npm 10.9.3 |
| Static checks | `npm run lint` and `npm run typecheck` logs | Passed locally 29 July 2026 |
| Domain and API tests | `npm run test` totals and log | Passed locally: 29/29 tests |
| Security checks | `npm run test:security`, dependency audit, and secret scan | Passed locally: 14/14 tests, 0 audit vulnerabilities, 0 Gitleaks findings |
| Production build | `npm run build` output | Passed locally: 2,331 modules transformed |
| Browser and accessibility | `npm run test:e2e` across the documented projects, with console/overflow/keyboard/axe results | Passed locally: 87 applicable tests, 33 intentional project skips, 0 failures |
| Visual matrix | Current desktop/mobile captures and no-update comparison against approved baselines | Passed locally across desktop 1440/1366/1280 and mobile 390 projects |
| Blind visual review | An anonymized side-by-side score using the documented benchmark protocol | Passed 29 July 2026: 5/5 wins, 90.6 mapped average, 91 overall, no Beta-Stock hard gate |
| Windows lifecycle | Setup, start, health, and `.\scripts\Stop-BetaStock.ps1` from `E:\Beta-Stock` | Pending final release run |
| Clean clone | Install, build, tests, launch, and stop in a new checkout | Pending final release run |
| Public automation | Default-branch CI, CodeQL, and secret-scanning links | Pending repository publication |
| Credential incident | Owner confirmation that every previously exposed key is revoked | Requires credential-owner verification; never infer from a clean scan |

## Screenshot set

Candidate screenshots are checked in and displayed in the README. The set below was regenerated from the final product source, reviewed for `SYNTHETIC` provenance and sensitive content, and independently checked for valid PNG structure and absent text metadata. A screenshot must never imply live prices or actual investment performance. Exact-commit verification remains part of the clean-clone gate.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `overview.png` | 481,636 | `ec59e1c01fecd0258dec709df2feb9e6b3f7f7f072f2e8d453bef242dc06e86e` |
| `trade.png` | 323,279 | `f6bfb8c3c340cefa94a2e41925058f4770df8cbff694658a0c2db76e137b6e0f` |
| `portfolio.png` | 463,827 | `61fbf786cd0ed74daa0753cef9c8b82830caae447a795731cefa7891d20d99eb` |
| `orders.png` | 323,712 | `e39656880ee1fe6c85da16220d300ed17e5cd4de99704e06d0f2e8c1a85a4d5e` |
| `markets.png` | 442,775 | `f2532ec0e8bc7913e1602e454a569fe1002a904057a5b1290914a51d45eedd46` |
| `ai-lab.png` | 345,133 | `3c5a2232e38f9681315cf1071713b6f3c720171616c1184ce0e00c83db2f5432` |
| `mobile-trade.png` | 77,214 | `6de74e75845005cf99471695b299e2193f4aebab7c1d3e61b284f47333248bcf` |
| `social-preview.png` (1280×640) | 425,240 | `d278a4e27a50ecfb420d4cc65ef1b17d5f92a75ca47567c5163c8c9c6a348827` |

## Local evidence — 29 July 2026

- Environment: Windows, Node `v22.19.0`, npm `10.9.3`, project and writable QA state on `E:`.
- Full experiment: `artifacts/experiments/experiment-2026-07-29T03-26-39-674Z.json` (local, ignored), passed all six stages in 6 minutes 29 seconds.
- Browser coverage: six routes at 1440×900, 1366×768, 1280×720, and 390×844 where applicable, plus axe, keyboard, reduced motion, console, overflow, lifecycle, loading, disconnected, light-theme, HK/CN-rule, chart-marker, and AI-evidence checks.
- Integrity manifest: 132 publishable files, 10,167,008 bytes, manifest SHA-256 `8216af89e0bba0815339bbb4c6f23a70337bbd89e3833ab250ad238425736f0d`.
- Blind result: five wins from five, 90.6/100 mapped average, 91/100 overall market readiness, no Beta-Stock hard gate. See the [dated benchmark record](DESIGN-BENCHMARK.md#dated-blind-result).

## Release procedure

1. Stop any existing instance with `.\scripts\Stop-BetaStock.ps1`.
2. Run the release checks on the exact candidate commit and preserve sanitized logs under the local `artifacts` directory.
3. Perform the clean-clone audit without reusing the working tree's `node_modules`, state, caches, browser profile, or secrets.
4. Confirm that default data remains deterministic and `SYNTHETIC`, and that demo AI mode works without a credential.
5. Have the credential owner verify revocation outside the repository. A repository scan cannot prove provider-side revocation.
6. Verify the final-commit screenshots against the dated blind result and update this record with their hashes.
7. Publish the repository and verify anonymous links, CI, CodeQL, secret scanning, private vulnerability reporting, and support channels.
8. Only then create the `v0.1.0` tag and release notes.

## Local state note

The strict Windows launcher stores paper-account state in `E:\Beta-Stock\.data\beta-stock.sqlite` with possible SQLite `-wal` and `-shm` companions. Reset restores the deterministic seeded account and has no in-app undo. A supported manual copy requires stopping the server and copying the whole `.data` directory as one set; this release candidate does not guarantee cross-version restoration.
