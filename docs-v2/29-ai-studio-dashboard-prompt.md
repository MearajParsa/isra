# ۲۹ — پرامپت ساخت داشبورد مدیریت در Google AI Studio

## راهنمای مالک (فارسی)
1. در https://aistudio.google.com ← **Build** (یا یک چت جدید با مدل Gemini Pro، حالت Thinking روشن).
2. این فایل‌ها را **پیوست** کن: ① عکس رفرنس UI ② `docs-v2/28-dashboard-api-reference.md` (مرجع کامل API؛ خودکار از قرارداد تولید می‌شود) ③ دو فونت `apps/web-admin/static/fonts/YekanBakhFaNum-*.woff2` و لوگو `apps/web-admin/static/icons/*` (اگر قابل پیوست بود).
3. متن داخل کادر «PROMPT» پایین را **کامل** کپی کن و بفرست. اگر مدل وسط کار قطع شد بنویس: «Continue from the last file; output only the remaining files, complete, no placeholders.»
4. خروجی را در پوشهٔ `apps/web-admin-v2/` (یا هر نام دلخواه) بگذار؛ بعد به من بگو تا build/pack و استقرار را زیر `israapp.ir/s` انجام دهم (اسکریپت pack برای SPA استاتیک آماده می‌شود).
5. آدرس‌ها: در `.env.production` همین مقادیر را بگذار: `VITE_BASE_PATH=/s`، `VITE_API_LOW_URL=https://capi.israapp.ir`، `VITE_API_HIGH_URL=https://sapi.israapp.ir`.

> نکتهٔ مهم: هر بار که قرارداد API عوض شد، `pnpm --filter @isra/api-types dashboard-ref` را بزن تا مرجع به‌روز شود و دوباره پیوست کن.

---

## PROMPT

```text
You are a principal front-end engineer and product designer. Build a COMPLETE, production-grade, installable (PWA), fully responsive, Persian (RTL) admin dashboard SPA for a real, already-running backend. Output every file in full — no placeholders, no "TODO", no "rest of the code here", no mock/fake data in the production build. If you run out of space, stop at a file boundary and I will say "continue".

I attach: (1) a REFERENCE IMAGE of the desired look & feel — match its visual language (layout, spacing, radius, color feel, density, typography hierarchy, iconography); where it is silent, make tasteful choices consistent with it; (2) `28-dashboard-api-reference.md` — the AUTHORITATIVE API contract (endpoint table, per-endpoint query/body/data types, permissions, step-up flags, error codes). Never invent an endpoint, field, permission or error code that is not in that file. If something you need is missing, implement the closest documented capability and list the gap at the end under "Contract gaps".

════════════════════════════════════════
0. PRODUCT CONTEXT
════════════════════════════════════════
"Isra" (اسراء) is a Quran-learning platform. This dashboard is the SYSTEM ADMIN PANEL used by developers and administrators. Everything in the system is a MODULE; access is controlled by dynamic ROLES, PERMISSIONS and MODULES that admins can create/edit/delete from this UI. The whole UI is Persian only (fa-IR), right-to-left, Jalali (Persian) calendar, Persian digits, Iran time zone (Asia/Tehran, UTC+03:30). The business week runs Saturday → Friday. No i18n framework is needed.

Three REST backends (no gateway), same registrable domain as the panel:
- LOW  = `${VITE_API_LOW_URL}`  (auth only for this panel): paths start with `/c/v1/...`
- HIGH = `${VITE_API_HIGH_URL}` (everything else): paths start with `/s/v1/...`
The env vars hold ONLY the origin (e.g. `https://capi.israapp.ir`); the client appends the paths exactly as written in the reference file. NEVER call any other host. NEVER put keys/secrets in the client.

