# ۲۹ — ساخت داشبورد مدیریت با Google AI Studio (صفحه‌به‌صفحه، اول موک، آخر API واقعی)

## راهنمای مالک (فارسی)

### روند کلی
| فاز | چه می‌دهی | خروجی | تست تو |
|---|---|---|---|
| **۰ — پایه** | «PROMPT 0» + عکس رفرنس + فایل `28-dashboard-api-reference.md` | اسکلت، طراحی، ورود، منو، لایهٔ دادهٔ **موک** روی localStorage، نوار ابزار توسعه | ورود با هر شماره و کد `11111`، جابه‌جایی نقش (persona) |
| **۱..N — صفحه‌ها** | هر بار فقط یک «PROMPT صفحه» (ترتیب پایین) | فقط فایل‌های همان صفحه + شبیه‌ساز همان endpointها در موک | همان لحظه در پیش‌نمایش AI Studio تست می‌کنی؛ اشکال را با «PROMPT اصلاح» می‌گویی |
| **نهایی — Go-live** | «PROMPT FINAL» | جایگزینی موک با API واقعی، حذف کامل موک و داده‌های localStorage، سخت‌سازی تولید | خروجی را zip کن و به من بده تا بررسی، تست زنده و استقرار کنم |

### قواعد کار
1. در AI Studio حالت **Build** را باز کن (مدل Gemini Pro، Thinking روشن).
2. در اولین پیام: عکس رفرنس UI + فایل `docs-v2/28-dashboard-api-reference.md` + دو فونت `apps/web-admin-v2/public/fonts/*.woff2` را پیوست کن و «PROMPT 0» را بفرست.
3. بعد از هر پیام، در پیش‌نمایش تست کن. اگر چیزی ایراد داشت از «PROMPT اصلاح» استفاده کن و **تا راضی نشدی سراغ صفحهٔ بعد نرو**.
4. هر وقت قرارداد API عوض شد (من خبر می‌دهم)، `pnpm --filter @isra/api-types dashboard-ref` را بزن و فایل تازهٔ `28-...md` را دوباره پیوست کن و بنویس: «The API reference changed; re-read it and align types + mock for the pages built so far.»
5. اگر مدل وسط کار قطع شد: `Continue exactly where you stopped; output only the remaining files in full.`
6. در فاز موک هیچ آدرس API واقعی لازم نیست. در فاز نهایی این مقادیر را بده: `VITE_API_LOW_URL=https://capi.israapp.ir`، `VITE_API_HIGH_URL=https://sapi.israapp.ir`، `VITE_BASE_PATH=/s`.

---

## PROMPT 0 — پایه (فقط یک‌بار)

