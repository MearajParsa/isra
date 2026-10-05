import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  gregorianToJalali,
  jalaliToGregorian,
  getDaysInJalaliMonth,
  PERSIAN_MONTH_NAMES,
  PERSIAN_WEEKDAY_NAMES,
  toApiDateString,
  getPersianWeekRange,
  padZero,
} from '@/lib/jalali';
import { toPersianDigits } from '@/lib/format';

export interface DatePickerProps {
  label?: string;
  value?: string; // Gregorian "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  placeholder = 'انتخاب تاریخ...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value to Jalali date
  const initialJalali = (() => {
    if (value) {
      const [gy, gm, gd] = value.split('-').map(Number);
      if (gy && gm && gd) return gregorianToJalali(gy, gm, gd);
    }
    const today = new Date();
    return gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
  })();

  const [viewYear, setViewYear] = useState(initialJalali.jy);
  const [viewMonth, setViewMonth] = useState(initialJalali.jm);

  // Close popover when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [isOpen]);

  // Selected date components
  const selectedJalali = value
    ? (() => {
        const [gy, gm, gd] = value.split('-').map(Number);
        return gy && gm && gd ? gregorianToJalali(gy, gm, gd) : null;
      })()
    : null;

  const displayString = selectedJalali
    ? `${toPersianDigits(selectedJalali.jd)} ${PERSIAN_MONTH_NAMES[selectedJalali.jm - 1]} ${toPersianDigits(selectedJalali.jy)}`
    : '';

  const totalDays = getDaysInJalaliMonth(viewYear, viewMonth);

  // Compute first day of month weekday offset (Saturday=0, Sunday=1, ..., Friday=6)
  const firstDayGreg = jalaliToGregorian(viewYear, viewMonth, 1);
  const firstDayDate = new Date(firstDayGreg.gy, firstDayGreg.gm - 1, firstDayGreg.gd);
  const jsDay = firstDayDate.getDay();
  // Saturday in JS is 6, Sunday is 0 -> offset in Persian week: Sat=0, Sun=1...
  const firstDayOffset = (jsDay + 1) % 7;

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const selectDate = (day: number) => {
    const greg = jalaliToGregorian(viewYear, viewMonth, day);
    const apiStr = `${greg.gy}-${padZero(greg.gm)}-${padZero(greg.gd)}`;
    onChange(apiStr);
    setIsOpen(false);
  };

  const setPreset = (preset: 'today' | 'week' | '7days' | '30days') => {
    const today = new Date();
    if (preset === 'today') {
      onChange(toApiDateString(today));
    } else if (preset === 'week') {
      const { from } = getPersianWeekRange(today);
      onChange(toApiDateString(from));
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      onChange(toApiDateString(d));
    } else if (preset === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      onChange(toApiDateString(d));
    }
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-1.5 text-start">
      {label && <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</label>}

      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full h-11 px-3.5 flex items-center justify-between text-sm bg-white dark:bg-slate-900 border ${
          isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-800'
        } rounded-xl cursor-pointer transition-all select-none ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
          <CalendarIcon className="w-4 h-4 text-slate-400 shrink-0" />
          <span className={displayString ? 'font-medium' : 'text-slate-400'}>
            {displayString || placeholder}
          </span>
        </div>
        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 start-0 mt-2 p-4 w-76 sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl animate-in fade-in-0 zoom-in-95">
          {/* Quick Presets */}
          <div className="flex items-center gap-1 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => setPreset('today')}
              className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
            >
              امروز
            </button>
            <button
              type="button"
              onClick={() => setPreset('week')}
              className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
            >
              این هفته
            </button>
            <button
              type="button"
              onClick={() => setPreset('7days')}
              className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
            >
              ۷ روز قبل
            </button>
            <button
              type="button"
              onClick={() => setPreset('30days')}
              className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
            >
              ۳۰ روز قبل
            </button>
          </div>

          {/* Month & Year Navigation */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="text-xs font-bold text-slate-900 dark:text-white">
              {PERSIAN_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers (Sat -> Fri) */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {PERSIAN_WEEKDAY_NAMES.map((wd) => (
              <span key={wd.index} className="text-[11px] font-medium text-slate-400 py-1">
                {wd.short}
              </span>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}

            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                selectedJalali &&
                selectedJalali.jy === viewYear &&
                selectedJalali.jm === viewMonth &&
                selectedJalali.jd === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(day)}
                  className={`h-8 text-xs font-medium rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                    isSelected
                      ? 'bg-[#251D59] text-white shadow-sm font-bold dark:bg-indigo-600'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
