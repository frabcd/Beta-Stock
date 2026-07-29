# Beta-Stock product brief

> Paper trading across three rulebooks.

Beta-Stock is a local-first paper-trading workspace for US, Hong Kong, and Mainland China equities. It combines a professional multi-market cockpit, deterministic order simulation, transparent market-rule education, and a context-aware DeepSeek research assistant. It never routes a real order and never disguises synthetic data as a live feed.

This brief describes the current `0.1.0` development surface unless a sentence explicitly says “target.” The current build is synthetic-only. Its USD portfolio projection freezes scenario FX at `USD=1`, `HKD=0.1279`, and `CNY=0.1394` USD per currency unit; these are fixtures, not live or historical FX quotes. Several portfolio, news, breadth, statistics, depth, and journal modules are illustrative UI samples and are labeled that way in the interface.

## Product principles

1. **Truth is a visible UI state.** The current API emits only `SYNTHETIC` and surfaces source/as-of context. `REPLAY`, `DELAYED`, and `LIVE` are reserved future classifications, not provider capabilities.
2. **The simulator behaves like an account, not a toy.** Orders, reservations, partial fills, fees, positions, buying power, FIFO cost basis, order events, and persisted history share one auditable state model.
3. **Cross-market differences are first-class.** A US symbol, Hong Kong board lot, and Mainland A-share cannot pass through one generic rule branch.
4. **AI explains; the user decides.** Beta AI can summarize the user-supplied synthetic context and describe an order idea in text. It has no structured order action and cannot place, alter, or cancel an order.
5. **Calm at first glance, deep on demand.** The default workspace is readable in seconds; active-trader depth remains one interaction away.
6. **Local means project-contained.** Core development keeps writable state under the checkout. The strict Windows launcher additionally requires `E:\Beta-Stock` and places app state, secrets, logs, caches, QA artifacts, and its dedicated browser profile there.

## Primary journeys

### Start the day

- Read current US/HK/CN session state and data freshness before seeing price performance.
- Scan total simulated equity, daily P&L, buying power, exposure, and watchlist changes.
- Open Markets for server-returned synthetic indices/instruments and session state. Breadth and sector modules are labeled illustrative samples.
- Ask Beta AI for a sourced briefing based only on the normalized facts attached to the current workspace.

### Research an instrument

- Search by symbol, company, or market.
- Keep the Trade route's market list, chart, estimated book/tape, illustrative statistics, and order ticket on the selected instrument.
- Switch between candlesticks and area view without losing the selected symbol. The 5D, 1M, and 6W controls select deterministic daily-bar windows; crosshair inspection exposes exact OHLC and estimated volume, drag/wheel gestures pan and zoom, and Reset view returns to the fitted series.
- Inspect synthetic quote provenance/as-of time, currency, exchange, session, and board-lot context. Receive-time, vendor-delay, and rule-version identifiers are not exposed.

### Place a simulated trade

- Choose Buy/Sell, market/limit/stop/stop-limit, quantity, and supported time in force.
- See estimated notional and buying power before review; server-side board-lot, tick, price-limit, session, position, and funding validation returns a readable rejection after submit when invalid.
- Explicitly confirm the browser's normal order review. AI output does not populate this flow.
- Observe the resulting lifecycle events immediately after submission and persisted order status/cancellation in the order blotter.

### Review performance

- Inspect server holdings, local-currency position P&L, and a USD account summary converted with the disclosed frozen scenario FX rates. Allocation, performance history, risk, and scenarios are visibly labeled illustrative modules.
- Filter persisted orders and inspect a non-editable sample journal. Editable notes and fill-history filters are not implemented.
- Reset is exposed from Overview behind an explicit confirmation dialog that explains the destructive scope. The local API itself has no separate confirmation token, so direct callers remain responsible for intent.

## Required workspaces

- **Overview:** server account summary, illustrative equity curve, market list/movers, labeled static news, and an AI Lab entry point.
- **Markets:** US/HK/CN tabs, synthetic headline indices/instruments, session/provenance context, search/sort, and labeled illustrative breadth/sectors.
- **Trade:** market list, quote-anchored synthetic daily chart with crosshair/pan/zoom/reset interaction, estimated book/tape, illustrative statistics, review-first order ticket, and mobile ticket sheet.
- **Portfolio:** server equity/P&L and holdings plus labeled illustrative allocation, risk, scenario, and performance modules.
- **Orders & Journal:** persisted order status/cancellation and a non-editable sample journal.
- **AI Lab:** suggested questions, visible submitted-context/source/as-of metadata, deterministic demo or optional DeepSeek streaming, and no order actions.

## Explicit non-goals

- Routing to a real broker or accepting deposits.
- Claiming that DeepSeek supplies real-time prices.
- Scraping or redistributing unlicensed exchange/news data.
- Hiding synthetic or delayed status behind a generic connection indicator.
- Copying competitor branding, screen arrangements, illustrations, icons, or motion.
- Offering investment advice or promising performance.

## Quality bar

The release gate covers credibility, density, chart and order quality, market-rule fidelity, feedback states, simulator depth, responsiveness, accessibility, and AI provenance. A screen fails regardless of score if it clips at supported breakpoints, obscures currency/session/data age, calls synthetic data live, emits console errors, lacks keyboard focus, or allows a destructive action without confirmation.

Target viewports: `1920×1080`, `1440×900`, `1366×768`, `1280×720`, `700×820`, and `390×844`.
