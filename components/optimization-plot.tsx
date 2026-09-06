'use client';

import { useEffect, useRef, useState } from 'react';
import type { Objective, OptimizationResult, Point } from '@/lib/optimization';

export type PlotView = {
  x: [number, number];
  y: [number, number];
};

const OPTIMIZER_COLORS: Record<string, string> = {
  gd: '#ef4444',
  momentum: '#facc15',
  adam: '#2563eb',
  newton: '#16a34a',
  bfgs: '#9333ea',
};

const HEAT_STOPS = [
  '#f8fcff',
  '#dff3fa',
  '#b9e2ee',
  '#7bc4d8',
  '#4f8fc0',
  '#5b4aa8',
];

const SURFACE_MARGIN = { left: 54, right: 20, top: 20, bottom: 48 };

export function getDisplaySpan(result: OptimizationResult) {
  return Math.max(1, result.trajectory.length - 1);
}

export function getVisibleStep(
  result: OptimizationResult,
  animationTick: number,
  showAll: boolean,
) {
  if (showAll) return result.trajectory.length - 1;
  return Math.min(
    Math.max(0, animationTick),
    Math.max(0, result.trajectory.length - 1),
  );
}

function visibleTrajectory(
  result: OptimizationResult,
  animationTick: number,
  showAll: boolean,
) {
  const exactStep = getVisibleStep(result, animationTick, showAll);
  const wholeStep = Math.floor(exactStep);
  const points = result.trajectory.slice(0, wholeStep + 1);
  const fraction = exactStep - wholeStep;
  const current = result.trajectory[wholeStep];
  const next = result.trajectory[wholeStep + 1];
  if (fraction > 0 && current && next) {
    points.push([
      current[0] + (next[0] - current[0]) * fraction,
      current[1] + (next[1] - current[1]) * fraction,
    ]);
  }
  return points;
}

function useCanvasSize(ref: React.RefObject<HTMLCanvasElement | null>) {
  const [size, setSize] = useState({ width: 640, height: 640 });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(320, entry.contentRect.height),
      });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
}

function hexToRgb(hex: string) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function heatColor(value: number) {
  const scaled = Math.max(0, Math.min(0.9999, value)) * (HEAT_STOPS.length - 1);
  const index = Math.floor(scaled);
  const amount = scaled - index;
  const first = hexToRgb(HEAT_STOPS[index]);
  const second = hexToRgb(
    HEAT_STOPS[Math.min(index + 1, HEAT_STOPS.length - 1)],
  );
  return `rgb(${first.map((channel, channelIndex) => Math.round(channel + (second[channelIndex] - channel) * amount)).join(' ')})`;
}

function clampView(view: PlotView, bounds: PlotView): PlotView {
  const clampAxis = (
    axis: [number, number],
    bound: [number, number],
  ): [number, number] => {
    const span = Math.min(axis[1] - axis[0], bound[1] - bound[0]);
    let lower = axis[0];
    if (lower < bound[0]) lower = bound[0];
    if (lower + span > bound[1]) lower = bound[1] - span;
    return [lower, lower + span];
  };
  return {
    x: clampAxis(view.x, bounds.x),
    y: clampAxis(view.y, bounds.y),
  };
}

type SurfaceProps = {
  objective: Objective;
  results: OptimizationResult[];
  start: Point;
  animationTick: number;
  showAll: boolean;
  interactive?: boolean;
  view?: PlotView;
  onViewChange?: (view: PlotView) => void;
  onStartChange?: (point: Point) => void;
  ariaLabel?: string;
};

