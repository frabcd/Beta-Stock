# Security policy

Do not report a vulnerability through a public issue.

Use GitHub private vulnerability reporting for the Beta-Stock repository once that channel is enabled. If the private-report form is unavailable, this release candidate does not yet advertise a verified fallback security address: do not disclose the issue or proof in a public issue, Discussion, pull request, or social post. Wait for a private channel to be listed in this policy or use a verified private contact method published by the maintainer. Include the affected commit/version, prerequisites, a minimal reproduction, expected impact, and suggested mitigation if known. Remove API keys, account data, cookies, prompts, licensed datasets, and other secrets from all evidence.

The current development branch receives security fixes. No tagged release exists until the release process publishes one.

| Version | Security status |
| --- | --- |
| Unreleased `v0.1.0` candidate | Receives fixes |
| Tagged releases | None published yet |

The local trust model, secret handling, loopback controls, AI boundary, and writable-path policy are documented in [`docs/SECURITY.md`](docs/SECURITY.md).

The optional Windows credential is stored at `E:\Beta-Stock\.secrets\deepseek-api-key.dpapi.xml`; it is DPAPI-protected for the current Windows account, not portable encryption and not a defense against another process already running as that account. Revoke any key that has appeared in chat, an issue, a log, a screenshot, or a commit. Deleting the local file with `.\scripts\Set-DeepSeekKey.ps1 -Clear` removes Beta-Stock's copy but does not revoke the key at DeepSeek.
