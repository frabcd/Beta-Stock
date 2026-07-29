import { describe, expect, it } from 'vitest';

import {
  SimulationEngine,
  compareDecimal,
  createDemoEnvironment,
  estimateFees,
  generateSyntheticBars,
  generateSyntheticTicks,
  getMarketRules,
  getSessionState,
  grossMinor,
  isTickAligned,
  priceLimitRange,
  tickForPrice,
  validateOrderRequest,
  type Account,
  type Currency,
  type Instrument,
  type Quote,
} from '../../src/domain';

const US_OPEN = '2026-07-27T14:00:00.000Z';
const HK_CN_OPEN = '2026-07-27T02:00:00.000Z';

function instrument(
  market: 'US' | 'HK' | 'CN',
  overrides: Partial<Instrument> = {},
): Instrument {
  const defaults: Record<typeof market, Instrument> = {
    US: {
      id: 'us-test', symbol: 'TEST', displaySymbol: 'TEST', name: 'Test US', shortName: 'Test',
      market: 'US', exchange: 'NASDAQ', currency: 'USD', assetClass: 'EQUITY',
      timeZone: 'America/New_York', boardLot: 1, active: true, previousClose: '100',
      sector: 'Test', logoText: 'T',
    },
    HK: {
      id: 'hk-test', symbol: '00001', displaySymbol: '0001.HK', name: 'Test HK', shortName: 'Test',
      market: 'HK', exchange: 'HKEX', currency: 'HKD', assetClass: 'EQUITY',
      timeZone: 'Asia/Hong_Kong', boardLot: 100, active: true, previousClose: '10',
      sector: 'Test', logoText: 'T',
    },
    CN: {
      id: 'cn-test', symbol: '600000', displaySymbol: '600000.SH', name: 'Test CN', shortName: 'Test',
      market: 'CN', exchange: 'SSE', currency: 'CNY', assetClass: 'EQUITY', chinaBoard: 'MAIN',
      timeZone: 'Asia/Shanghai', boardLot: 100, active: true, previousClose: '10',
      sector: 'Test', logoText: 'T',
    },
  };
  return { ...defaults[market], ...overrides };
}

function account(balances: Partial<Record<Currency, string>> = {}): Account {
  const cash = (currency: Currency, fallback: string) => {
    const balanceMinor = balances[currency] ?? fallback;
    return { currency, balanceMinor, reservedMinor: '0', buyingPowerMinor: balanceMinor };
  };
  return {
    id: 'account-test', name: 'Test portfolio', baseCurrency: 'USD',
    cash: { USD: cash('USD', '1000000'), HKD: cash('HKD', '100000000'), CNY: cash('CNY', '100000000') },
    positions: {}, realizedPnlMinorByCurrency: { USD: '0', HKD: '0', CNY: '0' }, version: 1,
  };
}

function quote(
  target: Instrument,
  at: string,
  values: Partial<Quote> = {},
): Quote {
  return {
    instrumentId: target.id,
    at,
    tradingDate: target.market === 'US' ? '2026-07-27' : at.slice(0, 10),
    bid: '99.99', ask: '100.01', last: '100', open: '100', high: '101', low: '99',
    previousClose: target.previousClose, bidSize: 10, askSize: 10, cumulativeVolume: 1_000,
    sequence: 1,
    ...values,
  };
}