```text
You are a principal front-end engineer and product designer. We will build a production-grade, installable (PWA), fully responsive, Persian (RTL) ADMIN DASHBOARD together, PAGE BY PAGE. In this first step build ONLY the FOUNDATION described below, then stop and wait for my next instruction. Never build pages I have not asked for yet (show them in the navigation as disabled "به‌زودی" items).

DEVELOPMENT MODE: until I send the FINAL prompt there is NO real backend. All data comes from a MOCK BACKEND that runs in the browser and persists in localStorage. The mock must behave like the real server described in the attached API reference so that switching to the real API later only replaces one module.

I attach:
(1) a REFERENCE IMAGE — match its visual language (layout, spacing, radii, color feel, density, typography hierarchy, iconography);
(2) `28-dashboard-api-reference.md` — the AUTHORITATIVE API contract: every endpoint id (L-xx = auth service, H-xx = admin service), method, path, query/body/data TypeScript types, permission, step-up capability, error codes. NEVER invent an endpoint, field, permission or error code. If something is missing, list it under "Contract gaps" at the end of your answer.
(3) the font files `YekanBakhFaNum-Regular.woff2` and `YekanBakhFaNum-Bold.woff2` (put them in `public/fonts/`).

══════════ 0. PRODUCT ══════════
"Isra" (اسراء) is a Quran-session platform. This dashboard is the SYSTEM ADMIN PANEL for developers and administrators. Everything in the system is a MODULE; access is controlled by dynamic ROLES, PERMISSIONS and MODULES that admins create/edit in this UI. UI is Persian only (fa-IR), RTL, Jalali calendar, Persian digits, time zone Asia/Tehran (UTC+03:30), business week Saturday → Friday. No i18n framework.

══════════ 1. STACK (fixed) ══════════
TypeScript strict (noUncheckedIndexedAccess) · React 19 · Vite (static SPA in `dist/`, no SSR, no server code) · React Router (data router `createBrowserRouter`, `basename = import.meta.env.BASE_URL`) · TanStack Query v5 · react-hook-form + zod · Tailwind CSS v4 with logical properties only (ps/pe/ms/me/start/end — never left/right) · Radix UI primitives (Dialog, DropdownMenu, Tabs, Tooltip, Popover, Select, Switch, Checkbox) · lucide-react (per-icon imports) · hand-written inline-SVG charts (no chart library) · vite-plugin-pwa · Vitest + Testing Library.
FORBIDDEN: express or any server code, @google/genai or any AI SDK, dotenv, axios, moment/dayjs/luxon, lodash, UI kits (MUI/Ant/Chakra), CDN scripts/styles/fonts, Google Fonts, analytics/trackers.
`vite.config.ts`: `base` from `VITE_BASE_PATH` normalised to always start AND end with "/" (e.g. "/s" → "/s/"; default "/"). Every asset/link in code must use `import.meta.env.BASE_URL` (never an absolute "/logo.svg"). `build.sourcemap: 'hidden'`.

══════════ 2. DATA ACCESS ARCHITECTURE (most important part) ══════════
- `src/api/types.ts`: copy ALL types from the reference file exactly (names and fields). These are the only domain types used by the UI.
- `src/api/errors.ts`: `ApiError` (code, status, message (Persian, from server), details: { fields?, reason?, retryAfterSec?, attemptsLeft? }, requestId). Error codes exactly as in the reference catalog.
- `src/api/contract.ts`: a TypeScript interface `AdminApi` with ONE method per endpoint id, named after the id and purpose, e.g. `H20_listUsers(query, opts)`, `H24_createUser(body, opts)`, `L06_stepUpRequest()`. Inputs/outputs use the reference types; list endpoints return `{ items, page, pageSize, total }`. `opts` carries `{ signal?, idempotencyKey?, stepUpToken? }`.
- `src/api/index.ts`: exports the single `api: AdminApi` instance. During development it is the mock: `export const api: AdminApi = createMockApi()`. In the FINAL step this file will switch to `createHttpApi()` and the whole `src/api/mock/` folder will be deleted — so NOTHING outside `src/api/` may import from `src/api/mock/`, and the UI must never know which implementation it is talking to.
- `src/api/mock/` = the MOCK BACKEND:
  • `db.ts`: localStorage persistence under keys prefixed `isra.mock.v1.` with a schema version; JSON-serialised tables (users, roles, permissions, modules, roleModules, stepUpRules, sessions, members, attendance, queue, evaluations, auditLogs, settings, devices…). Write-through with debounced saving; tolerate corrupted/blocked storage (reset to seed).
  • `seed.ts`: deterministic realistic Persian seed: ~120 users (Iranian first/last names, unique `09xxxxxxxxx` phones, mixed status active/disabled/deleted where deleted phones look like `d` + 10 hex), the system roles `developer` and `super_admin`, the modules + system permissions table below, ~40 sessions across all statuses with members (session roles teacher / session_supporter / quran_student / session_manager), attendance, queue items, evaluations, ~300 audit entries spread over the last 90 days, and settings `{ version, evalWeights {voice 40, tone 30, tajweed 30}, badgeThresholds [50,150,300,500], flags {maintenance_mode false, registration_open true} }`.
  • `server.ts`: an in-browser "server" that implements each `AdminApi` method with THE SAME RULES THE REAL SERVER HAS (read them from the reference descriptions): validation with zod mirroring the reference constraints (strict bodies → `VALIDATION_FAILED` with `details.fields`), pagination caps, filters & sorting, permission checks for the current persona (`AUTH_FORBIDDEN`), step-up enforcement (see §3), `CONFLICT` with the right `details.reason` (KEY_TAKEN, SYSTEM_PROTECTED, ROLE_IN_USE, MODULE_NOT_EMPTY, LOCKED_PERMISSION, LAST_HOLDER, PHONE_TAKEN, SELF_PROTECTED, ALREADY_MEMBER, VERSION_MISMATCH, …), `NOT_FOUND`, idempotency (same Idempotency-Key ⇒ same result, no double write), an audit entry for every successful write (action names like `user.create`, `role.permissions.updated`, `session.member.add` …), random latency 150–600 ms, and cancellation via AbortSignal.
  • Reports (H-80..H-84) are COMPUTED from the mock tables (bucketed by day / week starting Saturday / month in Asia/Tehran), never hard-coded numbers.
- Mock auth: OTP request returns a challenge; the valid OTP code is always `11111` (show it in the dev toolbar); password login accepts any user that has `hasPassword`, password `Passw0rd!`. Access token = random string kept in memory only; the "refresh" works while the tab lives and via a non-secret localStorage hint `isra.admin.session=1`. Tokens are NEVER stored in localStorage — not even in mock mode.
- DEV TOOLBAR (only rendered when `api.isMock === true`; deleted in FINAL): floating, collapsible, RTL panel with: current persona switcher (developer / super_admin / any custom role / a user without system role / a disabled user / a user with mustChangePassword), latency slider (0–2000 ms), error injection (none / 503 SERVICE_UNAVAILABLE / 429 RATE_LIMITED with retryAfterSec / network failure) for the next N requests, "force step-up on everything" toggle, the OTP hint `11111`, "reset mock data to seed", "export/import mock DB as JSON".

══════════ 3. STEP-UP (critical business rule; implement in the shared layer now) ══════════
Sensitive endpoints are "step-up capable" (marked in the reference). The SERVER decides; the UI follows:
- `GET /system/me` (H-00) returns `stepUpExempt` (true for role `developer`) and `stepUp` (map permission → "required" | "none").
- Developers NEVER need step-up EXCEPT H-04 (changing their own password) which always requires it.
- Others need it when `stepUp[permission] === 'required'`.
- UI: before a sensitive call, if not exempt and required → open the Step-up dialog: request OTP (L-06), 5-box OTP input (auto-advance, paste, `autocomplete="one-time-code"`, `inputmode="numeric"`), resend countdown, attempts left from `details.attemptsLeft`, verify (L-07) → `stepUpToken` (valid 5 min) kept in MEMORY only → send it as `X-Step-Up-Token` (in mock: as `opts.stepUpToken`). If any call still fails with `AUTH_STEP_UP_REQUIRED` (server is authoritative), clear the cached token, show the dialog, replay the call ONCE. Concurrent requests share ONE dialog (single-flight promise). Re-use the token until ~10 s before expiry.
- The mock enforces exactly the same rule (including the developer H-04 exception) so the flow is testable now.

══════════ 4. FOUNDATION SCOPE (build now) ══════════
1. Project config: `package.json` (only allowed deps), `vite.config.ts`, `tsconfig.json`, `.env.example` (`VITE_BASE_PATH=/s`, and commented `VITE_API_LOW_URL`/`VITE_API_HIGH_URL` for later), `index.html` (`lang="fa" dir="rtl"`, `viewport-fit=cover`, preload Regular font using `%BASE_URL%`), README.
2. Design system from the reference image: CSS variables tokens (colors incl. dark theme, radii, spacing, shadows, typography scale), and UI kit: Button, IconButton, Input, Textarea, Select, Combobox (async user picker), Checkbox, Switch, Tabs, Dialog, BottomSheet (mobile), ConfirmDialog, TypeToConfirm, Toast (aria-live), Skeleton, EmptyState, ErrorState (Persian friendly message + retry + copyable support code `requestId`), Badge/StatusChip, Table (responsive → cards on mobile), Pagination, JalaliDatePicker (+ presets), OtpInput, Charts (Line/Area, Bar, Donut, Sparkline), KPI tile, PageHeader, FilterBar (URL-synced).
3. App shell: desktop collapsible sidebar grouped by module + top bar (breadcrumbs, Ctrl/⌘+K command palette, theme toggle, user menu, connectivity indicator); mobile: bottom navigation (4 items + "more" sheet), sticky header, safe-area insets, no horizontal scroll at 320px, touch targets ≥ 44px. Navigation items appear only when the persona has the needed permission (UI gating is convenience; still handle 403 everywhere).
4. Auth: Login page (two tabs: OTP with phone `^09\d{9}$` accepting Persian/Arabic digits → 5-digit code; and password), persistent non-secret `deviceId` + `deviceLabel`, rate-limit countdown, disabled-account screen, "no system role" screen, forced password change screen (when `mustChangePassword` or `AUTH_PASSWORD_CHANGE_REQUIRED`), idle lock after 30 min, multi-tab logout sync (BroadcastChannel), logout.
5. Shared data hooks on TanStack Query: query-key factory, staleTime per resource, keepPreviousData for lists, abort on unmount/route change, retry only idempotent reads (not on 4xx), global error mapping: 401 → one silent refresh then login; 403 FORBIDDEN → inline "no permission"; 503/5xx/network → calm Persian "سرویس موقتاً در دسترس نیست…" + retry (never show raw status codes); 429 → countdown.
6. Permission helpers: `can(perm)`, `<Can perm>`, route guards.
7. Utilities (unit-tested): Jalali ⇄ Gregorian, Persian number/date formatting with `Intl` (`fa-IR-u-ca-persian`, Asia/Tehran), digit normalisation, phone formatting/masking (`0912***1234`), CSV builder with UTF-8 BOM and formula-injection neutralisation.
8. PWA skeleton: manifest (name «اسراء — پنل مدیریت», short_name «پنل اسراء», lang fa, dir rtl, start_url/scope = BASE_URL, standalone, icons 192/512/maskable), service worker precaching only the app shell, NEVER caching API calls; update-available prompt; install button.
9. Navigation (Persian labels, in this order; disabled «به‌زودی» until built): داشبورد · کاربران · جلسه‌ها · دسترسی‌ها (ماتریس، نقش‌ها، مجوزها، ماژول‌ها، سیاست تأیید هویت) · نشان‌ها · پیام همگانی · گزارش‌ها · گزارش اقدام‌ها · تنظیمات · حساب من.
10. Pages now: Login, Forced password change, 403, 404, offline, a placeholder Overview ("داشبورد") that only greets the persona. All other menu items disabled «به‌زودی».

══════════ 5. NON-NEGOTIABLE QUALITY RULES (apply to every later page too) ══════════
- Performance: route-level lazy loading; initial JS ≤ 150 KB gzip; per-route ≤ 60 KB gzip; memoise heavy lists; virtualise > 100 rows; debounce search 300 ms; prefetch on hover/focus; animate only transform/opacity ≤ 200 ms; respect prefers-reduced-motion.
- Security: no `dangerouslySetInnerHTML`/`innerHTML`/`eval`; no inline scripts (strict CSP `script-src 'self'`); tokens only in memory; never log tokens or full phone numbers; validate links (https only); type-to-confirm for destructive actions; double-submit protection; Idempotency-Key per user action for create endpoints.
- Accessibility WCAG 2.2 AA: contrast, focus rings, full keyboard, focus trap in dialogs, aria-live toasts, labelled controls, errors linked via aria-describedby, skip link.
- Every data view has loading / empty / error / success states. Microcopy: natural, polite, concise Persian. Phone numbers shown LTR inside `<bdi dir="ltr">`.
- No `any`; exhaustive switches on error codes; no console errors.

══════════ 6. OUTPUT FORMAT ══════════
1) Short plan (≤ 20 lines): file tree + design tokens you derived from the image.
2) Every file in full, each preceded by its path. No placeholders.
3) A manual TEST CHECKLIST for me (how to log in, switch persona, trigger step-up, inject a 503, reset data).
4) "Contract gaps" (if any).
Then STOP and wait for my next page prompt.

Seed modules and system permissions (keys are fixed; titles Persian):
users: system.users.view (step-up none), system.users.manage (required)
access: system.role.assign (required), system.permission.edit (required), system.role.manage (required), system.permission.manage (required), system.stepup.manage (required)
settings: system.settings.view (none), system.settings.edit (required)
audit: system.audit.view (none)
sessions_admin: system.sessions.view (none), system.sessions.manage (required)
reports: system.reports.view (none)
sessions: session.create (none, grantable)
sessions_admin (also): system.sessions.moderate (none)
gamification: system.points.manage (required), system.badges.manage (required)
messaging: system.inbox.send (required)
exports: system.data.export (required)
Role `developer` holds every permission (locked, read-only). Role `super_admin` holds: system.users.view, system.role.assign, system.permission.edit, system.settings.view, system.settings.edit, system.audit.view, system.sessions.view, system.reports.view, session.create (locked: users.view, role.assign, permission.edit, audit.view).
```

