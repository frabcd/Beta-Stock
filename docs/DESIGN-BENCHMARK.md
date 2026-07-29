# Design benchmark and visual review gate

Beta-Stock uses common interaction ideas from leading trading products, implemented with an original visual system. Competitor material is reference evidence only; no screenshots, logos, marketing copy, proprietary icons, code, or data ship with the app.

## Reference strengths

| Product | Reference strength | Beta-Stock interpretation |
| --- | --- | --- |
| [Robinhood Legend](https://robinhood.com/us/en/legend/) | Calm hierarchy, linked widgets, chart interaction | Quiet chrome, large chart area, direct manipulation, restrained state ambience |
| [Webull Desktop](https://www.webull.com/trading-platforms/desktop-app/) | Dense active-trader tools, editable layouts, order flow | Progressive pro depth, fast order mode, useful columns, account analytics |
| [moomoo](https://www.moomoo.com/us/manual/topic-14-6) | US/HK/CN instrument context, heat maps, depth, linked research | Market-tagged watchlists, configurable quote context, provenance-first AI |
| [Tiger Trade](https://apps.apple.com/us/app/tiger-trade-invest-globally/id1023600494) | Global mobile workflow, event news, horizontal metrics | Stable mobile destinations, metric swiping, persistent symbol context |
| [Tonghuashun simulator](https://apps.apple.com/cn/app/%E5%90%8C%E8%8A%B1%E9%A1%BA%E6%A8%A1%E6%8B%9F%E7%82%92%E8%82%A1-%E8%BD%BB%E6%9D%BE%E8%82%A1%E7%A5%A8%E5%85%A5%E9%97%A8/id1509655942) | Mainland sentiment, limit ladders, capital-flow discovery | Optional Market Pulse with breadth, rotations, anomalies and board-aware state |
| [Eastmoney](https://about.eastmoney.com/about/product) | Research, filings, community and AI ecosystem | Source-linked research cards and clearly separated sentiment context |
| [TradingView Paper Trading](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/) | Full paper account, DOM/chart tickets, history and replay | Real order lifecycle, fees, journal, replay metadata and resettable scenarios |

## Video-reference truth note

The literal YouTube query supplied for the project did **not** return a stock-app demo in a reproducible anonymous browser. At 12:30 China Standard Time on 27 July 2026, the first organic result was Bloomberg Television’s “US Official Alleges Chinese AI Apps Used Banned Chips.” The downloaded research copy and search-client divergence evidence remain local and are excluded from Git.

The useful frames show a Kimi AI task composer, visible agent progress, a sourced evidence card, and a split-screen conversation. Beta-Stock transfers only these broad lessons:

- one unmistakable primary action;
- generous negative space around complex work;
- visible, plain-language progress states;
- source identity, claim, platform, and date separated into scannable fields;
- comparison panes with stable labels and an independent context rail.

The clip contains no quote feed, chart, watchlist, portfolio, order ticket, or exchange workflow and is not used as evidence for any of those features. See [`research/video/SEARCH_AND_VISUAL_ANALYSIS.md`](../research/video/SEARCH_AND_VISUAL_ANALYSIS.md).

## Original visual system

- **Base:** graphite-black surfaces with slightly blue lifted panels.
- **Product accent:** arctic blue/cobalt for selection and navigation, not gain/loss.
- **Positive/negative:** the current client supports user-configurable green-up/red-down and red-up/green-down. A color-safe blue/amber convention is a future requirement, not a current option.
- **Type:** system UI for labels; tabular numerals for all prices, amounts, percentages and timestamps.
- **Structure:** 1 px separators, restrained elevation, crisp active edges, and radii chosen by component scale.
- **Motion:** bounded control/panel transitions and a reduced-motion stylesheet path. Quote-flash behavior is not implemented.
- **State target:** future live, delayed, replay, stale, and disconnected modes must remain distinct without color alone. The current product emits synthetic data and renders loading/error/session state.

## Harsh review rubric

| Category | Points |
| --- | ---: |
| First-glance credibility and hierarchy | 15 |
| Information density without visual noise | 12 |
| Chart quality and direct manipulation | 15 |
| Order-ticket clarity, risk and feedback | 15 |
| US/HK/CN rule fidelity | 14 |
| Loading/live/stale/error/fill microinteractions | 10 |
| Portfolio and simulator depth | 10 |
| Responsive and accessibility quality | 5 |
| AI provenance and trust | 4 |

Pass threshold: `90/100` with no hard-gate failure.

This threshold is a release criterion. The existence of this rubric or of Playwright screenshot tests is not evidence that Beta-Stock has passed. A release claim requires a dated QA report, clean command output, viewport captures, and the completed blind-review evidence described below.

## Blind comparison protocol

1. Capture equivalent Watchlist, Instrument/Chart, Order, Portfolio, and AI scenarios in Beta-Stock and the most relevant reference.
2. Mask product names and logos, normalize the viewport, randomize A/B placement, and forbid ties.
3. Require the reviewer to choose a winner and give three concrete reasons for every screen.
4. Beta-Stock passes the visual challenge only by winning at least four of five screens, scoring at least 90, and satisfying every hard gate.
5. Iterate the losing screen, then rerun the entire suite so local polish does not create regressions elsewhere.

## Dated blind result

The final comparison was frozen and judged on 29 July 2026 (Asia/Shanghai). A compositor randomized the A/B position independently for every surface, removed explicit product names and logos, preserved source aspect ratios, and placed the five identity-scrubbed pairs in a judge-only directory. A fresh reviewer was restricted to those five PNGs and received neither the mapping key nor access to the workspace or web. The mapping key was opened only after the verdict was returned.

| Surface | Hidden Beta side | Blind winner | Beta score | Reference score |
| --- | ---: | ---: | ---: | ---: |
| Overview, watchlist, and discovery | B | B | 90 | 78 |
| Chart and order entry | A | A | 88 | 84 |
| Portfolio analytics | B | B | 92 | 69 |
| Order lifecycle feedback | A | A | 89 | 52 |
| AI and research evidence | B | B | 94 | 31 |

**Result: passed — five wins from five, 90.6/100 mapped average, 91/100 overall market readiness, and no Beta-Stock hard-gate failure.** The reviewer identified clipping in two reference panels; neither issue was mapped to Beta-Stock. The two Beta-Stock surfaces below 90 were retained in the record instead of rounded up or hidden.

The copyrighted comparison pack and mapping key remain local QA evidence and are excluded from Git. The checked-in product screenshots and Playwright baselines are the reproducible Beta-Stock side of the review; current official reference links and the known limitations of marketing/help-center media are recorded above.
