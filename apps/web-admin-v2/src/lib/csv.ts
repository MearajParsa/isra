/**
 * CSV Generation & Formula Injection Protection
 */

/**
 * Escapes a single cell to prevent CSV Formula Injection (DDE injection).
 * If a cell begins with '=', '+', '-', '@', '\t', '\r', prefix with a single quote.
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);

  // Neutralize CSV formula injection
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some((p) => str.startsWith(p))) {
    str = `'${str}`;
  }

  // Escape internal double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Converts array of rows into a UTF-8 BOM CSV string
 */
export function generateCsvString(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  // \uFEFF is UTF-8 Byte Order Mark (BOM) ensuring Excel displays Persian characters properly
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}

/**
 * Downloads a generated CSV directly in the browser
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]): void {
  const csvContent = generateCsvString(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
