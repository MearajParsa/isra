/**
 * تولید OpenAPI 3.1 از schemaهای zod.
 *   pnpm --filter @isra/api-types openapi         ← بازتولید فایل‌ها
 *   pnpm --filter @isra/api-types openapi:check   ← CI: فایل‌های commit‌شده باید به‌روز باشند
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../src/openapi/build';
import { API_VERSION, type ServiceKey } from '../src/core/version';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'openapi');
const check = process.argv.includes('--check');
const services: ServiceKey[] = ['low', 'mid', 'high'];

const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>اسراء — مستندات API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      dom_id: '#swagger',
      urls: [
        { url: 'low.${API_VERSION}.openapi.json', name: 'api-low (/c/v1)' },
        { url: 'mid.${API_VERSION}.openapi.json', name: 'api-mid (/o/v1)' },
        { url: 'high.${API_VERSION}.openapi.json', name: 'api-high (/s/v1)' }
      ],
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: false
    });
  </script>
</body>
</html>
`;

const files = new Map<string, string>();
for (const s of services) files.set(`${s}.${API_VERSION}.openapi.json`, JSON.stringify(buildOpenApi(s), null, 2) + '\n');
files.set('index.html', html);

let drift = 0;
mkdirSync(outDir, { recursive: true });
for (const [name, content] of files) {
  const path = resolve(outDir, name);
  if (check) {
    // پایان‌خط ویندوز (CRLF از git autocrlf) نباید drift حساب شود
    const current = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== content) {
      console.error(`✗ ${name} به‌روز نیست — اجرا کنید: pnpm --filter @isra/api-types openapi`);
      drift++;
    }
  } else {
    writeFileSync(path, content);
    console.log(`✓ ${name} (${(content.length / 1024).toFixed(1)}KB)`);
  }
}
if (check && drift) process.exit(1);
if (check) console.log('✓ OpenAPI به‌روز است');
