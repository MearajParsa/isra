import { describe, it, expect } from 'vitest';
import {
  gregorianToJalali,
  jalaliToGregorian,
  isJalaliLeapYear,
  getPersianWeekRange,
} from '@/lib/jalali';
import {
  toPersianDigits,
  normalizeToLatinDigits,
  formatPhoneNumber,
  isValidIranPhone,
} from '@/lib/format';
import { sanitizeCsvCell, generateCsvString } from '@/lib/csv';
import {
  isDeveloper,
  hasPermission,
  isStepUpNeeded,
  isValidRoleKey,
  isValidCustomPermissionKey,
} from '@/lib/permissions';
import { ApiError } from '@/api/errors';

describe('Jalali Calendar Utilities', () => {
  it('correctly converts known Gregorian date to Jalali', () => {
    // 2026-03-21 is 1405-01-01 (Nowruz)
    const j = gregorianToJalali(2026, 3, 21);
    expect(j.jy).toBe(1405);
    expect(j.jm).toBe(1);
    expect(j.jd).toBe(1);
  });

  it('performs accurate round-trip conversion Jalali -> Gregorian -> Jalali', () => {
    const origJ = { jy: 1404, jm: 8, jd: 15 };
    const g = jalaliToGregorian(origJ.jy, origJ.jm, origJ.jd);
    const converted = gregorianToJalali(g.gy, g.gm, g.gd);
    expect(converted).toEqual(origJ);
  });

  it('correctly detects Jalali leap years', () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
  });

  it('calculates Persian week range starting on Saturday', () => {
    // 2026-03-25 is a Wednesday
    const wednesday = new Date(2026, 2, 25);
    const range = getPersianWeekRange(wednesday);
    // Saturday in JS is getDay() === 6
    expect(range.from.getDay()).toBe(6);
    // Friday in JS is getDay() === 5
    expect(range.to.getDay()).toBe(5);
  });
});

describe('Persian Formatting & Normalization', () => {
  it('converts Latin digits to Persian digits', () => {
    expect(toPersianDigits('1234567890')).toBe('۱۲۳۴۵۶۷۸۹۰');
  });

  it('normalizes Persian and Arabic digits to Latin digits', () => {
    expect(normalizeToLatinDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
    expect(normalizeToLatinDigits('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789');
  });

  it('validates Iranian mobile numbers', () => {
    expect(isValidIranPhone('09123456789')).toBe(true);
    expect(isValidIranPhone('۰۹۱۲۳۴۵۶۷۸۹')).toBe(true);
    expect(isValidIranPhone('02188888888')).toBe(false);
    expect(isValidIranPhone('0912')).toBe(false);
  });

  it('formats Iranian phone number with spacing', () => {
    expect(formatPhoneNumber('09123456789')).toBe('0912 345 6789');
  });
});

describe('CSV Security & Formula Injection Neutralization', () => {
  it('neutralizes cells starting with dangerous formula characters', () => {
    expect(sanitizeCsvCell('=cmd|"/c calc"!A0')).toBe(`"'=cmd|""/c calc""!A0"`);
    expect(sanitizeCsvCell('+123')).toBe(`"'+123"`);
    expect(sanitizeCsvCell('-50')).toBe(`"'-50"`);
    expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe(`"'@SUM(A1:A10)"`);
    expect(sanitizeCsvCell('\tTabStart')).toBe(`"'\tTabStart"`);
  });

  it('adds UTF-8 BOM to CSV content', () => {
    const csv = generateCsvString(['نام', 'شماره'], [['علی', '09123456789']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });
});

describe('Permission & Step-Up Rules', () => {
  it('recognizes developer role as exempt from general step-up', () => {
    const actor = {
      roles: ['developer'],
      permissions: [],
      stepUpExempt: true,
      stepUp: { 'system.users.manage': 'required' as const },
    };

    expect(isDeveloper(actor.roles)).toBe(true);
    expect(hasPermission(actor, 'any.action')).toBe(true);
    expect(isStepUpNeeded(actor, 'system.users.manage')).toBe(false);
  });

  it('enforces step-up for regular roles when configured as required', () => {
    const actor = {
      roles: ['super_admin'],
      permissions: ['system.users.manage'],
      stepUpExempt: false,
      stepUp: { 'system.users.manage': 'required' as const },
    };

    expect(isDeveloper(actor.roles)).toBe(false);
    expect(hasPermission(actor, 'system.users.manage')).toBe(true);
    expect(isStepUpNeeded(actor, 'system.users.manage')).toBe(true);
  });

  it('validates dynamic role key format', () => {
    expect(isValidRoleKey('supervisor')).toBe(true);
    expect(isValidRoleKey('quran_teacher_2')).toBe(true);
    expect(isValidRoleKey('123bad')).toBe(false);
    expect(isValidRoleKey('A_Caps')).toBe(false);
    expect(isValidRoleKey('ab')).toBe(false); // minimum 3 chars
  });

  it('validates custom permission key format and blocks reserved system prefix', () => {
    expect(isValidCustomPermissionKey('evaluations.export_pdf').valid).toBe(true);
    expect(isValidCustomPermissionKey('system.hack').valid).toBe(false);
    expect(isValidCustomPermissionKey('invalid_single_segment').valid).toBe(false);
  });
});

describe('ApiError and Reason Translations', () => {
  it('translates LAST_HOLDER conflict reason to friendly Persian', () => {
    const err = new ApiError('CONFLICT', 'Conflict occurred', 409, { reason: 'LAST_HOLDER' });
    expect(err.getReasonMessage()).toContain('آخرین دارنده این نقش');
  });

  it('translates LOCKED_PERMISSION conflict reason to friendly Persian', () => {
    const err = new ApiError('CONFLICT', 'Conflict occurred', 409, { reason: 'LOCKED_PERMISSION' });
    expect(err.getReasonMessage()).toContain('قفل شده');
  });
});
