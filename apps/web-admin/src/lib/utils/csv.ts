/** ساخت CSV امن برای Excel فارسی: BOM یونیکد، CRLF، و خنثی‌سازی formula injection */

const FORMULA_START = /^[=+\-@\t\r]/;

/** سلولی که با = + - @ (یا tab/CR) شروع شود با آپوستروف پیشوند می‌گیرد تا فرمول اجرا نشود */
export function neutralizeFormula(v: string): string {
  return FORMULA_START.test(v) ? `'${v}` : v;
}

export type CsvCell = string | number | boolean | null | undefined;

export function csvCell(v: CsvCell): string {
  // عدد منفی/مثبت واقعی فرمول نیست؛ فقط رشته‌ها خنثی می‌شوند
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? neutralizeFormula(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_BOM = '﻿';

export function buildCsv(header: string[], rows: CsvCell[][], opts: { bom?: boolean } = {}): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return (opts.bom === false ? '' : CSV_BOM) + lines.join('\r\n') + '\r\n';
}

/** دانلود فایل CSV در مرورگر */
export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