describe('exact values and effective rules', () => {
  it('performs price, gross, and tick arithmetic without binary floating point', () => {
    expect(grossMinor('0.1', 3, 'USD')).toBe('30');
    expect(grossMinor('118.005', 100, 'HKD')).toBe('1180050');
    expect(isTickAligned('0.3000', '0.0001')).toBe(true);
    expect(isTickAligned('15.015', '0.01')).toBe(false);
  });

  it('selects effective-dated HKEX spread phases', () => {
    const hk = instrument('HK');
    const classic = getMarketRules('HK', '2025-08-03');
    const phase1 = getMarketRules('HK', '2026-07-27');
    const phase2 = getMarketRules('HK', '2026-08-03');
    expect(classic.id).toBe('HKEX-CASH-2023');
    expect(phase1.id).toBe('HKEX-SPREAD-PHASE-1-2025');
    expect(phase2.id).toBe('HKEX-SPREAD-PHASE-2-2026');
    expect(tickForPrice(hk, '15', classic)).toBe('0.02');
    expect(tickForPrice(hk, '15', phase1)).toBe('0.01');
    expect(tickForPrice(hk, '5', phase2)).toBe('0.005');
  });

  it('handles local sessions and midday closures', () => {
    const hkRules = getMarketRules('HK', '2026-07-27');
    expect(getSessionState(hkRules, '2026-07-27T02:00:00.000Z').phase).toBe('CONTINUOUS');
    expect(getSessionState(hkRules, '2026-07-27T04:30:00.000Z').phase).toBe('CLOSED');
    expect(getSessionState(hkRules, '2026-07-27T08:05:00.000Z').phase).toBe('CLOSE_AUCTION');
  });

  it('computes CN board-specific price bands from previous close', () => {
    const main = instrument('CN');
    const growth = instrument('CN', { chinaBoard: 'CHINEXT' });
    const rules = getMarketRules('CN', HK_CN_OPEN);
    expect(priceLimitRange(main, rules)).toMatchObject({ lower: '9', upper: '11', basisPoints: 1_000 });
    expect(priceLimitRange(growth, rules)).toMatchObject({ lower: '8', upper: '12', basisPoints: 2_000 });
  });

  it('estimates each market fee schedule using exact minor units', () => {
    const us = instrument('US');
    const hk = instrument('HK');
    const cn = instrument('CN');
    expect(estimateFees({
      instrument: us, rules: getMarketRules('US', US_OPEN), side: 'SELL', price: '10', quantity: 100,
    }).totalMinor).toBe('5');
    const hkFees = estimateFees({
      instrument: hk, rules: getMarketRules('HK', HK_CN_OPEN), side: 'BUY', price: '10', quantity: 100,
    });
    expect(hkFees.components.find((row) => row.code === 'HK_STAMP_DUTY')?.amountMinor).toBe('100');
    expect(hkFees.totalMinor).toBe('409');
    expect(estimateFees({
      instrument: cn, rules: getMarketRules('CN', HK_CN_OPEN), side: 'BUY', price: '10', quantity: 100,
    }).totalMinor).toBe('501');
  });
});

describe('deterministic synthetic market data', () => {
  it('replays identical bars and ticks for the same seed', () => {
    const target = instrument('US');
    const options = {
      instrument: target, startTime: US_OPEN, intervalMinutes: 5, count: 12,
      seed: 'replay-42', initialPrice: '100', tradingSessionsOnly: true,
    } as const;
    const first = generateSyntheticBars(options);
    const replay = generateSyntheticBars(options);
    const different = generateSyntheticBars({ ...options, seed: 'replay-43' });
    expect(replay).toEqual(first);
    expect(different).not.toEqual(first);
    for (const bar of first) {
      expect(compareDecimal(bar.high, bar.open)).toBeGreaterThanOrEqual(0);
      expect(compareDecimal(bar.high, bar.close)).toBeGreaterThanOrEqual(0);
      expect(compareDecimal(bar.low, bar.open)).toBeLessThanOrEqual(0);
      expect(compareDecimal(bar.low, bar.close)).toBeLessThanOrEqual(0);
    }
    expect(generateSyntheticTicks({
      instrument: target, startTime: US_OPEN, intervalMs: 1_000, count: 5,
      seed: 'ticks', initialPrice: '100', tradingSessionsOnly: true,
    })).toEqual(generateSyntheticTicks({
      instrument: target, startTime: US_OPEN, intervalMs: 1_000, count: 5,
      seed: 'ticks', initialPrice: '100', tradingSessionsOnly: true,
    }));
  });

  it('builds a wholly deterministic, three-market demo environment', () => {
    const first = createDemoEnvironment({ seed: 'demo', asOf: HK_CN_OPEN, barCount: 4 });
    const replay = createDemoEnvironment({ seed: 'demo', asOf: HK_CN_OPEN, barCount: 4 });
    expect(first).toEqual(replay);
    expect(new Set(first.instruments.map((item) => item.market))).toEqual(new Set(['US', 'HK', 'CN']));
    expect(Object.keys(first.quotes)).toHaveLength(first.instruments.length);
  });

  it('retains tick-level variation after a synthetic price serializes as an integer', () => {
    const environment = createDemoEnvironment();
    const nvda = environment.instruments.find((item) => item.symbol === 'NVDA');
    expect(nvda).toBeDefined();

    const tail = environment.bars[nvda!.id].slice(-42);
    const closes = tail.map((bar) => bar.close);
    const integerIndex = closes.findIndex((close) => !close.includes('.'));
    const replayCloses = createDemoEnvironment().bars[nvda!.id].slice(-42).map((bar) => bar.close);
    expect(replayCloses).toEqual(closes);
    expect(integerIndex).toBeGreaterThanOrEqual(0);
    expect(closes.slice(integerIndex + 1).some((close) => close.includes('.'))).toBe(true);
    expect(closes.some((close) => close.includes('.'))).toBe(true);
    expect(new Set(closes).size).toBeGreaterThan(30);
    for (const bar of tail) {
      const rules = getMarketRules(nvda!.market, bar.start);
      expect(isTickAligned(bar.close, tickForPrice(nvda!, bar.close, rules))).toBe(true);
    }
  });
});

