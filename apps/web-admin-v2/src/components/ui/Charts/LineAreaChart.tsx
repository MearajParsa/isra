import React, { useState, useId } from 'react';
import { Table as TableIcon, LineChart as ChartIcon } from 'lucide-react';
import { toPersianDigits, formatNumber } from '@/lib/format';

export interface DataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface LineAreaChartProps {
  data: DataPoint[];
  title?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  height?: number;
}

export const LineAreaChart: React.FC<LineAreaChartProps> = ({
  data,
  title = 'نمودار روند',
  primaryLabel = 'مقدار اصلی',
  secondaryLabel,
  primaryColor = '#6E56CF',
  secondaryColor = '#10B981',
  height = 240,
}) => {
  const [showTable, setShowTable] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chartId = useId();

  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-slate-400">
        داده‌ای برای نمایش نمودار وجود ندارد
      </div>
    );
  }

  const values = data.map((d) => d.value);
  if (secondaryLabel) {
    values.push(...data.map((d) => d.secondaryValue || 0));
  }
  const maxVal = Math.max(...values, 10);
  const minVal = 0;

  const width = 640;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const getX = (index: number) => {
    if (data.length <= 1) return paddingLeft + chartW / 2;
    return paddingLeft + (index / (data.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    return paddingTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
  };

  // Build SVG path
  const primaryPoints = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');
  const primaryAreaPath =
    data.length > 0
      ? `M ${getX(0)},${paddingTop + chartH} L ${data
          .map((d, i) => `${getX(i)},${getY(d.value)}`)
          .join(' L ')} L ${getX(data.length - 1)},${paddingTop + chartH} Z`
      : '';

  const secondaryPoints = secondaryLabel
    ? data.map((d, i) => `${getX(i)},${getY(d.secondaryValue || 0)}`).join(' ')
    : '';

  const ariaSummary = `${title}: از ${data[0]?.label} تا ${data[data.length - 1]?.label} با بیشینه ${formatNumber(
    maxVal
  )}`;

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
            <span className="text-slate-700 dark:text-slate-300 font-medium">{primaryLabel}</span>
          </div>
          {secondaryLabel && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: secondaryColor }} />
              <span className="text-slate-700 dark:text-slate-300 font-medium">{secondaryLabel}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {showTable ? <ChartIcon className="w-3.5 h-3.5" /> : <TableIcon className="w-3.5 h-3.5" />}
          <span>{showTable ? 'نمایش نمودار' : 'نمایش جدول داده'}</span>
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto max-h-60 rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2 text-start">زمان / برچسب</th>
                <th className="px-3 py-2 text-start">{primaryLabel}</th>
                {secondaryLabel && <th className="px-3 py-2 text-start">{secondaryLabel}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.label}</td>
                  <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">{formatNumber(row.value)}</td>
                  {secondaryLabel && (
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {formatNumber(row.secondaryValue || 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative w-full overflow-hidden">
          <svg
            role="img"
            aria-label={ariaSummary}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible select-none"
          >
            <defs>
              <linearGradient id={`${chartId}-grad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primaryColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={primaryColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid horizontal lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = paddingTop + chartH * (1 - ratio);
              const val = Math.round(minVal + ratio * (maxVal - minVal));
              return (
                <g key={i}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="text-[10px] fill-slate-400 font-mono"
                  >
                    {toPersianDigits(val)}
                  </text>
                </g>
              );
            })}

            {/* Primary Area Fill */}
            <path d={primaryAreaPath} fill={`url(#${chartId}-grad)`} />

            {/* Secondary Line */}
            {secondaryLabel && (
              <polyline
                fill="none"
                stroke={secondaryColor}
                strokeWidth="2"
                strokeDasharray="4 2"
                points={secondaryPoints}
              />
            )}

            {/* Primary Line */}
            <polyline fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={primaryPoints} />

            {/* Interactive Points */}
            {data.map((d, i) => {
              const cx = getX(i);
              const cy = getY(d.value);
              const isHovered = hoveredIndex === i;

              return (
                <g key={i}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 5.5 : 3.5}
                    fill={isHovered ? '#FFFFFF' : primaryColor}
                    stroke={primaryColor}
                    strokeWidth={isHovered ? 3 : 1.5}
                    tabIndex={0}
                    role="button"
                    aria-label={`${d.label}: ${formatNumber(d.value)}`}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onFocus={() => setHoveredIndex(i)}
                    onBlur={() => setHoveredIndex(null)}
                    className="cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {/* Bottom x-axis label for selected or periodic points */}
                  {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
                    <text
                      x={cx}
                      y={height - 8}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-400 font-medium"
                    >
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Floating Hover Tooltip */}
          {hoveredIndex !== null && data[hoveredIndex] && (
            <div
              className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full px-3 py-2 rounded-xl bg-slate-900 text-white text-xs shadow-xl space-y-1"
              style={{
                left: `${(getX(hoveredIndex) / width) * 100}%`,
                top: `${(getY(data[hoveredIndex]!.value) / height) * 100}%`,
                marginTop: '-8px',
              }}
            >
              <div className="font-semibold text-slate-300">{data[hoveredIndex]!.label}</div>
              <div className="flex items-center gap-2">
                <span>{primaryLabel}:</span>
                <span className="font-bold text-indigo-300">{formatNumber(data[hoveredIndex]!.value)}</span>
              </div>
              {secondaryLabel && (
                <div className="flex items-center gap-2">
                  <span>{secondaryLabel}:</span>
                  <span className="font-bold text-emerald-300">
                    {formatNumber(data[hoveredIndex]!.secondaryValue || 0)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
