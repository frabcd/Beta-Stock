# Market-rule model

Beta-Stock models educational paper trading. It is not an exchange rulebook or broker entitlement statement. Rules are effective-dated and instrument-aware; primary references are linked in this document, while applicable violations are exposed to the user at validation time.

## Shared requirements

The current instrument contract carries market, exchange, quote currency, timezone, board lot, optional China board, active state, previous close, and optional quantity/tick/price-limit overrides. Effective-dated rule sets supply session windows, tick tables, supported time in force, settlement-day metadata, fee schedule, and source notes.

The current quote contract is synthetic and carries its event time, trading date, OHLC/bid/ask values, sizes, cumulative volume, and sequence. API responses add a single `SYNTHETIC` provenance envelope with source, as-of time, and computed age. Provider identity, receive time, entitlement, and vendor-delay fields are requirements for a future adapter; they are not present in the current domain event.

Never infer a rule from a ticker suffix alone, and never silently convert quantity, price, currency, session, or order type.

## United States

- Core session: 09:30–16:00 in `America/New_York`; pre/after/overnight access is provider- and broker-specific.
- Positive whole-share quantities only; fractional orders are not supported.
- T+1 settlement is retained as effective-dated rule metadata. The simulator does not model a cash settlement queue.
- No universal daily price-limit percentage; halts and LULD are event state.
- The planned NMS tick changes are effective-dated and must not be enabled before their compliance date.

Primary references: [NYSE hours and calendars](https://www.nyse.com/trade/hours-calendars), [SEC T+1 FAQ](https://www.sec.gov/exams/educationhelpguidesfaqs/t1-faq), [SEC Rule 612 relief order](https://www.sec.gov/files/rules/exorders/2025/34-104172.pdf).

## Hong Kong

- Normal equities: pre-opening 09:00–09:30, morning 09:30–12:00, afternoon 13:00–16:00, then Closing Auction Session with a randomized close.
- Quote currency is instrument/counter-specific; HKD is common but not universal.
- Board lots are instrument metadata, not a market constant. Odd lots use a separate market.
- T+2 settlement is retained as rule metadata. The simulator does not defer cash through a settlement queue.
- Tick sizes use a price-band table and are effective-dated.
- Fees and levies have independent bases and rounding; display every line rather than a hidden aggregate.

The market changed during 2026: board-lot standardization began in phases on 2 July, and another minimum-spread phase was scheduled for 3 August. Rules therefore require effective dates rather than constants.

Primary references: [HKEX trading FAQ](https://www.hkex.com.hk/Global/Exchange/FAQ/Securities-Market/Trading?sc_lang=en), [board-lot transition](https://www.hkex.com.hk/News/Market-Communications/2026/260630news?sc_lang=en), [minimum-spread transition](https://www.hkex.com.hk/Services/Trading/Securities/Overview/Trading-Mechanism/Reduction-of-Minimum-Spreads?sc_lang=en), [settlement](https://www.hkex.com.hk/Services/Settlement-and-Depository/Settlement?sc_lang=en), [transaction fees](https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-%28Hong-Kong%29/Trading/Transaction?sc_lang=en).

## Mainland China A-shares

- Opening call auction 09:15–09:25; continuous trading 09:30–11:30 and 13:00–14:57; closing call 14:57–15:00 in `Asia/Shanghai`.
- Main-board buys generally use 100-share multiples; handling of a remaining odd-lot sell is a distinct rule.
- STAR, ChiNext, main-board and risk-warning securities have different quantity and price-limit behavior.
- Main-board securities commonly use a 10% limit and risk-warning securities commonly use 5%; STAR commonly uses 20% after its initial no-limit listing period. The resolver must use venue, board, status and listing age.
- Enforce A-share sell availability/T+1 behavior in the ledger.

Primary references: [SSE schedule](https://english.sse.com.cn/start/trading/schedule/), [SSE trading mechanisms](https://english.sse.com.cn/start/trading/mechanism/), [Shenzhen–Hong Kong Stock Connect rules](https://www.szse.cn/enSzhk/tradeMechanism/tradeRules/).

## Order lifecycle

```text
submitted
  -> instrument/session/lot/tick/limit validation
  -> risk and buying-power check
  -> cash/share reservation
  -> accepted
  -> pending | partial | filled | cancelled | expired | rejected
  -> exact cash/position/FIFO cost-basis posting
  -> A-share sell-availability date where applicable
```

Given the same simulator snapshot, request, and quote sequence, fills are deterministic. The bundled synthetic generator is seeded, and effective-dated rules are selected from the event time. The current API does not emit a dataset hash, ruleset version ID, or fill-model version, and licensed historical replay import is not implemented. The UI labels execution as synthetic/simulated.

## Current implementation boundaries

- Time in force is `DAY` for US/HK/CN and `GTC` for US; IOC is not implemented.
- US execution covers the regular session only; pre-market, after-hours, overnight trading, halts, and LULD event feeds are not modeled.
- Calendar logic excludes weekends but does not ship a maintained exchange-holiday or halt package.
- The Hong Kong closing-auction window is simplified and does not model its randomized cutoff.
- Settlement-day values are rule metadata; the engine models Mainland T+1 sell availability, not broker-style unsettled-cash queues.
- Fees are educational simulator profiles, not a broker quote or guarantee of current charges.
- USD portfolio projections use frozen scenario FX (`USD=1`, `HKD=0.1279`, `CNY=0.1394` USD per currency unit), not live or historical foreign-exchange data.
