import type { UTCTimestamp } from 'lightweight-charts';

export type SyntheticChartCandle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

function syntheticFallbackVolumes(data: readonly {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}[]): number[] {
  const largestBody = data.reduce(
    (largest, item) => Math.max(largest, Math.abs(item.close - item.open)),
    0,
  );
  return data.map((item, index) => {
    // Stable integer mixing avoids the visibly linear placeholder pattern. Body size
    // and body-to-range share supply a plausible intensity relationship while this
    // remains explicitly synthetic display data, never reported exchange volume.
    let texture = Math.imul(index + 1, 0x45d9f3b) >>> 0;
    texture = (texture ^ (texture >>> 16)) >>> 0;
    texture = Math.imul(texture, 0x45d9f3b) >>> 0;
    texture = (texture ^ (texture >>> 16)) >>> 0;
    const textureUnit = texture / 0x1_0000_0000;
    const body = Math.abs(item.close - item.open);
    const range = Math.max(0, item.high - item.low);
    const normalizedBody = largestBody > 0 ? body / largestBody : 0;
    const bodyShare = range > 0 ? body / range : 0;
    return Math.round(1_600_000 + textureUnit * 2_400_000 + normalizedBody * 2_800_000 + bodyShare * 600_000);
  });
}

export function buildSyntheticChartSeries(values: readonly number[], startOffset = 0): {
  candles: SyntheticChartCandle[];
  volumes: number[];
} {
  const candles = values.map((close, index) => {
    const open = index === 0 ? close * .995 : values[index - 1];
    const spread = Math.max(close * .003, Math.abs(close - open) * .38);
    return {
      time: (Date.UTC(2026, 4, 1 + startOffset + index) / 1000) as UTCTimestamp,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread * .82,
      close,
    };
  });
  return { candles, volumes: syntheticFallbackVolumes(candles) };
}

export function buildExponentialMovingAverage(
  candles: readonly SyntheticChartCandle[],
  period = 20,
): Array<{ time: UTCTimestamp; value: number }> {
  if (!Number.isInteger(period) || period < 2) throw new RangeError('EMA period must be an integer of at least 2.');
  if (!candles.length) return [];
  const alpha = 2 / (period + 1);
  let value = candles[0].close;
  return candles.map((candle, index) => {
    if (index > 0) value = candle.close * alpha + value * (1 - alpha);
    return { time: candle.time, value: Number(value.toFixed(4)) };
  });
}
