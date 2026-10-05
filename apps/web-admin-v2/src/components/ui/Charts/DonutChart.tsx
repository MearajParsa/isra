import React from 'react';
import { toPersianDigits, formatNumber } from '@/lib/format';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  slices,
  size = 180,
  strokeWidth = 24,
  centerLabel,
  centerValue,
}) => {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90 select-none">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-100 dark:text-slate-800"
          />

          {total > 0 &&
            slices.map((slice, i) => {
              const percent = slice.value / total;
              const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`;
              const strokeDashoffset = -circumference * accumulatedPercent;
              accumulatedPercent += percent;

              return (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-300"
                />
              );
            })}
        </svg>

        {/* Center Text */}
        {(centerLabel || centerValue !== undefined) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            {centerValue !== undefined && (
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {typeof centerValue === 'number' ? formatNumber(centerValue) : centerValue}
              </span>
            )}
            {centerLabel && <span className="text-[10px] text-slate-400 mt-0.5">{centerLabel}</span>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="space-y-2 text-start">
        {slices.map((slice, i) => {
          const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;
          return (
            <div key={i} className="flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                <span className="text-slate-700 dark:text-slate-300 font-medium">{slice.label}</span>
              </div>
              <span className="font-bold text-slate-900 dark:text-white font-mono">
                {toPersianDigits(percent)}٪
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
