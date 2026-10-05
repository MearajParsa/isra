import React, { useState } from 'react';
import { toPersianDigits, formatNumber } from '@/lib/format';

export interface BarDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  data: BarDataPoint[];
  height?: number;
  barColor?: string;
  unit?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  height = 200,
  barColor = '#6E56CF',
  unit = '',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-xs text-slate-400">داده‌ای موجود نیست</div>;
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const width = 600;
  const paddingBottom = 30;
  const paddingTop = 20;
  const paddingX = 20;
  const chartH = height - paddingBottom - paddingTop;
  const availableW = width - paddingX * 2;
  const barWidth = Math.min(36, Math.max(12, (availableW / data.length) * 0.55));
  const slotW = availableW / data.length;

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        role="img"
        aria-label="نمودار میله‌ای"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
      >
        {/* Baseline */}
        <line
          x1={paddingX}
          y1={height - paddingBottom}
          x2={width - paddingX}
          y2={height - paddingBottom}
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
          strokeWidth="1"
        />

        {data.map((d, i) => {
          const barH = (d.value / maxVal) * chartH;
          const x = paddingX + i * slotW + (slotW - barWidth) / 2;
          const y = height - paddingBottom - barH;
          const isHovered = hoveredIdx === i;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 3)}
                rx={barWidth / 3}
                fill={d.color || barColor}
                opacity={isHovered ? 1 : 0.85}
                className="transition-all duration-150 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${formatNumber(d.value)} ${unit}`}
                onFocus={() => setHoveredIdx(i)}
                onBlur={() => setHoveredIdx(null)}
              />
              <text
                x={x + barWidth / 2}
                y={height - 10}
                textAnchor="middle"
                className="text-[10px] fill-slate-400 font-medium"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div
          className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs shadow-xl"
          style={{
            left: `${((paddingX + hoveredIdx * slotW + slotW / 2) / width) * 100}%`,
            top: `${((height - paddingBottom - (data[hoveredIdx]!.value / maxVal) * chartH) / height) * 100}%`,
            marginTop: '-6px',
          }}
        >
          <div className="font-semibold text-slate-300">{data[hoveredIdx]!.label}</div>
          <div className="font-bold text-white">
            {formatNumber(data[hoveredIdx]!.value)} {unit}
          </div>
        </div>
      )}
    </div>
  );
};