export function SurfacePlot({
  objective,
  results,
  start,
  animationTick,
  showAll,
  interactive = true,
  view = objective.range,
  onViewChange,
  onStartChange,
  ariaLabel,
}: SurfaceProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(ref);
  const margin = SURFACE_MARGIN;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = prepareCanvas(canvas, size.width, size.height);
    if (!context) return;
    const plotWidth = size.width - margin.left - margin.right;
    const plotHeight = size.height - margin.top - margin.bottom;
    const mapPoint = ([x, y]: Point): Point => [
      margin.left + ((x - view.x[0]) / (view.x[1] - view.x[0])) * plotWidth,
      margin.top + (1 - (y - view.y[0]) / (view.y[1] - view.y[0])) * plotHeight,
    ];
    const columns = 92;
    const rows = 92;
    const values: number[][] = [];
    const flat: number[] = [];

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);

    for (let row = 0; row <= rows; row += 1) {
      const rowValues: number[] = [];
      for (let column = 0; column <= columns; column += 1) {
        const x = view.x[0] + (column / columns) * (view.x[1] - view.x[0]);
        const y = view.y[1] - (row / rows) * (view.y[1] - view.y[0]);
        const value = Math.log1p(Math.max(0, objective.value([x, y])));
        rowValues.push(value);
        flat.push(value);
      }
      values.push(rowValues);
    }
    const ordered = [...flat].sort((a, b) => a - b);
    const lower = ordered[Math.floor(ordered.length * 0.015)] ?? 0;
    const upper = ordered[Math.floor(ordered.length * 0.9)] ?? 1;
    const normalized = values.map((row) =>
      row.map((value) =>
        Math.max(
          0,
          Math.min(1, (value - lower) / Math.max(1e-9, upper - lower)),
        ),
      ),
    );

    const cellWidth = plotWidth / columns;
    const cellHeight = plotHeight / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        context.fillStyle = heatColor(normalized[row][column]);
        context.fillRect(
          margin.left + column * cellWidth,
          margin.top + row * cellHeight,
          cellWidth + 1,
          cellHeight + 1,
        );
      }
    }

    context.lineWidth = 0.9;
    for (let levelIndex = 1; levelIndex <= 10; levelIndex += 1) {
      const threshold = levelIndex / 11;
      context.strokeStyle = `rgba(30, 64, 175, ${0.16 + levelIndex * 0.012})`;
      context.beginPath();
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const corners = [
            normalized[row][column],
            normalized[row][column + 1],
            normalized[row + 1][column + 1],
            normalized[row + 1][column],
          ];
          const cornerPoints: Point[] = [
            [column, row],
            [column + 1, row],
            [column + 1, row + 1],
            [column, row + 1],
          ];
          const intersections: Point[] = [];
          for (let edge = 0; edge < 4; edge += 1) {
            const nextEdge = (edge + 1) % 4;
            const a = corners[edge];
            const b = corners[nextEdge];
            if (
              (a < threshold && b >= threshold) ||
              (a >= threshold && b < threshold)
            ) {
              const t = (threshold - a) / (b - a);
              intersections.push([
                cornerPoints[edge][0] +
                  (cornerPoints[nextEdge][0] - cornerPoints[edge][0]) * t,
                cornerPoints[edge][1] +
                  (cornerPoints[nextEdge][1] - cornerPoints[edge][1]) * t,
              ]);
            }
          }
          for (let index = 0; index + 1 < intersections.length; index += 2) {
            context.moveTo(
              margin.left + intersections[index][0] * cellWidth,
              margin.top + intersections[index][1] * cellHeight,
            );
            context.lineTo(
              margin.left + intersections[index + 1][0] * cellWidth,
              margin.top + intersections[index + 1][1] * cellHeight,
            );
          }
        }
      }
      context.stroke();
    }

    context.font = '11px ui-monospace, SFMono-Regular, monospace';
    context.fillStyle = '#475569';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (
      let value = Math.ceil(view.x[0]);
      value <= Math.floor(view.x[1]);
      value += 1
    ) {
      const [x] = mapPoint([value, 0]);
      context.strokeStyle =
        value === 0 ? 'rgba(15, 23, 42, .65)' : 'rgba(71, 85, 105, .18)';
      context.lineWidth = value === 0 ? 1.5 : 0.75;
      context.beginPath();
      context.moveTo(x, margin.top);
      context.lineTo(x, margin.top + plotHeight);
      context.stroke();
      context.fillText(String(value), x, margin.top + plotHeight + 10);
    }
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (
      let value = Math.ceil(view.y[0]);
      value <= Math.floor(view.y[1]);
      value += 1
    ) {
      const [, y] = mapPoint([0, value]);
      context.strokeStyle =
        value === 0 ? 'rgba(15, 23, 42, .65)' : 'rgba(71, 85, 105, .18)';
      context.lineWidth = value === 0 ? 1.5 : 0.75;
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(margin.left + plotWidth, y);
      context.stroke();
      context.fillText(String(value), margin.left - 10, y);
    }

    context.strokeStyle = '#334155';
    context.lineWidth = 1.25;
    context.strokeRect(margin.left, margin.top, plotWidth, plotHeight);
    context.fillStyle = '#0f172a';
    context.font = 'italic 13px ui-serif, Georgia, serif';
    context.textAlign = 'right';
    context.textBaseline = 'bottom';
    context.fillText('x₁', margin.left + plotWidth, size.height - 4);
    context.save();
    context.translate(14, margin.top);
    context.rotate(-Math.PI / 2);
    context.textAlign = 'right';
    context.fillText('x₂', 0, 0);
    context.restore();

    context.save();
    context.beginPath();
    context.rect(margin.left, margin.top, plotWidth, plotHeight);
    context.clip();
    objective.minima.forEach((minimum) => {
      const [x, y] = mapPoint(minimum);
      context.fillStyle = '#f8fafc';
      context.strokeStyle = '#b45309';
      context.lineWidth = 2.25;
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.strokeStyle = 'rgba(180, 83, 9, .35)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(x, y, 10, 0, Math.PI * 2);
      context.stroke();
    });

    results.forEach((result) => {
      const points = visibleTrajectory(result, animationTick, showAll);
      if (points.length < 1) return;
      context.strokeStyle = OPTIMIZER_COLORS[result.optimizer];
      context.lineWidth = 2.1;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.globalAlpha = 0.88;
      context.beginPath();
      points.forEach((point, index) => {
        const [x, y] = mapPoint(point);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.globalAlpha = 1;
      const current = points.at(-1) ?? result.trajectory[0];
      const [x, y] = mapPoint(current);
      context.fillStyle = OPTIMIZER_COLORS[result.optimizer];
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 5.5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
    const [startX, startY] = mapPoint(start);
    context.fillStyle = '#0f172a';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(startX, startY, 6.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }, [
    objective,
    results,
    start,
    animationTick,
    showAll,
    size,
    view,
    margin.left,
    margin.right,
    margin.top,
    margin.bottom,
  ]);

  const setPointFromPixels = (pixelX: number, pixelY: number) => {
    if (!interactive || !onStartChange) return;
    const plotWidth = size.width - margin.left - margin.right;
    const plotHeight = size.height - margin.top - margin.bottom;
    const clampedX = Math.max(
      margin.left,
      Math.min(size.width - margin.right, pixelX),
    );
    const clampedY = Math.max(
      margin.top,
      Math.min(size.height - margin.bottom, pixelY),
    );
    const x =
      view.x[0] +
      ((clampedX - margin.left) / plotWidth) * (view.x[1] - view.x[0]);
    const y =
      view.y[1] -
      ((clampedY - margin.top) / plotHeight) * (view.y[1] - view.y[0]);
    onStartChange([Number(x.toFixed(2)), Number(y.toFixed(2))]);
  };

  return (
    <canvas
      ref={ref}
      className={`aspect-square h-auto w-full rounded-2xl border border-slate-200 bg-white outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${interactive ? 'cursor-crosshair' : 'cursor-default'}`}
      aria-label={
        ariaLabel ??
        (interactive
          ? 'Loss surface heatmap. Click to set the starting point and hold Control while using the mouse wheel to zoom.'
          : 'Loss surface heatmap with animated optimizer trajectories.')
      }
      tabIndex={interactive ? 0 : -1}
      onPointerDown={(event) =>
        setPointFromPixels(event.nativeEvent.offsetX, event.nativeEvent.offsetY)
      }
      onWheel={(event) => {
        if (!interactive || !onViewChange || !event.ctrlKey) return;
        event.preventDefault();
        const plotWidth = size.width - margin.left - margin.right;
        const plotHeight = size.height - margin.top - margin.bottom;
        const px = Math.max(
          0,
          Math.min(1, (event.nativeEvent.offsetX - margin.left) / plotWidth),
        );
        const py = Math.max(
          0,
          Math.min(1, (event.nativeEvent.offsetY - margin.top) / plotHeight),
        );
        const focusX = view.x[0] + px * (view.x[1] - view.x[0]);
        const focusY = view.y[1] - py * (view.y[1] - view.y[0]);
        const factor = event.deltaY < 0 ? 0.82 : 1.22;
        const fullSpan = objective.range.x[1] - objective.range.x[0];
        const nextSpan = Math.max(
          2,
          Math.min(fullSpan, (view.x[1] - view.x[0]) * factor),
        );
        const candidate: PlotView = {
          x: [focusX - px * nextSpan, focusX + (1 - px) * nextSpan],
          y: [focusY - (1 - py) * nextSpan, focusY + py * nextSpan],
        };
        onViewChange(clampView(candidate, objective.range));
      }}
      onKeyDown={(event) => {
        if (!interactive || !onStartChange) return;
        const step = 0.1;
        let next: Point | null = null;
        if (event.key === 'ArrowLeft') next = [start[0] - step, start[1]];
        if (event.key === 'ArrowRight') next = [start[0] + step, start[1]];
        if (event.key === 'ArrowUp') next = [start[0], start[1] + step];
        if (event.key === 'ArrowDown') next = [start[0], start[1] - step];
        if (!next) return;
        onStartChange([
          Math.max(
            objective.range.x[0],
            Math.min(objective.range.x[1], next[0]),
          ),
          Math.max(
            objective.range.y[0],
            Math.min(objective.range.y[1], next[1]),
          ),
        ]);
        event.preventDefault();
      }}
    />
  );
}

type LossProps = {
  results: OptimizationResult[];
  animationTick: number;
  showAll: boolean;
  logScale: boolean;
  ariaLabel?: string;
};

export function LossPlot({
  results,
  animationTick,
  showAll,
  logScale,
  ariaLabel,
}: LossProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(ref);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = prepareCanvas(canvas, size.width, size.height);
    if (!context) return;
    const margin = { left: 62, right: 20, top: 20, bottom: 40 };
    const width = size.width - margin.left - margin.right;
    const height = size.height - margin.top - margin.bottom;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    const maxIterations = Math.max(
      1,
      ...results.map((result) => result.losses.length - 1),
    );
    const allValues = results.flatMap((result) =>
      result.losses
        .filter(Number.isFinite)
        .map((value) =>
          logScale ? Math.log10(Math.max(value, 1e-12)) : value,
        ),
    );
    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues, 1);
    const min = logScale ? rawMin : 0;
    const max = rawMax === min ? min + 1 : rawMax;
    const xFor = (index: number) =>
      margin.left + (index / maxIterations) * width;
    const yFor = (value: number) =>
      margin.top + (1 - (value - min) / (max - min)) * height;

    context.strokeStyle = 'rgba(71, 85, 105, .18)';
    context.fillStyle = '#475569';
    context.font = '10px ui-monospace, SFMono-Regular, monospace';
    for (let index = 0; index <= 4; index += 1) {
      const y = margin.top + (index / 4) * height;
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(margin.left + width, y);
      context.stroke();
      const labelValue = max - (index / 4) * (max - min);
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillText(
        logScale ? `10^${labelValue.toFixed(1)}` : labelValue.toExponential(1),
        margin.left - 8,
        y,
      );
    }
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (let index = 0; index <= 4; index += 1) {
      const x = margin.left + (index / 4) * width;
      context.fillText(
        String(Math.round((index / 4) * maxIterations)),
        x,
        margin.top + height + 10,
      );
    }
    context.strokeStyle = '#334155';
    context.lineWidth = 1.2;
    context.strokeRect(margin.left, margin.top, width, height);

    results.forEach((result) => {
      const exactStep = getVisibleStep(result, animationTick, showAll);
      const wholeStep = Math.floor(exactStep);
      const visibleLosses = result.losses.slice(0, wholeStep + 1);
      const fraction = exactStep - wholeStep;
      const currentLoss = result.losses[wholeStep];
      const nextLoss = result.losses[wholeStep + 1];
      if (fraction > 0 && currentLoss !== undefined && nextLoss !== undefined) {
        visibleLosses.push(currentLoss + (nextLoss - currentLoss) * fraction);
      }
      context.strokeStyle = OPTIMIZER_COLORS[result.optimizer];
      context.lineWidth = 2.3;
      context.beginPath();
      visibleLosses.forEach((loss, index) => {
        const transformed = logScale ? Math.log10(Math.max(loss, 1e-12)) : loss;
        const plottedStep =
          fraction > 0 && index === visibleLosses.length - 1
            ? exactStep
            : index;
        const x = xFor(plottedStep);
        const y = yFor(transformed);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    });
  }, [results, animationTick, showAll, logScale, size]);

  return (
    <canvas
      ref={ref}
      className="h-[250px] w-full rounded-2xl border border-slate-200 bg-white"
      aria-label={ariaLabel ?? 'Loss versus iteration chart'}
    />
  );
}

export { OPTIMIZER_COLORS };