---

## PROMPTهای صفحه (به همین ترتیب، هر بار یکی)

هر PROMPT را جدا بفرست. همه با این جمله شروع می‌شوند که مدل قواعد پایه را فراموش نکند.

### صفحهٔ ۱ — داشبورد (نمای کلی)
```text
PAGE 1 — Overview dashboard ("داشبورد", route "/"). Keep every rule from the FOUNDATION prompt. Build ONLY this page.
Endpoints: H-01 (overview), H-80 (report overview), H-81 (registrations series), H-82 (sessions series), H-84 (leaderboard top 5).
UI: KPI tiles (users total/registered in range/active admins; sessions by status; attendance; evaluations + avg score; points awarded), trend charts (registrations, sessions created/held/attendance) with interval day / week (Saturday start) / month, date-range presets (today, 7d, 30d, this week Sat–Fri, this month, custom Jalali range, max 366 days), top-5 leaderboard, last 5 audit items (from H-01) linking to the audit page. Auto-refresh every 60 s only while the tab is visible. Skeletons; empty and error states.
Mock: compute every number from the mock tables (no hard-coded figures); respect the range and interval; bucket in Asia/Tehran.
Output only new/changed files + a manual test checklist.
```

### صفحهٔ ۲ — کاربران (فهرست، ساخت، خروجی)
```text
PAGE 2 — Users list ("/users"). Keep all FOUNDATION rules. Build ONLY this page and the create-user dialog.
Endpoints: H-20 (search/filters/sort/paging), H-24 (create, Idempotency-Key), H-43 (server CSV export with the same filters; needs system.data.export + system.users.view; step-up capable).
UI: URL-synced filters (q name/phone, role incl. dynamic roles from H-10 + "none", direct grant, status active/disabled/deleted, created from/to Jalali, sort newest/oldest/name), page size 10/25/50, responsive table → cards on mobile, status chips, masked phones except on hover/detail, "export CSV" button (downloads the server CSV; show the file name), "new user" dialog: phone, first/last name, optional temporary password with generator + copy (show once, explain the user must change it at first login), optional roles/grants limited to what the actor may assign (anti-escalation: hide/disable roles whose permissions the actor lacks — use H-94).
Mock: implement filters/sort/paging exactly; PHONE_TAKEN conflict; the CSV export returns a real CSV Blob (BOM, formula-injection neutralised).
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۳ — جزئیات کاربر
```text
PAGE 3 — User detail ("/users/:id"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-21 detail, H-25 edit name/phone, H-26 enable/disable, H-27 soft delete (type-to-confirm), H-28 temporary password set/clear, H-29 force logout everywhere, H-50/H-51 devices & revoke, H-22 roles, H-23 direct grants, H-93 effective access (permissions with sources role/module/grant and step-up), H-52 memberships (sessions + roles + attendance count + evaluations + points), H-97 points summary + ledger (paged), H-98 manual points adjustment (+/−, reason; needs system.points.manage).
UI tabs: Overview · Access (roles/grants editors + effective-access explainer) · Sessions (memberships list linking to session detail) · Points & badges (badge shelf with images via the low image URL pattern, ledger table with reasons in Persian, adjust dialog) · Devices · Activity (H-40 filtered by targetType=user&targetId) · Danger zone.
Respect server CONFLICT reasons (SELF_PROTECTED, LAST_HOLDER, PHONE_TAKEN, USER_NOT_ACTIVE) and AUTH_FORBIDDEN for account-takeover protection (you cannot manage an account that has more permissions than you; developer accounts only by developers).
Mock: same rules incl. points floor 0 and badge revocation when total drops below a threshold.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۴ — دسترسی: ماتریس
```text
PAGE 4 — Access matrix ("/access/matrix"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-92 (modules + permissions + roles + step-up rules + version; ETag), H-12 (explicit permissions of a role), H-17 (whole-module grants of a role), H-94 (my effective access — to disable toggles I am not allowed to grant).
UI: matrix with roles as columns and permissions grouped by module as rows (collapsible module rows with a "grant whole module" toggle per role); cell states: explicit, inherited-from-module (distinct, not removable individually), locked (padlock), developer column read-only; sticky header/first column; on mobile a per-role accordion editor. Unsaved-changes bar with a diff summary; Save calls H-12/H-17 as needed. Proactively disable grants the actor doesn't hold (anti-escalation) but still handle AUTH_FORBIDDEN/LOCKED_PERMISSION from the server.
Mock: anti-escalation, locked permissions, developer immutable, module grants include future permissions.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۵ — دسترسی: نقش‌ها
```text
PAGE 5 — Roles ("/access/roles"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-10 list, H-13 create (key ^[a-z][a-z0-9_]{2,31}$, not "none"), H-14 detail, H-15 edit title/description, H-16 delete.
UI: cards/table with holder counts and "system" badges; create dialog with live key validation; delete blocked with explanation for system roles (SYSTEM_PROTECTED) and roles that still have holders (ROLE_IN_USE → link to /users?role=key). Developer role fully read-only.
Mock: same conflicts.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۶ — دسترسی: مجوزها و ماژول‌ها
```text
PAGE 6 — Permissions & modules ("/access/permissions", "/access/modules"). Keep all FOUNDATION rules. Build ONLY these pages.
Endpoints: H-11 permissions, H-85 create (key module.action, 2–4 lowercase segments; prefix "system." is reserved), H-86 edit (system permissions: title/description/stepUp/grantable only), H-87 delete (cascade warning listing impact), H-88 modules, H-89 create, H-90 edit (title, description, sort order), H-91 delete (MODULE_NOT_EMPTY, SYSTEM_PROTECTED).
UI: two tabs; permission table grouped by module with step-up default and grantable flags; module list with drag-free sort order editing (numeric), permission counts.
Mock: same rules; changing a permission's stepUp requires system.stepup.manage.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۷ — دسترسی: سیاست step-up و نقش‌های جلسه
```text
PAGE 7 — Step-up policy ("/access/step-up") + session-roles reference. Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-92 (data), H-18 (per role × permission: inherit / required / none; needs system.stepup.manage), H-48 (read-only matrix of session roles → in-session permissions).
UI: banner "توسعه‌دهنده برای هیچ اقدامی تأیید هویت مجدد لازم ندارد، جز تغییر رمز خودش"; role selector; per-module groups with tri-state controls showing the permission default and the EFFECTIVE result; bulk set per module; warning when relaxing a sensitive permission; a second tab "نقش‌های جلسه" rendering H-48 as a read-only table.
Mock: same.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۸ — جلسه‌ها: فهرست، ساخت، ویرایش
```text
PAGE 8 — Sessions list + create/edit ("/sessions", "/sessions/new", "/sessions/:id/edit"). Keep all FOUNDATION rules. Build ONLY these.
Endpoints: H-60 list (q, status, creatorId, from/to, includeDeleted, sort), H-62 create (creatorId optional — searchable user picker; Idempotency-Key), H-63 edit (draft/scheduled only), H-64 transition (one step forward; SESSION_INVALID_TRANSITION), H-65 soft delete.
Form fields per SessionInput: title, description, schedule (once: start/end; recurring: weekdays + time + duration; range: from/to + weekdays + time + duration) with Jalali pickers and Asia/Tehran handling, location label + optional https route URL, joinPolicy (request / open / invite_only), visibility (public / unlisted), capacity (empty = unlimited).
List shows counts (members, pending, managers — highlight sessions with 0 managers, occurrences), next start, status stepper.
Mock: same rules (once session auto-opens occurrence #1 on started; ended closes it).
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۹ — جزئیات جلسه: اعضا، استاد، پشتیبان، قرآن‌آموز
```text
PAGE 9 — Session detail: Info + Members ("/sessions/:id", tabs Info and Members). Keep all FOUNDATION rules. Build ONLY these tabs.
Endpoints: H-61 detail, H-66 members (filters status/role/q/userId), H-73 ADD MEMBERS (bulk up to 200; each item by userId (user picker using H-20) OR phone; roles teacher / session_supporter / quran_student; onExisting skip/merge/replace; createMissing with first/last name requires system.users.manage; per-item outcomes added/approved/merged/replaced/unchanged/created_and_added/not_found/not_active/full/failed), H-53 bulk approve/reject, H-67 approve/reject one, H-68 set roles incl. co-manager (LAST_HOLDER), H-69 remove (SESSION_MANAGER_PROTECTED → offer H-74), H-74 set/transfer session manager (previous: demote/remove/keep, transferCreator).
UI: role chips (مدیر، پشتیبان، معلم، قرآن‌آموز) with filters; an "افزودن عضو" sheet with two modes: search users, or paste many phone numbers (one per line, Persian digits ok) + role selector + onExisting; a result report table after submit; "تعیین مدیر" dialog; bulk-select pending requests to approve/reject; helper text: «مدیر به‌تنهایی نمی‌تواند ارزیابی کند؛ برای ارزیابی نقش معلم یا پشتیبان هم لازم است».
Mock: identical outcome semantics, capacity, LAST_HOLDER, inactive users.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۱۰ — جزئیات جلسه: نوبت‌ها، حضور، صف، ارزیابی
```text
PAGE 10 — Session detail: Occurrences · Attendance · Queue · Evaluations tabs. Keep all FOUNDATION rules. Build ONLY these tabs.
Endpoints: H-75 occurrences (live/closed, counts), H-70 attendance (occurrenceId, paging), H-76 mark present (bulk, reason; works on closed occurrences too), H-77 revoke attendance (−5 points, reason), H-71 queue (occurrenceId), H-78 next (expectCurrentItemId → QUEUE_STATE_CHANGED), H-79 move up/down/skip/remove (expectPosition; Idempotency-Key), H-72 evaluations (occurrenceId, includeVoid), H-95 void evaluation (reason), H-96 correct scores (reason), H-44 export CSV (members/attendance/evaluations).
UI: occurrence selector (default live, else latest) shared by the tabs; attendance roster with present/absent, multi-select "ثبت حضور", per-row "لغو حضور"; live queue board (current, waiting with drag-free up/down buttons, done) polling every 5 s while visible; evaluations table (voice/tone/tajweed/score/points, evaluator, void badge) with correct/void dialogs that show the points effect.
Mock: +5 once per (occurrence,user), reversals floor at 0, badge revoke, queue concurrency precondition.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۱۱ — نشان‌ها
```text
PAGE 11 — Badges ("/badges"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-32 list, H-33 create (key, title, description, threshold points, active, sort order; max 50 → LIMIT_REACHED), H-34 edit, H-35 delete (revoked from all holders — confirm), H-36 upload image (png/webp/jpeg ≤ 200 KB, ≤ 1024 px; read the file in the browser, check size/type/dimensions BEFORE upload, send base64), H-37 remove image.
UI: grid of badge cards (image, title, threshold, holders, active switch), editor sheet with live preview, threshold helper («با رسیدن امتیاز کاربر به این عدد نشان داده می‌شود و اگر کمتر شود پس گرفته می‌شود»).
Mock: store images as data URLs inside the mock DB; enforce the same validations.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۱۲ — پیام همگانی
```text
PAGE 12 — Announcements ("/announcements"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-41 send (audience: all / specific users (user picker, ≤1000) / system role / members of a session optionally filtered by session roles; title ≤120, body ≤500, optional ref), H-42 history, H-46 detail with delivery/read stats.
UI: composer with audience builder and a recipients estimate where possible, preview of how the inbox item looks, confirmation for audience=all; history table with status (queued/sending/done/failed) and stats.
Mock: simulate asynchronous delivery (status moves queued → sending → done over a few seconds) and read counts.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۱۳ — گزارش‌ها
```text
PAGE 13 — Reports ("/reports"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-80 overview, H-81 registrations, H-82 sessions, H-83 OTP (requested/verified), H-84 leaderboard (limit).
UI: range + interval controls, chart + accessible table toggle per report, CSV download per report (client-side from the loaded data, BOM + injection-safe).
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۱۴ — گزارش اقدام‌ها (audit)
```text
PAGE 14 — Audit log ("/audit"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-40 (action exact/prefix, q, actorId, targetType user/role/settings/session/permission/module/badge/announcement, targetId, from/to), H-45 server CSV export.
UI: filters, expandable rows (summary + non-sensitive meta as key/value), links to targets, export. Never render HTML from data.
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۱۵ — تنظیمات
```text
PAGE 15 — Settings ("/settings"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-30, H-31 (optimistic `version`; VERSION_MISMATCH → "reload latest" flow).
UI: evaluation weights (sum must be exactly 100; live validator + donut preview), feature flags maintenance_mode (strong confirmation) and registration_open. Do NOT show badge thresholds (deprecated; badges page replaces them).
Output only new/changed files + manual test checklist.
```

### صفحهٔ ۱۶ — حساب من
```text
PAGE 16 — My account ("/account"). Keep all FOUNDATION rules. Build ONLY this page.
Endpoints: H-02 account, H-03 edit my name, H-04 change my password (ALWAYS step-up, even for developers; the forced-change flow with currentPassword already exists from the foundation), H-05/H-06/H-07 my devices + revoke + revoke others, H-94 my effective access (read-only, with step-up info).
Output only new/changed files + manual test checklist.
```


---

## PROMPT اصلاح (هر وقت لازم شد؛ متن داخل <> را خودت پر کن)

```text
FIX REQUEST for page <نام صفحه>:
- What I did: <مراحل>
- What happened: <رفتار فعلی / متن خطا / اسکرین‌شات پیوست>
- What I expect: <رفتار درست>
Rules: change only what is needed for this fix; keep the mock and the API-shaped types consistent with the attached reference; do not touch other pages; output only the changed files in full; then give me a 3–6 step manual test checklist for this fix.
```

### PROMPT تغییر/افزودن قابلیت
```text
CHANGE REQUEST for page <نام صفحه>: <چه چیزی اضافه/عوض شود>.
Use only endpoints/fields that exist in the attached API reference (if something is missing, say so under "Contract gaps" and do NOT invent it). Extend the mock to emulate the server rules for anything you touch. Output only changed files in full + a manual test checklist.
```

---

## PROMPT FINAL — اتصال به API واقعی و حذف کامل موک

```text
FINAL STEP — connect the dashboard to the REAL backend and remove every trace of the mock. I re-attach the latest `28-dashboard-api-reference.md`; it is authoritative.

A) Real HTTP implementation
1. Create `src/api/http/` implementing the SAME `AdminApi` interface (one function per endpoint id, exact method + path from the reference).
   - Origins from env (origin only, no path, no trailing slash): `VITE_API_LOW_URL` (paths `/c/v1/...`, auth L-xx only) and `VITE_API_HIGH_URL` (paths `/s/v1/...`). No other host, ever.
   - Headers on every call: `X-Isra-Client: web-admin`, `X-Isra-Client-Version: <app version>`, `X-Request-Id: <uuid v4>`, `Accept: application/json`; `Content-Type: application/json` only with a body; `Authorization: Bearer <access token>` except on L-01, L-02, L-03, L-04; `Idempotency-Key` when `opts.idempotencyKey` is set (generated ONCE per user action, re-used on the single automatic network retry); `X-Step-Up-Token` when a valid step-up token is cached (writes only) or passed.
   - LOW (auth) calls use `credentials: 'include'` (refresh token is an HttpOnly cookie the browser handles; JS never sees it). HIGH calls don't need cookies.
   - Envelope: success `{ success: true, data, meta }` ⇒ return `data` (lists: `{ items: data, page, pageSize, total }` from `meta`); error `{ success: false, error: { code, message, details }, meta: { requestId } }` ⇒ throw `ApiError`. Non-JSON 5xx ⇒ `SERVICE_UNAVAILABLE` with the friendly Persian message.
   - 401 (AUTH_REQUIRED / AUTH_TOKEN_EXPIRED / AUTH_TOKEN_INVALID / AUTH_PERM_STALE): ONE single-flight silent refresh (`POST /c/v1/auth/refresh`, body `{}`) then replay; refresh failure ⇒ clear session ⇒ login with "session expired". Use SEPARATE retry flags for refresh, step-up and network retry so a request can be refreshed AND stepped-up.
   - AUTH_STEP_UP_REQUIRED ⇒ clear cached step-up token, run the step-up dialog (L-06/L-07), replay once. Developers: exempt except H-04 (server-enforced; UI mirrors `GET /system/me` `stepUpExempt` + `stepUp`).
   - 429: honour `Retry-After` / `details.retryAfterSec` (countdown; auto-retry GET once). Timeout 15 s (30 s for exports). Auto-retry only idempotent GETs on network error/502/503/504 (max 2, backoff + jitter). Abort via AbortSignal.
   - ETag: for GETs keep `{etag, data}` per URL in memory, send `If-None-Match`, use cached data on 304; CLEAR this cache on logout/session change.
   - Proactive token refresh ~60 s before `accessExpiresIn`; refresh on tab focus if near expiry; BroadcastChannel logout sync.
2. `src/api/index.ts` ⇒ `export const api: AdminApi = createHttpApi()`.

B) Remove the mock completely
1. Delete `src/api/mock/` entirely and every import of it, the DEV TOOLBAR, persona switcher, OTP hint `11111`, seed data, fake latency/error injection and any `isMock` branches.
2. Add a tiny startup cleanup (keep it in production) that deletes any leftover `isra.mock.*` keys from localStorage so test data never lingers in users' browsers.
3. The only localStorage keys allowed in production: `isra.admin.session` (non-secret hint), `isra.admin.deviceId`, theme preference, UI preferences (table density, sidebar collapsed). Tokens: memory only.
4. Search the whole project and confirm (show me the result) that none of these strings remain outside comments/tests: `mock`, `seed`, `11111`, `Passw0rd`, `faker`, `localStorage.setItem('isra.mock`.

C) Production hardening
1. `vite.config.ts`: `base` normalised from `VITE_BASE_PATH` ("/s" ⇒ "/s/"), `sourcemap: 'hidden'`, sensible manualChunks (react+router+query vendor; radix+icons ui).
2. PWA: precache app shell only; `navigateFallback` = `${BASE_URL}index.html`; runtime caching ONLY for fonts/images from the same origin; NEVER cache anything from the API origins; prompt-based update toast.
3. No inline scripts; no `eval`; CSP-ready (`script-src 'self'`). README must document the CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' <LOW> <HIGH>; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`.
4. Every asset/link uses `import.meta.env.BASE_URL` (no absolute "/logo.svg" or "/fonts/..." in TSX).
5. `.env.example`: `VITE_BASE_PATH=/s`, `VITE_API_LOW_URL=https://capi.israapp.ir`, `VITE_API_HIGH_URL=https://sapi.israapp.ir`. No other variables (no GEMINI keys, no APP_URL).
6. `package.json`: name `@isra/web-admin-v2`, scripts `dev`, `build`, `preview`, `typecheck` (tsc --noEmit), `lint`, `test`; remove unused dependencies.
7. Tests: replace mock-based tests with tests of the HTTP layer using a fetch stub (refresh single-flight, 401 replay, step-up replay keeping the same Idempotency-Key, 429, 503 mapping, ETag 304, logout clears ETag cache), plus the pure utils tests.

D) Output
1. List of deleted files, then every changed/new file in full.
2. The grep proof from B4.
3. Bundle size table from `vite build` (gzip) and a note if any budget is exceeded.
4. A deploy checklist for me (build command: `VITE_BASE_PATH=/s VITE_API_LOW_URL=https://capi.israapp.ir VITE_API_HIGH_URL=https://sapi.israapp.ir npm run build`).
5. "Contract gaps" (if any).
```