describe('order validation', () => {
  it('rejects lot, tick, price-band, session, and buying-power violations', () => {
    const cn = instrument('CN');
    const cnQuote = quote(cn, HK_CN_OPEN, { bid: '9.99', ask: '10', last: '10' });
    const rules = getMarketRules('CN', HK_CN_OPEN);
    const base = { account: account(), instrument: cn, rules, at: HK_CN_OPEN, quote: cnQuote };
    expect(validateOrderRequest({
      instrumentId: cn.id, side: 'BUY', type: 'MARKET', quantity: 50, timeInForce: 'DAY',
    }, base).issues.map((row) => row.code)).toContain('LOT_SIZE');
    expect(validateOrderRequest({
      instrumentId: cn.id, side: 'BUY', type: 'LIMIT', quantity: 100, timeInForce: 'DAY', limitPrice: '10.005',
    }, base).issues.map((row) => row.code)).toContain('TICK_SIZE');
    expect(validateOrderRequest({
      instrumentId: cn.id, side: 'BUY', type: 'LIMIT', quantity: 100, timeInForce: 'DAY', limitPrice: '11.01',
    }, base).issues.map((row) => row.code)).toContain('PRICE_LIMIT');
    expect(validateOrderRequest({
      instrumentId: cn.id, side: 'BUY', type: 'MARKET', quantity: 100, timeInForce: 'DAY',
    }, { ...base, at: '2026-07-27T04:00:00.000Z' }).issues.map((row) => row.code)).toContain('MARKET_CLOSED');
    expect(validateOrderRequest({
      instrumentId: cn.id, side: 'BUY', type: 'MARKET', quantity: 100, timeInForce: 'DAY',
    }, { ...base, account: account({ CNY: '100' }) }).issues.map((row) => row.code)).toContain('INSUFFICIENT_BUYING_POWER');
  });
});

