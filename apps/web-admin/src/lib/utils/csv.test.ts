import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell, neutralizeFormula } from './csv';

describe('csv', () => {
  it.each(['=1+1', '+98', '-cmd', '@SUM(A1)', '\tx'])('خنثی‌سازی فرمول: %s', (v) => {
    expect(neutralizeFormula(v)).toBe(`'${v}`);
  });
  it('متن عادی دست‌نخورده', () => {
    expect(neutralizeFormula('علی رضایی')).toBe('علی رضایی');
  });
  it('نقل‌قول، ویرگول و خط جدید', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
  });
  it('عدد منفی واقعی فرمول‌نشده می‌ماند؛ null خالی', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('true');
  });
  it('فرمول داخل سلول نقل‌قول‌دار هم خنثی می‌شود', () => {
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });
  it('BOM و CRLF', () => {
    const out = buildCsv(['نام', 'شماره'], [['علی', '09121234567']]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toBe('﻿نام,شماره\r\nعلی,09121234567\r\n');
    expect(buildCsv(['a'], [], { bom: false })).toBe('a\r\n');
  });
});
