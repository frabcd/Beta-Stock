# Ethical launch playbook

Stars are not a correctness metric and cannot be guaranteed. The launch goal is repeatable value: people understand the simulator, complete setup, trust its limits, return, and contribute evidence-backed improvements.

## Current release state

The repository is a `v0.1.0` release candidate until every item in [RELEASE-QA.md](RELEASE-QA.md) has current evidence. Do not infer completion from the existence of test scripts, workflow files, screenshot directories, or this playbook. In particular, public CI, blind visual review, clean-clone results, screenshot selection, and revocation of any previously exposed credential remain separate release gates until recorded.

## Proof before promotion

Do not announce broadly until all of these are true:

- A clean clone passes setup, launch, unit, integration, security, browser, accessibility and production-build checks.
- The Windows launch and `.\scripts\Stop-BetaStock.ps1` stop path are verified from `E:\Beta-Stock`.
- The visible order ticket reaches the simulator API, shows submission lifecycle events, and the order blotter persists status and cancellation.
- AI Lab reaches the server route, distinguishes demo/connected state and never manufactures readiness.
- Overview, Trade, Portfolio, AI and mobile screenshots show current behavior without fake live state.
- CI, CodeQL and secret scanning are green on the default branch.
- Any previously exposed development credential is revoked and no key pattern exists in files or history.
- Every README link works for an anonymous visitor.
- The About description, topics, and reviewed social preview match the final repository state.
- Labels referenced by the issue forms and release-note categories exist before contributors use them.
- Private vulnerability reporting and Discussions are enabled.

## Repository presentation

GitHub recommends a README that explains what the project does, why it is useful, how to start, where to get help and who maintains it. Keep proof near the top: one real overview screenshot, the differentiator, and the shortest verified setup path. [README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

Set the repository About description to:

> Rule-aware, local-first paper trading for US, Hong Kong, and Mainland China equities. Uses deterministic synthetic data, exact-money accounting, venue-specific rules, and optional server-side DeepSeek research. Educational only; never routes real orders.

Leave the GitHub **Website** field empty until Beta-Stock has a verified public documentation site or hosted demo. Pointing that field back to the repository adds no destination, and publishing the loopback app as though it were a hosted service would misstate the product. The package `homepage` may continue to target the repository README.

Recommended topics (maximum 20):

```text
paper-trading
stock-simulator
trading-simulator
stock-market-simulator
portfolio-simulator
financial-simulation
financial-education
equities
us-stocks
hong-kong-stocks
china-stocks
a-shares
market-microstructure
deepseek
local-first
react
typescript
fastify
```

Topics improve discovery when they accurately describe a repository. [GitHub topic guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)

## Social preview

The candidate 1280×640 PNG is checked in at [`docs/assets/social-preview.png`](assets/social-preview.png). Before publication, regenerate or verify it against the final commit, confirm it remains under 1 MB, and upload that exact reviewed asset in the repository settings. Its design should retain:

- Beta-Stock logo and name in the upper-left safe area;
- “Paper trading across three rulebooks.” immediately below;
- one current product screenshot occupying roughly half the canvas;
- `US`, `HK`, `CN` chips and an explicit `SYNTHETIC PAPER TRADING` label;
- no performance claim, tiny price table, competitor mark or decorative badge.

Keep essential content at least 64 px from every edge and test crops on light/dark surfaces. GitHub recommends 1280×640 for best rendering. [Social preview guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)

## First release

Tag `v0.1.0` only after a clean-clone release audit. Include:

- verified requirements and known limitations;
- Windows setup and stop instructions;
- overview/trade/mobile screenshots;
- source and binary checksums for any downloadable archive;
- exact Node version and test totals;
- synthetic-data and educational-use statement;
- migration/reset notes;
- a link to security reporting and support.

GitHub Releases package deployable iterations with notes and assets; automated notes should be reviewed rather than published blindly. [Release guidance](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), [generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)

Release notes must state that Reset restores the deterministic seeded account without an in-app undo or backup. Before copying local state, stop the server and copy the entire `E:\Beta-Stock\.data` directory as one set so the SQLite database and any WAL/SHM companions remain together. The release candidate does not promise cross-version restore compatibility.

The strict Windows launcher uses only these project locations: `.data` for SQLite state, `.cache` for npm/Edge/test caches, `.runtime` for the PID/browser profile/app data/temp, `.logs` for server/build output, `.secrets` for the optional DPAPI credential, and `artifacts` for QA output. The exact paths and reset behavior belong in the release notes, not only in source code.

## Distribution

Lead with the engineering story, not a request for stars:

- exact money arithmetic and deterministic seeded fixtures;
- effective-dated rules across three different market structures;
- visible data provenance and no synthetic-to-live sleight of hand;
- server-only AI credentials and a research-only AI route with no order-mutation tool.

Publish one transparent technical article and one short demo. Share in Show HN, finance/quant development communities and relevant regional communities only when their self-promotion rules permit it. Identify yourself as the author, adapt the post to each community, invite concrete rule/accessibility corrections, and respond to setup failures quickly.

Never buy stars, use fake accounts, require a star for access, mass-message users, scrape contacts, copy competitor media, fabricate testimonials, or imply that popularity validates financial accuracy. GitHub's community guidance says shared links should add relevant context and should not be unsolicited posts made only to drive traffic. [GitHub Community Code of Conduct](https://docs.github.com/en/site-policy/github-terms/github-community-code-of-conduct)

## Metrics worth watching

- clean-clone setup success;
- first simulated order completion;
- return use after the first session;
- release downloads and upgrade success;
- issue reproducibility and time-to-first-response;
- returning contributors and merged evidence-backed rule corrections;
- accessibility defects found and closed.

Review the repository’s Community Standards checklist after publication. GitHub checks for README, license, contributing guide, code of conduct, security policy and issue templates. [Community profile guidance](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
