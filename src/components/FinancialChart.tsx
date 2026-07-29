import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AreaSeries, CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, createSeriesMarkers, type IChartApi, type SeriesMarker, type UTCTimestamp } from 'lightweight-charts';
import { useAppStore } from '../app/store';
import { buildExponentialMovingAverage, buildSyntheticChartSeries } from './chartSeries';

interface FinancialChartProps {
  values: number[];
  height?: number;
  mode?: 'candles' | 'area';
  positive?: boolean;
  compact?: boolean;
  startOffset?: number;
  showEma?: boolean;
  positionMarker?: string;
  workingOrderMarker?: string;
}

export interface FinancialChartHandle {
  resetView: () => void;
}

type HoveredChartPoint = {
  x: number;
  y: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const priceFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const volumeFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const FinancialChart = forwardRef<FinancialChartHandle, FinancialChartProps>(function FinancialChart(
  { values, height = 360, mode = 'candles', positive = true, compact = false, startOffset = 0, showEma = false, positionMarker, workingOrderMarker },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredChartPoint | null>(null);
  const descriptionId = useId();
  const theme = useAppStore((state) => state.theme);
  const gainConvention = useAppStore((state) => state.gainConvention);

  const data = useMemo(() => buildSyntheticChartSeries(values, startOffset), [startOffset, values]);

  useImperativeHandle(ref, () => ({
    resetView: () => {
      chartRef.current?.timeScale().fitContent();
      setHoveredPoint(null);
    },
  }), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text-tertiary').trim();
    const gridColor = styles.getPropertyValue('--chart-grid').trim();
    const surface = styles.getPropertyValue('--surface-1').trim();
    const up = gainConvention === 'green-up' ? '#19c78b' : '#f05f70';
    const down = gainConvention === 'green-up' ? '#f05f70' : '#19c78b';
    const chart = createChart(containerRef.current, {
      height,
      width: containerRef.current.clientWidth,
      localization: {
        locale: 'en-US',
        priceFormatter: (value: number) => priceFormatter.format(value),
      },
      layout: { background: { type: ColorType.Solid, color: surface }, textColor, fontFamily: 'DM Sans, ui-sans-serif, system-ui', fontSize: 11 },
      grid: { vertLines: { color: compact ? 'transparent' : gridColor }, horzLines: { color: compact ? 'transparent' : gridColor } },
      crosshair: { vertLine: { color: '#6c8fdc80', width: 1, labelBackgroundColor: '#315da8' }, horzLine: { color: '#6c8fdc80', width: 1, labelBackgroundColor: '#315da8' } },
      rightPriceScale: { visible: !compact, borderColor: gridColor, scaleMargins: { top: .12, bottom: mode === 'candles' ? .23 : .14 } },
      timeScale: { visible: !compact, borderColor: gridColor, timeVisible: true, secondsVisible: false, rightOffset: positionMarker || workingOrderMarker ? 8 : 2, barSpacing: compact ? 3 : 9, fixLeftEdge: true },
      handleScroll: !compact,
      handleScale: !compact,
    });
    chartRef.current = chart;

    const latestTime = data.candles.at(-1)?.time;
    const markers: SeriesMarker<UTCTimestamp>[] = latestTime ? [
      ...(positionMarker ? [{ time: latestTime, position: 'belowBar' as const, color: '#78a2f4', shape: 'arrowUp' as const, text: positionMarker }] : []),
      ...(workingOrderMarker ? [{ time: latestTime, position: 'aboveBar' as const, color: '#e0a35b', shape: 'square' as const, text: workingOrderMarker }] : []),
    ] : [];

    if (mode === 'candles') {
      const candles = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: true, lastValueVisible: true });
      candles.setData(data.candles);
      if (markers.length) createSeriesMarkers(candles, markers, { zOrder: 'top' });
      const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '', color: '#6987bd42', lastValueVisible: false, priceLineVisible: false });
      volume.priceScale().applyOptions({ scaleMargins: { top: .83, bottom: 0 } });
      volume.setData(data.candles.map((item, index) => ({ time: item.time, value: data.volumes[index], color: item.close >= item.open ? `${up}45` : `${down}45` })));
    } else {
      const line = positive ? up : down;
      const area = chart.addSeries(AreaSeries, { lineColor: line, lineWidth: 2, topColor: `${line}40`, bottomColor: `${line}00`, priceLineVisible: false, lastValueVisible: !compact });
      area.setData(data.candles.map((item) => ({ time: item.time, value: item.close })));
      if (markers.length) createSeriesMarkers(area, markers, { zOrder: 'top' });
    }
    if (showEma && !compact) {
      const ema = chart.addSeries(LineSeries, { color: '#d7a05f', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'EMA 20', crosshairMarkerVisible: false });
      ema.setData(buildExponentialMovingAverage(data.candles, 20));
    }
    chart.timeScale().fitContent();

    const indexByTime = new Map(data.candles.map((item, index) => [Number(item.time), index]));
    const handleCrosshairMove: Parameters<IChartApi['subscribeCrosshairMove']>[0] = (event) => {
      const index = typeof event.time === 'number' ? indexByTime.get(event.time) : undefined;
      const candle = index === undefined ? undefined : data.candles[index];
      if (!event.point || !candle || index === undefined || !containerRef.current) {
        setHoveredPoint(null);
        return;
      }
      const chartWidth = containerRef.current.clientWidth;
      const chartHeight = containerRef.current.clientHeight || height;
      const cardWidth = 166;
      const x = event.point.x + cardWidth + 22 > chartWidth
        ? Math.max(8, event.point.x - cardWidth - 12)
        : event.point.x + 12;
      setHoveredPoint({
        x,
        y: Math.max(8, Math.min(event.point.y - 18, chartHeight - 136)),
        date: dateFormatter.format(new Date(Number(candle.time) * 1000)),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: data.volumes[index] ?? 0,
      });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) chart.applyOptions({ width: Math.floor(entry.contentRect.width) });
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [compact, data, gainConvention, height, mode, positive, positionMarker, showEma, theme, workingOrderMarker]);

  return (
    <figure className="financial-chart" style={{ height }} aria-labelledby={descriptionId}>
      <figcaption className="sr-only" id={descriptionId}>Interactive synthetic daily price chart. Drag to pan and use the mouse wheel or pinch gesture to zoom.</figcaption>
      <div ref={containerRef} className="financial-chart-canvas" />
      {!compact && <div className="chart-gesture-hint" aria-hidden="true">Drag to pan <i /> Wheel / pinch to zoom</div>}
      {!compact && hoveredPoint && (
        <div className="chart-crosshair-card" style={{ transform: `translate(${hoveredPoint.x}px, ${hoveredPoint.y}px)` }} aria-hidden="true">
          <strong><span>INSPECT</span>{hoveredPoint.date}</strong>
          <div><span>Open</span><b>{priceFormatter.format(hoveredPoint.open)}</b></div>
          <div><span>High</span><b>{priceFormatter.format(hoveredPoint.high)}</b></div>
          <div><span>Low</span><b>{priceFormatter.format(hoveredPoint.low)}</b></div>
          <div><span>Close</span><b>{priceFormatter.format(hoveredPoint.close)}</b></div>
          <div className="chart-crosshair-volume"><span>Est. volume</span><b>{volumeFormatter.format(hoveredPoint.volume)}</b></div>
        </div>
      )}
    </figure>
  );
});