════════════════════════════════════════
1. TECH STACK (fixed — do not substitute)
════════════════════════════════════════
- TypeScript 5 (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes), ES2022, pnpm/npm compatible.
- React 19 + Vite 6, static SPA output in `dist/` (NO SSR, NO server code).
- Router: React Router 7 in "library/data router" mode (`createBrowserRouter`), `basename = import.meta.env.BASE_URL` (the app is served under a sub-path, default `/s`, set by `VITE_BASE_PATH`; Vite `base` must read it; every asset/link/SW scope must work under that base). Provide SPA fallback behaviour expectations in README (server rewrites unknown paths under the base to `index.html`).
- Data: TanStack Query v5 (caching, dedupe, abort, retry policy below). No Redux.
- Forms/validation: react-hook-form + zod (mirror the server constraints from the reference file).
- Styling: Tailwind CSS v4 with CSS logical properties (ps-/pe-/ms-/me-/start/end; NEVER left/right), design tokens as CSS variables (light + dark theme via `prefers-color-scheme` AND a manual toggle persisted in localStorage — but if the reference image shows only one theme, ship that theme polished first and make the other consistent).
- Headless accessible primitives: Radix UI (Dialog, DropdownMenu, Tabs, Tooltip, Popover, Select, Switch, Checkbox, ScrollArea). Icons: `lucide-react` with per-icon imports only.
- Charts: hand-written inline SVG components (line/area/bar/sparkline/donut) — NO chart library. Accessible (role="img" + aria-label summary + data table fallback), RTL-aware (time flows left→right inside the chart is acceptable and expected), keyboard-focusable points with tooltips.
- PWA: `vite-plugin-pwa` (Workbox `generateSW`, `registerType: 'prompt'`).
- Tests: Vitest + @testing-library/react + MSW (MSW ONLY in tests; never bundled in production).
- Lint/format: ESLint (typescript-eslint strict, react-hooks, jsx-a11y), Prettier. No other runtime dependencies without a one-line justification in the README. FORBIDDEN: moment/dayjs/luxon, lodash, axios, UI kits (MUI/Ant/Chakra), icon fonts, CDN scripts/styles/fonts, jQuery, any analytics/tracking.
- Dates: use `Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran' })` for display, and write a tiny tested Jalali⇄Gregorian converter (jalaali algorithm) for the date pickers (inputs/outputs to the API are Gregorian `YYYY-MM-DD` or ISO-8601 with offset exactly as the contract says). Persian digits for all numbers via `Intl.NumberFormat('fa-IR')`; inputs accept Persian/Arabic/Latin digits and normalise to Latin before sending.
- Font: self-hosted "YekanBakh" (files `YekanBakhFaNum-Regular.woff2`, `YekanBakhFaNum-Bold.woff2` in `public/fonts/`), `font-display: swap`, preload the Regular weight. No Google Fonts.

════════════════════════════════════════
2. HTTP LAYER (build once, test thoroughly)
════════════════════════════════════════
A single typed `http` module + a typed API client with one function per endpoint ID (named after the ID, e.g. `H13_createRole`). Types come from the reference file (copy them into `src/api/types.ts`).

Request rules
- JSON only. Every request sends `X-Isra-Client: web-admin` and `X-Isra-Client-Version: <app version>`. Send `X-Request-Id: <uuid v4>` too.
- Authorization: `Authorization: Bearer <accessToken>` for everything except the public auth endpoints.
- LOW auth calls use `credentials: 'include'` (the refresh token lives in an HttpOnly cookie `isra_rt_admin`; JS can never read it). HIGH calls do not need cookies.
- Mutations that the reference marks idempotent-by-key (e.g. POST create endpoints, H-24, H-62…) MUST send `Idempotency-Key: <uuid>`; generate it ONCE per user action and reuse it on automatic retries; disable the submit button while pending.
- GET with `ETag` support: store ETag per URL in the Query cache layer and send `If-None-Match`; treat 304 as "use cached data".
- Abort in-flight requests on route change / unmount / superseded search (AbortController via TanStack Query signal).
- Timeout 15 s (30 s for CSV/export batches). Retry policy: idempotent GETs retry up to 2× with exponential backoff + jitter on network error/502/503/504 ONLY; never auto-retry mutations (except re-sending the SAME Idempotency-Key once on a network error). On 429 honour `Retry-After` (show a countdown toast; auto-retry GET once after the delay).

