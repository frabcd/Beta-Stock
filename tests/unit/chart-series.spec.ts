import { describe, expect, it } from 'vitest';
import { buildExponentialMovingAverage, buildSyntheticChartSeries } from '../../src/components/chartSeries';

describe('synthetic display chart series', () => {
  it('keeps OHLC, dates, and estimated volume deterministic and internally aligned', () => {
    const values = [171, 171.35, 170.92, 172.1, 171.88];
    const first = buildSyntheticChartSeries(values, 37);
    const replay = buildSyntheticChartSeries(values, 37);

    expect(replay).toEqual(first);
    expect(first.candles).toHaveLength(values.length);
    expect(first.volumes).toHaveLength(values.length);
    expect(first.candles.at(-1)?.close).toBe(values.at(-1));
    expect(first.candles[1].open).toBe(values[0]);
    expect(Number(first.candles[1].time) - Number(first.candles[0].time)).toBe(86_400);
    expect(new Set(first.volumes).size).toBeGreaterThan(3);
    expect(first.volumes.every((volume) => Number.isSafeInteger(volume) && volume > 0)).toBe(true);
  });

  it('derives a deterministic EMA from the visible synthetic closes', () => {
    const series = buildSyntheticChartSeries([100, 102, 101, 105], 4);
    const ema = buildExponentialMovingAverage(series.candles, 3);

    expect(ema).toEqual([
      { time: series.candles[0].time, value: 100 },
      { time: series.candles[1].time, value: 101 },
      { time: series.candles[2].time, value: 101 },
      { time: series.candles[3].time, value: 103 },
    ]);
    expect(() => buildExponentialMovingAverage(series.candles, 1)).toThrow(/period/i);
  });
});