describe('deterministic order lifecycle and accounting', () => {
  it('partially fills a market order in price-time order and updates cash/position exactly', () => {
    const target = instrument('US');
    const engine = new SimulationEngine({ instruments: [target], account: account({ USD: '1000000' }) });
    const partial = engine.submit({
      clientOrderId: 'buy-1', instrumentId: target.id, side: 'BUY', type: 'MARKET',
      quantity: 10, timeInForce: 'DAY',
    }, { at: US_OPEN, quote: quote(target, US_OPEN, { ask: '100.01', askSize: 4 }) });
    expect(partial.status).toBe('PARTIALLY_FILLED');
    expect(partial.filledQuantity).toBe(4);
    expect(engine.snapshot().account.cash.USD.balanceMinor).toBe('959996');
    expect(engine.snapshot().reservations[partial.id].cashMinor).toBe('60006');

    engine.processQuote(quote(target, '2026-07-27T14:00:01.000Z', {
      ask: '100', bid: '99.99', last: '100', askSize: 6, sequence: 2,
    }));
    const filled = engine.getOrder(partial.id)!;
    const state = engine.snapshot();
    expect(filled.status).toBe('FILLED');
    expect(filled.averageFillPrice).toBe('100.004');
    expect(state.account.cash.USD.balanceMinor).toBe('899996');
    expect(state.account.positions[target.id]).toMatchObject({
      quantity: 10, availableQuantity: 10, costBasisMinor: '100004', averagePrice: '100.004',
    });
    expect(state.reservations[partial.id]).toBeUndefined();
    expect(state.events.map((event) => event.type)).toEqual([
      'SUBMITTED', 'ACCEPTED', 'PARTIALLY_FILLED', 'FILLED',
    ]);
  });

  it('holds, price-improves, and fills limit orders', () => {
    const target = instrument('US');
    const engine = new SimulationEngine({ instruments: [target], account: account() });
    const order = engine.submit({
      instrumentId: target.id, side: 'BUY', type: 'LIMIT', quantity: 2,
      timeInForce: 'GTC', limitPrice: '100',
    }, { at: US_OPEN, quote: quote(target, US_OPEN, { ask: '100.50' }) });
    expect(order.status).toBe('ACCEPTED');
    engine.processQuote(quote(target, '2026-07-27T14:00:02.000Z', { ask: '99.95', bid: '99.94', last: '99.95' }));
    expect(engine.getOrder(order.id)).toMatchObject({ status: 'FILLED', averageFillPrice: '99.95' });
  });

  it('triggers stop and stop-limit orders before applying their execution rule', () => {
    const target = instrument('US');
    const stopEngine = new SimulationEngine({ instruments: [target], account: account() });
    const stop = stopEngine.submit({
      instrumentId: target.id, side: 'BUY', type: 'STOP', quantity: 1,
      timeInForce: 'GTC', stopPrice: '101',
    }, { at: US_OPEN, quote: quote(target, US_OPEN, { ask: '100', last: '100' }) });
    expect(stop.status).toBe('ACCEPTED');
    stopEngine.processQuote(quote(target, '2026-07-27T14:01:00.000Z', { ask: '101.02', bid: '101.01', last: '101' }));
    expect(stopEngine.getOrder(stop.id)).toMatchObject({ status: 'FILLED', triggeredAt: '2026-07-27T14:01:00.000Z' });
    expect(stopEngine.snapshot().events.map((row) => row.type)).toContain('TRIGGERED');

    const limitEngine = new SimulationEngine({ instruments: [target], account: account() });
    const stopLimit = limitEngine.submit({
      instrumentId: target.id, side: 'BUY', type: 'STOP_LIMIT', quantity: 1,
      timeInForce: 'GTC', stopPrice: '101', limitPrice: '100.50',
    }, { at: US_OPEN, quote: quote(target, US_OPEN, { ask: '100', last: '100' }) });
    limitEngine.processQuote(quote(target, '2026-07-27T14:01:00.000Z', { ask: '101.02', bid: '101.01', last: '101' }));
    expect(limitEngine.getOrder(stopLimit.id)?.status).toBe('TRIGGERED');
    limitEngine.processQuote(quote(target, '2026-07-27T14:02:00.000Z', { ask: '100.40', bid: '100.39', last: '100.45' }));
    expect(limitEngine.getOrder(stopLimit.id)).toMatchObject({ status: 'FILLED', averageFillPrice: '100.4' });
  });

  it('releases reservations on cancellation and expires DAY orders', () => {
    const target = instrument('US');
    const engine = new SimulationEngine({ instruments: [target], account: account() });
    const order = engine.submit({
      instrumentId: target.id, side: 'BUY', type: 'LIMIT', quantity: 10,
      timeInForce: 'DAY', limitPrice: '90',
    }, { at: US_OPEN });
    expect(BigInt(engine.snapshot().account.cash.USD.reservedMinor)).toBeGreaterThan(0n);
    expect(engine.cancel(order.id, US_OPEN).status).toBe('CANCELLED');
    expect(engine.snapshot().account.cash.USD.reservedMinor).toBe('0');

    const expiring = engine.submit({
      instrumentId: target.id, side: 'BUY', type: 'LIMIT', quantity: 1,
      timeInForce: 'DAY', limitPrice: '90',
    }, { at: US_OPEN });
    expect(engine.expireDayOrders('2026-07-28T14:00:00.000Z').map((item) => item.id)).toEqual([expiring.id]);
    expect(engine.getOrder(expiring.id)?.status).toBe('EXPIRED');
  });

  it('enforces Mainland T+1 after a buy, then unlocks the lot next business day', () => {
    const target = instrument('CN');
    const engine = new SimulationEngine({ instruments: [target], account: account() });
    const buyQuote = quote(target, HK_CN_OPEN, { bid: '9.99', ask: '10', last: '10', bidSize: 100, askSize: 100 });
    const buy = engine.submit({
      instrumentId: target.id, side: 'BUY', type: 'MARKET', quantity: 100, timeInForce: 'DAY',
    }, { at: HK_CN_OPEN, quote: buyQuote });
    expect(buy.status).toBe('FILLED');
    expect(engine.snapshot().account.positions[target.id]).toMatchObject({ quantity: 100, availableQuantity: 0 });

    const sameDaySell = engine.submit({
      instrumentId: target.id, side: 'SELL', type: 'MARKET', quantity: 100, timeInForce: 'DAY',
    }, { at: '2026-07-27T02:01:00.000Z', quote: quote(target, '2026-07-27T02:01:00.000Z', { bid: '10', ask: '10.01', last: '10' }) });
    expect(sameDaySell).toMatchObject({ status: 'REJECTED', rejectionCode: 'T_PLUS_ONE' });

    const nextDay = '2026-07-28T02:00:00.000Z';
    engine.advance(nextDay);
    expect(engine.snapshot().account.positions[target.id].availableQuantity).toBe(100);
    const sell = engine.submit({
      instrumentId: target.id, side: 'SELL', type: 'MARKET', quantity: 100, timeInForce: 'DAY',
    }, { at: nextDay, quote: quote(target, nextDay, { bid: '10.10', ask: '10.11', last: '10.10', bidSize: 100 }) });
    expect(sell.status).toBe('FILLED');
    const finalState = engine.snapshot();
    expect(finalState.account.positions[target.id]).toMatchObject({
      quantity: 0, costBasisMinor: '0', averagePrice: '0', realizedPnlMinor: '-53',
    });
    expect(finalState.account.cash.CNY.balanceMinor).toBe('99999947');
    expect(finalState.account.realizedPnlMinorByCurrency.CNY).toBe('-53');
  });

  it('charges a transaction minimum only once across partial HK fills', () => {
    const target = instrument('HK');
    const engine = new SimulationEngine({ instruments: [target], account: account() });
    const partial = engine.submit({
      instrumentId: target.id, side: 'BUY', type: 'MARKET', quantity: 200, timeInForce: 'DAY',
    }, { at: HK_CN_OPEN, quote: quote(target, HK_CN_OPEN, {
      bid: '9.99', ask: '10', last: '10', bidSize: 100, askSize: 100,
    }) });
    expect(partial.status).toBe('PARTIALLY_FILLED');
    engine.processQuote(quote(target, '2026-07-27T02:00:01.000Z', {
      bid: '9.99', ask: '10', last: '10', bidSize: 100, askSize: 100,
    }));
    const fills = engine.snapshot().fills;
    expect(fills.map((fill) => fill.fees.totalMinor)).toEqual(['409', '107']);
    expect(fills.reduce((total, fill) => total + BigInt(fill.fees.totalMinor), 0n)).toBe(516n);
    expect(estimateFees({
      instrument: target, rules: getMarketRules('HK', HK_CN_OPEN), side: 'BUY', price: '10', quantity: 200,
    }).totalMinor).toBe('516');
  });

  it('shares quote liquidity in deterministic price-time priority', () => {
    const target = instrument('US');
    const engine = new SimulationEngine({ instruments: [target], account: account() });
    const first = engine.submit({
      instrumentId: target.id, side: 'BUY', type: 'LIMIT', quantity: 3,
      timeInForce: 'GTC', limitPrice: '100',
    }, { at: US_OPEN });
    const second = engine.submit({
      instrumentId: target.id, side: 'BUY', type: 'LIMIT', quantity: 3,
      timeInForce: 'GTC', limitPrice: '100',
    }, { at: '2026-07-27T14:00:00.001Z' });
    engine.processQuote(quote(target, '2026-07-27T14:00:01.000Z', {
      bid: '99.98', ask: '99.99', last: '99.99', askSize: 4,
    }));
    expect(engine.getOrder(first.id)).toMatchObject({ status: 'FILLED', filledQuantity: 3 });
    expect(engine.getOrder(second.id)).toMatchObject({ status: 'PARTIALLY_FILLED', filledQuantity: 1 });
  });

  it('round-trips a full persistent snapshot and continues deterministic sequencing', () => {
    const target = instrument('US');
    const engine = new SimulationEngine({ instruments: [target], account: account() });
    engine.submit({
      instrumentId: target.id, side: 'BUY', type: 'LIMIT', quantity: 1,
      timeInForce: 'GTC', limitPrice: '90',
    }, { at: US_OPEN });
    const snapshot = engine.snapshot();
    const restored = SimulationEngine.fromSnapshot([target], snapshot);
    expect(restored.snapshot()).toEqual(snapshot);
    const next = restored.submit({
      instrumentId: target.id, side: 'BUY', type: 'LIMIT', quantity: 1,
      timeInForce: 'GTC', limitPrice: '89',
    }, { at: '2026-07-27T14:01:00.000Z' });
    expect(next.sequence).toBeGreaterThan(snapshot.sequence);
    expect(Object.keys(restored.snapshot().orders)).toHaveLength(2);
  });
});