Envelope & errors
- Success: `{ success:true, data, meta:{requestId,...} }` ⇒ return `data` (+ `meta` for lists: `page,pageSize,total`).
- Error: `{ success:false, error:{ code, message, details? }, meta }`. Build an `ApiError` class (code, status, message(fa), details.fields, details.reason, details.retryAfterSec, requestId). ALWAYS show the Persian `message` from the server; show `requestId` in a small "copy support code" affordance on unexpected errors.
- Field errors (`VALIDATION_FAILED` with `details.fields`) map onto the form fields.
- Map codes to behaviour (exhaustive switch, typed):
  • `AUTH_REQUIRED` / `AUTH_TOKEN_EXPIRED` / `AUTH_TOKEN_INVALID` → try ONE silent refresh (single-flight: concurrent 401s share one refresh promise), replay the original request once; if refresh fails → clear session → login page with "session expired" notice and return-to path.
  • `AUTH_PERM_STALE` → refresh the token (permissions changed), replay once.
  • `AUTH_STEP_UP_REQUIRED` → open the Step-up dialog (§3), then replay the original request ONCE with `X-Step-Up-Token`.
  • `AUTH_PASSWORD_CHANGE_REQUIRED` → force the "set new password" screen (§4.2).
  • `AUTH_ACCOUNT_DISABLED` → dedicated "account disabled, contact admin" screen/notice.
  • `AUTH_FORBIDDEN` → inline "no permission" state (never a crash); also re-fetch `/system/me` once (maybe permissions changed).
  • `RATE_LIMITED` → countdown from `Retry-After`/`details.retryAfterSec`.
  • `CONFLICT` → use `details.reason` (ALREADY_..., LAST_HOLDER, LOCKED_PERMISSION, KEY_TAKEN, SYSTEM_PROTECTED, ROLE_IN_USE, MODULE_NOT_EMPTY, PHONE_TAKEN, SELF_PROTECTED, USER_NOT_ACTIVE, …) to show a specific Persian explanation next to the action that failed.
  • `NOT_FOUND` → friendly empty/not-found state with a back link.
  • `SERVICE_UNAVAILABLE` (503) / network failure / 5xx → NEVER show a raw "503" or technical text. Show a calm Persian full-page or inline state: "سرویس موقتاً در دسترس نیست؛ چند لحظه بعد دوباره تلاش کنید" with a Retry button (+ automatic retry with backoff for GETs). Keep already-loaded data on screen (stale-while-error) with a subtle "data may be outdated" banner.
- Global error boundary per route + a top-level one; never a blank screen.

Token handling (security-critical)
- Access token ONLY in memory (module variable / React context). NEVER localStorage/sessionStorage/IndexedDB/URL/console. Refresh on app boot via `POST /c/v1/auth/refresh` (cookie) when a non-sensitive hint flag `isra.admin.session=1` exists in localStorage (hint only; contains no secret). Proactive refresh ~60 s before `accessExpiresIn` elapses (timer cleared on logout; also refresh on tab focus if close to expiry). Multi-tab: use `BroadcastChannel('isra-admin-auth')` to sync logout/login across tabs.
- Logout: `POST /c/v1/auth/logout`, clear memory + query cache + hint, broadcast.
- Step-up token: memory only, with its expiry (`expiresInSec`, 5 min); reuse until ~10 s before expiry, never persist.

════════════════════════════════════════
3. STEP-UP (CRITICAL BUSINESS RULE)
════════════════════════════════════════
Sensitive actions may require a fresh identity confirmation (OTP) = "step-up". The decision is made by the SERVER from a policy that admins edit in this panel:
- Users with the `developer` role NEVER need step-up for anything. `GET /s/v1/system/me` returns `stepUpExempt` (true for developers) and `stepUp` (map permission → "required" | "none").
- For everyone else, an endpoint that is step-up-capable needs it only when `stepUp[permission] === 'required'`.
UI behaviour:
1. After login load `/system/me` (H-00). Store `stepUpExempt` and `stepUp`.
2. Before an action: if `stepUpExempt` or `stepUp[perm]==='none'` → call the API directly (no dialog).
3. Otherwise (or when the server answers `AUTH_STEP_UP_REQUIRED` anyway — the server is authoritative) → show the Step-up bottom-sheet/dialog: request OTP (`L-06`), 5-digit OTP input (auto-advance, paste support, `autocomplete="one-time-code"`, `inputmode="numeric"`), resend countdown (honour the server's wait), attempts-left from `details.attemptsLeft`, verify (`L-07`) → get `stepUpToken` → replay the original request with header `X-Step-Up-Token`. Cache the token in memory until expiry so several consecutive sensitive actions don't re-prompt.
4. Provide a UX-friendly "pending action" promise queue so concurrent step-up-requiring requests share ONE dialog.
5. Developers must never see this dialog; hide any "step-up" hints for them.

════════════════════════════════════════
4. SCREENS & FEATURES (all of it is required)
════════════════════════════════════════
Global shell: RTL layout; desktop = collapsible sidebar (grouped by module) + top bar (breadcrumbs, search-command palette Ctrl/⌘+K navigating to pages/users, theme toggle, user menu, connectivity indicator); mobile (<768px) = bottom navigation (4 key items + "more" sheet), sticky header, full-width sheets for forms, tables collapse into card lists. Navigation items and routes appear ONLY if the user holds the relevant permission (UI gating is a convenience; the server is the authority — still handle 403).

4.1 Login (`/login`): two tabs — OTP (phone → 5-digit code, `L-01`,`L-02`) and password (`L-03`). Iranian mobile validation `^09\d{9}$` (accept Persian digits). Device info: a persistent random `deviceId` (uuid in localStorage — it is not a secret) and `deviceLabel` (browser + OS, ≤80 chars). Handle: rate limits (countdown), OTP expired/exhausted (offer resend), invalid credentials (generic message), disabled account. After success → load H-00; user without any system role gets a polite "no access to the admin panel" screen with logout. Return to the originally requested path.

4.2 Forced password change: when login/`H-02` says `mustChangePassword`, or any call returns `AUTH_PASSWORD_CHANGE_REQUIRED`, lock the whole app to a full-screen form (current temporary password + new password + confirm, strength meter, show/hide) calling the documented endpoint (H-04 with `currentPassword`); on success refresh the token and continue.

4.3 Overview (`/`): KPI tiles + trend charts from H-01 and H-80..H-84 (users, sessions, OTP volume, leaderboard top 5), date-range presets (today / 7d / 30d / this week (Sat–Fri) / this month / custom Jalali range), auto-refresh every 60 s while the tab is visible (pause when hidden). Skeletons, empty states.

4.4 Users module
- List (`H-20`): URL-synced filters (search q, role incl. dynamic roles + "none", direct-grant filter, status, created range with Jalali pickers, sort), server pagination (page size 10/25/50), column density toggle, CSV export of the FILTERED list (batch through pages respecting the 50-row cap and rate limit with progress + cancel; UTF-8 BOM; neutralise CSV formula injection by prefixing cells that start with `= + - @ \t` with a single quote). Debounced search (300 ms), keep previous data while loading.
- Create (`H-24`, Idempotency-Key): phone, first/last name, optional temporary password (generator + copy once, "user must change it at first login" notice), optional initial roles/grants (only those the actor can assign).
- Detail (`H-21`): header (name, masked phone, status chip, roles), tabs: Overview (stats, last activity, sessions by client) · Access (roles assignment `H-22`, direct grants `H-23`, and an "Effective access" explainer from `H-93` listing every permission with its SOURCES (role / module / grant) and whether step-up applies) · Devices (`H-50`, revoke `H-51`) · Activity (audit entries for this user via `H-40` filtered by target) · Danger zone.
- Actions: edit profile/phone (`H-25`), enable/disable (`H-26`), soft-delete + anonymise (`H-27`, type-to-confirm with the phone/name), set/clear temporary password (`H-28`), force logout of all devices (`H-29`). Show server `CONFLICT` reasons verbatim (e.g. SELF_PROTECTED, LAST_HOLDER).

4.5 Access module (roles, permissions, modules — THE CORE REQUIREMENT)
- One data call `H-92` returns modules + permissions + roles + step-up rules + `version` (use ETag/If-None-Match; refetch on focus).
- "Access matrix" page: a responsive matrix (roles = columns, permissions grouped by module = rows with collapsible module headers; module header has "grant whole module" toggle per role). Cells: explicit permission, inherited-from-module (visually distinct, not individually removable), locked (padlock, not removable), developer column read-only. Sticky header/first column; on mobile switch to a per-role accordion editor. Unsaved-changes bar with diff summary (added/removed) → Save calls `H-12` (explicit permissions) and `H-17` (modules) as needed; handle LOCKED_PERMISSION / AUTH_FORBIDDEN (anti-escalation: you cannot grant what you do not hold — disable such toggles proactively using the actor's own effective permissions from `H-94`, but still handle the server error).
- Roles (`H-10/H-13/H-14/H-15/H-16`): list with holder counts, create (key validated `^[a-z][a-z0-9_]{2,31}$` with live availability hint, title, description, initial permissions/modules), edit title/description, delete (blocked with explanation for system roles and roles that still have holders — link to filtered users list). System roles (developer, super_admin) show a "system" badge; developer is fully read-only.
- Permissions registry (`H-11/H-85/H-86/H-87`): create custom permission (key format `module.action` with 2–4 dot-separated lowercase segments; the prefix `system.` is reserved and rejected; title, description, module, grantable flag, default step-up), edit, delete (cascade warning: list impact), system permissions marked and only partially editable.
- Modules (`H-88/H-89/H-90/H-91`): create/edit/delete, order, permission counts; a module can be granted to a role as a whole (all current AND future permissions).
- Step-up policy editor (`H-18`, needs permission `system.stepup.manage`): per role × permission tri-state (Inherit / Required / None) with the permission's default shown; bulk-set per module; a clear banner "Developers never need step-up". Show for each cell the EFFECTIVE result. Warn when relaxing a sensitive permission.
- Everything shows an optimistic-free, server-confirmed UX (no fake success), with toasts and focus management.

4.6 Sessions module (`H-60..H-72`): filterable list (status draft/scheduled/started/ended, creator picker, include-deleted, date range, sort), create/edit form (title, description, schedule once/weekly per contract, location with optional route URL https-only), status transition stepper (one step forward only, show `SESSION_INVALID_TRANSITION` message), soft delete, detail with tabs: Info · Members (approve/reject/remove, role assignment teacher/supporter per contract) · Attendance · Queue · Evaluations. Respect contract notes (manager alone cannot evaluate; show the rule as helper text).

4.7 Reports (`H-80..H-84`): comprehensive overview, registrations series, sessions series, OTP series, leaderboard; interval day/week(Saturday-start)/month; range limited to the contract maximum; chart + accessible table toggle; CSV export per report.

4.8 Audit log (`H-40`): filters (action, actor, target type/id, Jalali date range, search), expandable rows showing `summary` and non-sensitive `meta`, CSV export. Never render raw HTML; never show secrets (the server already redacts; still escape everything).

4.9 Settings (`H-30/H-31`): evaluation weights (sum must be exactly 100, live validator + donut preview), badge thresholds (strictly ascending), feature flags (maintenance_mode, registration_open) with confirmation for maintenance mode; optimistic-concurrency via the `version` field (handle `CONFLICT/VERSION_MISMATCH` with "reload latest" flow).

4.10 My account (`H-02..H-07`, `H-94`): edit my name, change my password (step-up policy applies), my devices/sessions with revoke / revoke-others, my effective access (read-only, with step-up info).

4.11 System pages: 404, 403, offline page, maintenance/503 friendly page, update-available toast (PWA).

════════════════════════════════════════
5. PWA (installable on phones)
════════════════════════════════════════
- `manifest.webmanifest`: name "اسراء — پنل مدیریت", short_name "پنل اسراء", `lang:"fa"`, `dir:"rtl"`, `start_url: "<base>/"`, `scope: "<base>/"`, `display:"standalone"`, theme/background colors from the design tokens, icons 192/512 + maskable 512 (generate simple SVG-based placeholders and document replacing them with the real logo), shortcuts (Users, Access, Reports).
- Service worker (Workbox via vite-plugin-pwa), scope = the base path: precache ONLY the app shell (hashed JS/CSS/fonts/icons/offline page); `navigateFallback` to `index.html` with a denylist for API origins; runtime cache: fonts/images = CacheFirst (limited, expiring). **NEVER cache any API response, Authorization-bearing request, or anything from the LOW/HIGH origins** (no sensitive data at rest). Offline navigation shows the offline page; writes while offline are blocked with a clear message (no background sync of mutations).
- Update flow: prompt-based ("نسخهٔ جدید آماده است" → reload). Add `beforeinstallprompt` custom install button (+ iOS "Add to Home Screen" hint). Respect `prefers-reduced-motion`. Safe-area insets (`env(safe-area-inset-*)`) for notched phones; `viewport-fit=cover`; no horizontal scroll at 320px; touch targets ≥ 44px; `overscroll-behavior` handled; no hover-only interactions.

════════════════════════════════════════
6. PERFORMANCE BUDGETS (treat as acceptance criteria)
════════════════════════════════════════
- Initial route JS ≤ 150 KB gzip (login/shell), each route chunk ≤ 60 KB gzip; total CSS ≤ 30 KB gzip. Route-based `React.lazy` code-splitting for every screen; heavy components (charts, matrix) lazy. Verify with `vite build` output and put the numbers in the README.
- LCP < 2.0 s and INP < 200 ms on a mid-range phone over 4G; CLS < 0.05 (reserve space with skeletons; font `size-adjust` fallback).
- Prefetch route chunks and data on link hover/focus/touchstart (TanStack Query `prefetchQuery`); `staleTime` tuned per resource (reference data like modules/permissions/roles: 60 s + ETag revalidation; lists: 15 s; reports: 30 s); `keepPreviousData` for paginated lists; dedupe identical requests; cancel superseded requests.
- Virtualise any list > 100 rendered rows (write a small windowing hook; no heavy lib). Memoise matrix cells; avoid re-rendering the whole matrix on one toggle (store selection in a normalised map, subscribe per cell).
- No layout-thrashing animations; animate only `transform`/`opacity`; ≤ 200 ms; disabled under reduced-motion.
- Images: none required (SVG only). `<link rel="preconnect">` to the two API origins. HTTP caching headers are server-side; make hashed assets immutable-friendly.

════════════════════════════════════════
7. SECURITY REQUIREMENTS
════════════════════════════════════════
- Strict CSP-compatible output: NO inline scripts, NO inline event handlers, NO `eval`/`new Function`, no external origins except the two API origins. Provide the recommended CSP header in the README (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' <LOW> <HIGH>; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`). Tailwind/Vite must not require `unsafe-eval`.
- No `dangerouslySetInnerHTML`, no `innerHTML`, no `target=_blank` without `rel="noopener noreferrer"`; validate/normalise any URL shown as a link (https only).
- Tokens never logged, never in URLs, never in error reports; redact phone numbers in any client-side diagnostics (show `0912***1234` outside the user-detail page).
- Treat all server strings as untrusted text (escape by default through React); CSV export neutralises formula injection.
- UI permission gating mirrors the server but is NOT relied on; every destructive action requires explicit confirmation (type-to-confirm for delete user/role/permission/module); double-submit protection; idempotency keys.
- Clickjacking/embedding: the app must not need to be framed. Auto-logout UX: on 401-after-refresh-failure clear everything. Idle timeout (configurable constant, default 30 min of inactivity) → lock screen asking to re-authenticate (call refresh; if it fails → login). Disable browser autofill on sensitive one-off fields; password fields use `autocomplete="current-password"|"new-password"`.
- Dependency hygiene: pinned versions, `npm audit`-clean at generation time, README section "Supply chain" (lockfile committed, `--ignore-scripts` install).
- Never expose source maps with sensitive comments; production build `sourcemap: 'hidden'`.

════════════════════════════════════════
8. UX / ACCESSIBILITY / RESPONSIVE
════════════════════════════════════════
- WCAG 2.2 AA: contrast ≥ 4.5:1 (verify tokens), visible focus rings, full keyboard operation (dialogs trap focus, ESC closes, roving tabindex in menus/tabs/matrix with arrow keys), `aria-live` toasts, `aria-busy` on loading regions, labels for every control, error messages linked by `aria-describedby`, skip-to-content link, `lang="fa" dir="rtl"` on `<html>`.
- Breakpoints: 320, 480, 768, 1024, 1280, 1536; test layouts at 320/375/768/1280. Tables → card lists on mobile; dialogs → bottom sheets on mobile; sticky action bars respect safe areas.
- Every data view has all four states designed: loading (skeleton), empty (illustration-free, helpful CTA), error (Persian message + retry + support code), success. Toasts for outcomes; inline errors for forms; unsaved-changes guard on dirty forms.
- Microcopy in natural, polite, concise Persian (formal «شما»). Numbers/dates always localised. Phone numbers displayed as `0912 345 6789` (LTR isolate via `<bdi dir="ltr">`).

════════════════════════════════════════
9. CODE ORGANISATION & QUALITY
════════════════════════════════════════
```
src/
  app/            (router, providers, error boundaries, shell, guards)
  api/            (http.ts, errors.ts, auth.ts, stepUp.ts, endpoints/*.ts one file per module, types.ts)
  features/       (auth, users, access, sessions, reports, audit, settings, account) — each: routes, components, hooks, schemas
  components/ui/  (Button, Input, Select, Dialog, Sheet, Tabs, Table, Pagination, Toast, Skeleton, EmptyState, ErrorState, Badge, Switch, DatePicker(Jalali), OtpInput, ConfirmDialog, TypeToConfirm, Charts/*)
  lib/            (jalali.ts, format.ts, csv.ts, permissions.ts, deviceInfo.ts, windowing.ts, invariant.ts)
  styles/         (tokens.css, base.css)
  pwa/            (register.ts, InstallPrompt.tsx, UpdateToast.tsx)
public/ (fonts, icons, offline.html, manifest assets)
```
- Typed permission helper: `can('system.users.manage')` from the `/system/me` data; `<Can perm="...">` component; route guards.
- All API access through the typed client; no `fetch` elsewhere. No `any`. Exhaustive `switch` on error codes with `satisfies never`.
- Unit tests (Vitest): http layer (refresh single-flight, 401 replay, step-up replay with the same Idempotency-Key, 429 Retry-After, 503 friendly mapping, ETag/304), jalali conversion (round-trips + known dates + Saturday week start), CSV injection, permission helpers, access-matrix diff logic, step-up decision logic (developer exempt / policy none / required), key validators. Component tests for Login, Step-up dialog, Access matrix toggle & save, Users filters↔URL sync.
- Provide `package.json` scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `analyze` (bundle visualiser). `.env.example` with the three variables. A thorough `README.md` (architecture, env, scripts, CSP, PWA notes, deployment under a sub-path with SPA fallback, performance numbers, security notes, "Contract gaps").
- Zero console errors/warnings at runtime. No leftover debug code.

════════════════════════════════════════
10. DELIVERY FORMAT
════════════════════════════════════════
1) First, a brief plan (≤ 25 lines): final file tree + the design tokens you derived from the reference image (colors, radii, spacing scale, type scale).
2) Then EVERY file, each in its own fenced block preceded by its path as a heading, in dependency order (config → lib → api → ui components → features → app → tests → README).
3) End with: a checklist mapping each section of this prompt to files that implement it, and the "Contract gaps" list.
The project must build with `npm install && npm run build` and pass `npm run typecheck && npm run lint && npm test` with no manual edits.
```

---

## نکات برای استقرار (برای من، پس از دریافت خروجی)
- خروجی SPA استاتیک است؛ با اسکریپت pack (مشابه `scripts/pack-web-admin.mjs`) داخل اپ Node زیر `israapp.ir/s` سرو می‌شود (CSP بدون inline script، rewrite به `index.html`، SW با scope `/s/`، cache immutable برای assetهای hash‌دار).
- ساب‌دامنهٔ API باید CORS برای Origin پنل + `credentials` را مجاز کند (الان هست) و `Idempotency-Key` در `allowedHeaders` high (در این نسخه اضافه شد).
