# Security Audit Report

**Project:** Isra (اسراء) — pnpm/Turborepo monorepo (3× NestJS services, SvelteKit web-main/web-admin, Android stubs)
**Audit ID:** 8c09ce4601283b1b9aca5087ab60e86799d753009a5b7529705c4a2b50055ec8
**Skill version:** 2.6.1
**Generated:** 2026-10-04T09:34:08Z
**Scope:** full — 8 partitions at full depth, 4 inventory-only
**Total runtime:** not measured (single interactive session)

## Executive Summary

**AUDIT GATE: PASSED** — no unresolved governance failures (R4/L1–L3); severity gate converged (7 escalations applied, re-run clean). No prior baseline exists, so R4/L1–L3 had nothing to compare against (first run).

> **خلاصهٔ فارسی:** هیچ آسیب‌پذیری قابل بهره‌برداری مستقیم از اینترنت (بدون پیش‌نیاز) پیدا نشد؛ هستهٔ احراز هویت، RBAC و IDOR محکم است. مهم‌ترین مورد: **secret مشترک سرویس‌به‌سرویس (`INTERNAL_SHARED_SECRET`)** که تنها نگهبان مسیرهای internal است و scope/هویت فرستنده ندارد؛ مهاجمی که آن را بدست آورد می‌تواند نقش ادمین جعل کند. ارتقای «CRITICAL» توسط ماشین‌حساب مسیرها محاسبه شده و **مشروط** به لو رفتن/ماندن secret پیش‌فرض است (بخش «Severity Gate» را ببینید). موارد دیگر عمدتاً MEDIUM/LOW: pin نبودن actions، `npm install` بدون lockfile روی هاست، open-redirect در `safeNext`.

| Severity | Count |
|---|---:|
| CRITICAL | 7 |
| HIGH | 0 |
| MEDIUM | 7 |
| LOW | 35 |
| INFO | 2 |

Findings counted: §A + §B + §C = **51** (leads, refuted rows and annex legs excluded).

**Evidence mix:** 51 agent judgement, 0 external scanner, 0 governance — plus 0 heuristic-inventory leads (not findings, §7.2b); 56 mechanical/other rows were *refuted* on adversarial review and sit under "What Is Sound".
**Confidence mix** (annotation only): 9 CONFIRMED, 20 LIKELY, 22 POSSIBLE.

**Top risks**
1. Single shared `INTERNAL_SHARED_SECRET` (no sender identity / event-type scope) guards every internal event route on all three services — forgeable `system.role.changed` → admin claims (TS-001, TS-1, services-api-*:auth:*).
2. Supply-chain/deploy hygiene: mutable GitHub Action tags in a workflow holding SSH secrets; production host runs lockfile-less `npm install` (SC-1, SC-2, DEP-001/002).
3. api-high/mid accept access JWTs of revoked sessions for up to the access TTL (revocation lives only in api-low) (token_scope:0001).

**Not found (stated plainly):** zero CRITICAL/HIGH findings were *asserted* by deep-dive analysts; no SQL injection (all queries parameterised), no committed secrets (git-history regex sweep: 0 hits for known key patterns; `.env.example` only), no IDOR/BOLA on user-scoped collections, no client-side secrets.

**CWE Top 25 (2025) hits / exploit-likely callout:** no dependency CVE hits (pnpm audit: 0 advisories), so the EPSS/KEV callout is empty.

## How to read this report

| Section | Evidence class | Last measured precision |
|---|---|---|
| §A Judgement findings | agent_judgement | not yet measured |
| §B Scanner findings | external_scanner | not yet measured |
| §C Governance | governance | not yet measured |
| Annex leads | heuristic_inventory | not yet measured |

## Partition Risk Ranking

| Partition | Depth | Findings (A+B+C) |
|---|---|---:|
| services-api-low | full | 14 |
| services-api-high | full | 10 |
| services-api-mid | full | 12 |
| apps-web-main | full | 2 |
| apps-web-admin | full | 3 |
| packages-jwt-verify | full | 0 |
| ci-and-deploy | full | 10 |
| packages-api-types | full | 0 |
| android-apps | inventory-only | 0 |
| e2e | inventory-only | 0 |
| root-config | inventory-only | 0 |
| claude-dev-tooling | inventory-only | 0 |

## Findings Index

| Severity | Evidence | § | ID | Title | Location |
|---|---|---|---|---|---|
| CRITICAL | agent_judgement | A | TS-001 | Single unscoped INTERNAL_SHARED_SECRET authorizes every internal event type from any caller | `services/api-low/src/internal/internal.guard.ts:34` |
| CRITICAL | agent_judgement | A | TS-1 | Internal shared secret unscoped: any holder can post any inbound event type incl. settings | `services/api-mid/src/internal/internal.guard.ts:43` |
| CRITICAL | agent_judgement | A | services-api-high:auth:0001 | Shared INTERNAL_SHARED_SECRET is sole guard of admin internal event ingest | `services/api-high/src/internal/internal.guard.ts:34` |
| CRITICAL | agent_judgement | A | services-api-low:auth:0002 | Single shared secret lets any internal peer forge system.role.changed and mint admin claims | `services/api-low/src/internal/events.service.ts:72` |
| CRITICAL | agent_judgement | A | services-api-mid:auth:0001 | Internal events endpoint does not bind event type to sender; one shared secret grants all event type | `services/api-mid/src/internal/internal.controller.ts:59` |
| CRITICAL | agent_judgement | A | services-api-mid:auth:0002 | Documented dev internal secret satisfies the env length check and is not rejected in production | `services/api-mid/src/config/env.ts:32` |
| CRITICAL | agent_judgement | A | services-api-mid:auth:0006 | Production JWKS transport check is a substring match | `services/api-mid/src/config/env.ts:48` |
| MEDIUM | agent_judgement | A | DEP-001 | GitHub Actions referenced by mutable major tag, not commit SHA | `.github/workflows/ci.yml:38` |
| MEDIUM | agent_judgement | A | DEP-002 | Production host runs unlocked 'npm install' (semver ranges, lifecycle scripts enabled) at deploy tim | `scripts/deploy-ssh.sh:191` |
| MEDIUM | agent_judgement | A | INJ-WM-001 | safeNext open-redirect guard bypassable with tab/newline after leading slash | `apps/web-main/src/lib/utils/nav.ts:4` |
| MEDIUM | agent_judgement | A | SC-1 | Mutable action tags in deploy workflow that holds SSH secrets | `.github/workflows/deploy.yml:32` |
| MEDIUM | agent_judgement | A | SC-2 | Production host runs lockfile-less npm install, bypassing pnpm-lock integrity | `scripts/deploy-ssh.sh:60` |
| MEDIUM | agent_judgement | A | services-api-high:token_scope:0001 | api-high accepts access JWTs of revoked sessions (no session-status check) | `services/api-high/src/common/guards/endpoint.guard.ts:54` |
| MEDIUM | agent_judgement | A | services-api-low:auth:0001 | Global daily SMS budget can be exhausted by anonymous callers, locking all OTP login | `services/api-low/src/auth/otp.service.ts:57` |
| LOW | agent_judgement | A | CS-HIGH-1 | Overview (H-01) returns last 5 audit entries without system.audit.view | `services/api-high/src/domain/overview.service.ts:52` |
| LOW | agent_judgement | A | CS-MID-1 | Snapshot refresh uses fixed LIMIT 500 with no ORDER BY over rows that stay in the window | `services/api-mid/src/domain/sessions.service.ts:193` |
| LOW | agent_judgement | A | DEP-003 | Deploy workflow is dispatchable from any ref and does not wait for CI; environment gate is optional | `.github/workflows/deploy.yml:64` |
| LOW | agent_judgement | A | DEP-004 | rsync --delete to unvalidated, repo-variable destination paths | `scripts/deploy-ssh.sh:159` |
| LOW | agent_judgement | A | SC-3 | turbo devDependency uses the floating tag 'latest' | `package.json:13` |
| LOW | agent_judgement | A | SS-1 | Dev SMS provider logs full OTP code | `services/api-low/src/sms/console.provider.ts:10` |
| LOW | agent_judgement | A | SS-CI-1 | Throwaway MySQL credentials hardcoded in CI workflow (test fixtures) | `.github/workflows/ci.yml:22` |
| LOW | agent_judgement | A | TS-002 | Refresh rotation has no absolute session lifetime; a refresh chain can live indefinitely | `services/api-low/src/auth/session.service.ts:125` |
| LOW | agent_judgement | A | TS-003 | Session revocation is enforced only in api-low; access JWT remains valid on mid/high until exp | `services/api-low/src/auth/token.service.ts:60` |
| LOW | agent_judgement | A | apps-web-admin:auth:0001 | Step-up token cache survives logout / session reset | `apps/web-admin/src/lib/auth/auth.svelte.ts:125` |
| LOW | agent_judgement | A | apps-web-admin:auth:0002 | Admin CSP allows script-src 'unsafe-inline' while access token lives in JS memory | `apps/web-admin/scripts/gen-htaccess.mjs:15` |
| LOW | agent_judgement | A | apps-web-main:mitm:0001 | API base URLs and CSP fall back to plaintext http://localhost when env unset | `apps/web-main/src/lib/api/config.ts:10` |
| LOW | agent_judgement | A | cfg-0001 | No dependabot/renovate, CODEOWNERS or SECURITY.md in repository | `.github/workflows/ci.yml:1` |
| LOW | agent_judgement | A | cfg-0002 | web-admin static SPA CSP permits script-src unsafe-inline | `scripts/gen-htaccess.mjs:15` |
| LOW | agent_judgement | A | services-api-high:auth:0002 | BOOTSTRAP_DEVELOPER_PHONE keeps granting developer on every matching registration, contradicting doc | `services/api-high/src/internal/events.service.ts:75` |
| LOW | agent_judgement | A | services-api-high:auth:0003 | jwtVerify does not require exp, so expiry is optional for access and step-up tokens | `services/api-high/src/auth/jwt-verifier.ts:28` |
| LOW | agent_judgement | A | services-api-high:auth:0004 | Step-up token is replayable for its whole TTL across all step-up endpoints | `services/api-high/src/auth/jwt-verifier.ts:50` |
| LOW | agent_judgement | A | services-api-high:auth:0005 | Global EndpointGuard fails open for handlers without @Route metadata | `services/api-high/src/common/guards/endpoint.guard.ts:32` |
| LOW | agent_judgement | A | services-api-high:auth:0006 | LOW_JWKS_URL (trust root for every admin token) is not required to be https in production | `services/api-high/src/config/env.ts:26` |
| LOW | agent_judgement | A | services-api-high:auth:0007 | Access JWT sid is not checked against session revocation; logout/revoked sessions stay valid for the | `services/api-high/src/auth/jwt-verifier.ts:35` |
| LOW | agent_judgement | A | services-api-high:token_scope:0002 | Step-up token is not purpose-bound or single-use; any step-up satisfies all admin step-up endpoints | `services/api-high/src/auth/jwt-verifier.ts:46` |
| LOW | agent_judgement | A | services-api-low:auth:0003 | Anonymous attacker can lock a victim's password login with a per-phone counter | `services/api-low/src/auth/auth.service.ts:70` |
| LOW | agent_judgement | A | services-api-low:auth:0004 | Refresh and access issuance never re-check users.status after login | `services/api-low/src/auth/session.service.ts:99` |
| LOW | agent_judgement | A | services-api-low:auth:0005 | Global guard fails open for handlers lacking an @Route marker | `services/api-low/src/common/guards/endpoint.guard.ts:44` |
| LOW | agent_judgement | A | services-api-low:crypto:0001 | Argon2 cost env floors permit sub-OWASP parameters | `services/api-low/src/config/env.ts:58` |
| LOW | agent_judgement | A | services-api-low:crypto:0002 | Committed example env contains predictable OTP_PEPPER and INTERNAL_SHARED_SECRET with no production  | `services/api-low/.env.example:19` |
| LOW | agent_judgement | A | services-api-low:deployment:0001 | NODE_ENV defaults to development; all production fail-fast guards are keyed on NODE_ENV==='productio | `services/api-low/src/config/env.ts:12` |
| LOW | agent_judgement | A | services-api-low:mitm:0001 | Production env validation does not require https for FARAZ_BASE_URL / INTERNAL_URL_* | `services/api-low/src/config/env.ts:51` |
| LOW | agent_judgement | A | services-api-mid:auth:0003 | Global EndpointGuard fails open for handlers without @Route metadata | `services/api-mid/src/common/guards/endpoint.guard.ts:32` |
| LOW | agent_judgement | A | services-api-mid:auth:0004 | Internal guard failure lockout is keyed on IP and also blocks callers presenting the valid token | `services/api-mid/src/internal/internal.guard.ts:30` |
| LOW | agent_judgement | A | services-api-mid:auth:0005 | queue.turned socket broadcast discloses the current student's userId to every room member | `services/api-mid/src/domain/queue.service.ts:346` |
| LOW | agent_judgement | A | services-api-mid:idor:0002 | refreshSnapshots fixed-size unordered scan can be starved by sessions whose next start is permanentl | `services/api-mid/src/domain/sessions.service.ts:193` |
| LOW | agent_judgement | A | services-api-mid:mitm:0001 | Production env validation does not require https for INTERNAL_URL_LOW | `services/api-mid/src/config/env.ts:47` |
| LOW | agent_judgement | A | services-api-mid:mitm:0002 | LOW_JWKS_URL https check bypassable via substring match on loopback | `services/api-mid/src/config/env.ts:48` |
| LOW | agent_judgement | A | services-api-mid:mitm:0003 | MySQL connection has no TLS option or remote-host guard | `services/api-mid/src/db/data-source.ts:14` |
| INFO | agent_judgement | A | SC-4 | Dependency audit gate only covers prod deps at high severity and is absent from deploy | `.github/workflows/ci.yml:56` |
| INFO | agent_judgement | A | services-api-low:crypto:0003 | SHA-1 used only for ETag derivation (non-security) | `services/api-low/src/common/envelope.interceptor.ts:51` |

## Findings

## § A — Judgement findings (agent_judgement)

### CRITICAL

#### TS-001 — Single unscoped INTERNAL_SHARED_SECRET authorizes every internal event type from any caller
- **Severity:** CRITICAL (asserted MEDIUM, computed CRITICAL via R3) · **Confidence:** LIKELY · **CWE:** CWE-863 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/internal/internal.guard.ts:34` · **Partition:** services-api-low · **Category:** token_scope
- InternalGuard accepts any caller holding the single secret shared by api-low/mid/high (internal.guard.ts:33-34); no per-caller identity or per-event-type scope. EventsService (events.service.ts:55,72,84) honours inbox.message.created, system.role.changed and system.settings.changed from any holder, although only api-high should emit system.*. A holder (e.g. compromised internet-facing api-mid) can force maintenance_mode=true (503 on low), write user_claims roles/grants (JWT perms; mid/high ignore them today) and inject inbox messages to any user. Mitigations: >=32 char secret, constant-time compare, in-memory per-IP failure limit, optional INTERNAL_ALLOWED_IPS (default empty).
- **Attack scenario:** Attacker compromises api-mid (public Socket.IO host), reads INTERNAL_SHARED_SECRET from its env, POSTs system.settings.changed {maintenance_mode:true,version:large} to /c/internal/v1/events on api-low; version only moves forward so admins cannot easily revert without a higher version.
- **Suggested fix** (inferred): Use per-pair secrets (or signed service JWTs with aud/scope claims) and an allowlist of event types per caller in InternalGuard/EventsService (e.g. accept system.* only from the high credential). Make INTERNAL_ALLOWED_IPS mandatory in production.
- **Fix surface (sibling sites):** `services/api-mid/src/internal/internal.guard.ts:34`; `services/api-high/src/internal/internal.guard.ts:34`

#### TS-1 — Internal shared secret unscoped: any holder can post any inbound event type incl. settings
- **Severity:** CRITICAL (asserted MEDIUM, computed CRITICAL via R3) · **Confidence:** LIKELY · **CWE:** CWE-863 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/internal/internal.guard.ts:43` · **Partition:** services-api-mid · **Category:** token_scope
- InternalGuard accepts one static INTERNAL_SHARED_SECRET (x-internal-token) for all /o/internal/v1 routes. It carries no caller identity or scope. EventsService.handle (events.service.ts:34-54) dispatches on the attacker-controlled body field type, so a holder of the secret (api-low, or anyone who obtains it) can submit system.settings.changed, which is documented as high-only, to change maintenance_mode (global DoS for all non-internal endpoints) and eval weights/badge thresholds. It can also forge user.* events. Token scope is not enforced at use.
- **Suggested fix** (inferred): Use per-caller secrets (or signed service JWTs with a 'src' claim) and allowlist event types per caller in EventsService.handle (low: user.*, high: system.settings.changed).

#### services-api-high:auth:0001 — Shared INTERNAL_SHARED_SECRET is sole guard of admin internal event ingest
- **Severity:** CRITICAL (asserted MEDIUM, computed CRITICAL via R3) · **Confidence:** LIKELY · **CWE:** CWE-287 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/internal/internal.guard.ts:34` · **Partition:** services-api-high · **Category:** auth
- InternalGuard authenticates /s/internal/v1/events with one static X-Internal-Token, documented as identical across api-low, api-mid and api-high. INTERNAL_ALLOWED_IPS defaults to empty (env.ts:34), is not required in production, and on cPanel the route is public. Leak of the secret from the lower-trust api-low/api-mid lets an attacker forge user.registered/profile.updated events: rewrite directory names/phones used as audit labels, and pre-register a row for BOOTSTRAP_DEVELOPER_PHONE before the real developer logs in. Brute force is throttled (10 fails/min/IP); risk is reuse, not guessing.
- **Suggested fix** (inferred): Use a distinct secret per service pair (or per-direction signed service JWT), make INTERNAL_ALLOWED_IPS mandatory in production env validation, and ideally block /s/internal at LiteSpeed.
- **Fix surface (sibling sites):** `services/api-low/src/internal/internal.guard.ts:34`; `services/api-mid/src/internal/internal.guard.ts:33`

#### services-api-low:auth:0002 — Single shared secret lets any internal peer forge system.role.changed and mint admin claims
- **Severity:** CRITICAL (asserted MEDIUM, computed CRITICAL via R3) · **Confidence:** LIKELY · **CWE:** CWE-863 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/internal/events.service.ts:72` · **Partition:** services-api-low · **Category:** auth
- InternalGuard authenticates callers by one INTERNAL_SHARED_SECRET that docs-v2/25-deploy-cpanel.md:12 requires identical across low, mid and high. EventsService.handle() then accepts any event type from any holder: system.role.changed (events.service.ts:72-83) upserts user_claims roles/grants for an arbitrary userId, and SessionService.claims()/issueAccess() (session.service.ts:142-151) copy them into the next RS256 access token that mid and high trust. No per-sender identity or per-event-type authorization exists, so compromise of api-mid (or a leaked secret from any host; endpoints are public per internal.guard.ts:11-16) escalates to system admin everywhere. Shared-secret auth is a documented lock, but no doc ratifies mid emitting role events, so only this narrow defect is filed.
- **Suggested fix** (inferred): Use a distinct secret (or mTLS/signed JWT with a service identity claim) per sender and allow-list event types per sender in EventsService.handle: only the high sender may submit system.role.changed and system.settings.changed; mid may only submit inbox.message.created.

#### services-api-mid:auth:0001 — Internal events endpoint does not bind event type to sender; one shared secret grants all event types
- **Severity:** CRITICAL (asserted MEDIUM, computed CRITICAL via R3) · **Confidence:** POSSIBLE · **CWE:** CWE-863 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/internal/internal.controller.ts:59` · **Partition:** services-api-mid · **Category:** auth
- POST /o/internal/v1/events is guarded only by InternalGuard with one INTERNAL_SHARED_SECRET shared by low, mid, high (docs-v2/25-deploy-cpanel.md:12). EventsService.handle dispatches on e.type without checking the caller, so any secret holder (e.g. a compromised api-low) can send system.settings.changed (events.service.ts:48) and rewrite weights, thresholds and the maintenance flag. SettingsChanged.version has no upper bound (settings.service.ts:16) and apply() accepts only higher versions (:51), so a huge version pins settings permanently. Internal paths are public on cPanel (internal.guard.ts:12).
- **Attack scenario:** Attacker with the shared secret (leak from any of 3 services) POSTs system.settings.changed with maintenance_mode=true and version=9007199254740991, taking api-mid offline for non-internal routes and blocking high from ever changing settings again.
- **Suggested fix** (inferred): Use a distinct secret per directed service pair (or per-caller header identity) and enforce an allowed-type map per caller in EventsService; cap SettingsChanged.version; set INTERNAL_ALLOWED_IPS in production.

#### services-api-mid:auth:0002 — Documented dev internal secret satisfies the env length check and is not rejected in production
- **Severity:** CRITICAL (asserted LOW, computed CRITICAL via R3) · **Confidence:** POSSIBLE · **CWE:** CWE-798 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/config/env.ts:32` · **Partition:** services-api-mid · **Category:** auth
- INTERNAL_SHARED_SECRET only needs min(32) chars (env.ts:32). services/api-mid/.env.example:23 (and api-low/api-high examples) ship the literal 'dev-internal-secret-dev-internal-1234' (38 chars), which passes validation and the superRefine production checks (env.ts:44-52) do not reject it. If an operator copies the example to production, the public (cPanel) /o/internal/v1/* routes are open to anyone who reads the repository.
- **Attack scenario:** Anyone who read the repo calls /o/internal/v1/events with X-Internal-Token: dev-internal-secret-dev-internal-1234 against a misconfigured production host.
- **Suggested fix** (inferred): In superRefine, reject values starting with 'dev-' or equal to the example value when NODE_ENV=production; ship the example with an empty value.

#### services-api-mid:auth:0006 — Production JWKS transport check is a substring match
- **Severity:** CRITICAL (asserted LOW, computed CRITICAL via R3) · **Confidence:** POSSIBLE · **CWE:** CWE-345 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/config/env.ts:48` · **Partition:** services-api-mid · **Category:** auth
- The production guard accepts any LOW_JWKS_URL that merely contains '127.0.0.1' or 'localhost' anywhere in the string (env.ts:48), e.g. http://evil.example/?x=localhost, permitting plaintext JWKS fetch whose compromise lets an attacker mint tokens accepted by mid (jwt-verifier.ts:33). Operator-controlled config only, so exploit needs a misconfiguration or MITM.
- **Attack scenario:** Operator mis-sets an http JWKS URL containing 'localhost' in the query; on-path attacker serves a forged JWKS.
- **Suggested fix** (inferred): Parse with new URL() and compare hostname to 127.0.0.1/localhost/::1 exactly when protocol is http.

### MEDIUM

#### DEP-001 — GitHub Actions referenced by mutable major tag, not commit SHA
- **Severity:** MEDIUM · **Confidence:** CONFIRMED · **CWE:** CWE-829 · **Attacked:** not_attempted
- **Location:** `.github/workflows/ci.yml:38` · **Partition:** ci-and-deploy · **Category:** deployment
- All third-party/first-party actions use floating tags (actions/checkout@v4, pnpm/action-setup@v4, actions/setup-node@v4). deploy.yml runs the same actions in a job holding SSH_PRIVATE_KEY/SSH_HOST/SSH_USER secrets (production environment), so a retagged or compromised action (notably pnpm/action-setup, a non-GitHub-owned action) executes in the job that builds the artifacts later rsynced to production.
- **Suggested fix** (inferred): Pin each uses: to a full 40-char commit SHA with a trailing '# v4.x.y' comment; add a .github/dependabot.yml github-actions ecosystem entry to keep SHAs current.
- **Fix surface (sibling sites):** `.github/workflows/ci.yml:41`; `.github/workflows/ci.yml:42`; `.github/workflows/deploy.yml:88`; `.github/workflows/deploy.yml:89`; `.github/workflows/deploy.yml:90`

#### DEP-002 — Production host runs unlocked 'npm install' (semver ranges, lifecycle scripts enabled) at deploy time
- **Severity:** MEDIUM · **Confidence:** CONFIRMED · **CWE:** CWE-829 · **Attacked:** not_attempted
- **Location:** `scripts/deploy-ssh.sh:191` · **Partition:** ci-and-deploy · **Category:** deployment
- pack-service.mjs writes a production package.json from services/*/package.json dependencies (caret ranges, e.g. "@nestjs/core": "^12.1.1") and ships no lockfile (pnpm-lock.yaml and package-lock.json are not packaged). deploy-ssh.sh then runs 'npm install --omit=dev --no-audit --no-fund' on the cPanel host without --ignore-scripts. Production therefore resolves transitive/direct versions at deploy time, different from the versions CI tested and pnpm-audited, and any dependency (or newly published malicious version within range) can run install scripts in the hosting account, which holds all three services' code and env (DB passwords, JWT private key in cPanel env).
- **Suggested fix** (inferred): Ship a lockfile with the package (generate package-lock.json from the pnpm-resolved set in pack-service.mjs) and use 'npm ci --omit=dev --ignore-scripts' on the host; allow-list native builds (@node-rs/argon2 ships prebuilt binaries).

#### INJ-WM-001 — safeNext open-redirect guard bypassable with tab/newline after leading slash
- **Severity:** MEDIUM · **Confidence:** LIKELY · **CWE:** CWE-601 · **Attacked:** not_attempted
- **Location:** `apps/web-main/src/lib/utils/nav.ts:4` · **Partition:** apps-web-main · **Category:** injection
- safeNext() only rejects values not starting with '/', or starting with '//' or '/\'. A value such as '/\t/evil.com' (query ?next=%2F%09%2Fevil.com) passes, but URL parsing strips tab/LF/CR so new URL('/\t/evil.com', origin) resolves to https://evil.com/ (verified with node). The value is passed to goto() in auth/+layout.svelte:22,25, auth/onboarding/+page.svelte:34, auth/password/+page.svelte:42, auth/otp/+page.svelte:54; SvelteKit's goto falls back to native_navigation (location.href=...) for cross-origin URLs (node_modules/@sveltejs/kit/src/runtime/client/client.js:171). Result: post-login redirect to an attacker origin from a crafted login link. Existing nav.test.ts does not cover control characters.
- **Attack scenario:** Attacker sends victim https://isra/auth/phone?next=%2F%09%2Fevil.com; after OTP login the victim is navigated to evil.com (phishing page imitating Isra).
- **Suggested fix** (inferred): Parse with new URL(next, 'http://x') and require origin === 'http://x' and pathname starting with '/', or reject any next containing /[\u0000-\u001f\\]/ ; apply to both web-main and web-admin nav.ts.
- **Fix surface (sibling sites):** `apps/web-admin/src/lib/utils/nav.ts:4`

#### SC-1 — Mutable action tags in deploy workflow that holds SSH secrets
- **Severity:** MEDIUM · **Confidence:** CONFIRMED · **CWE:** CWE-1104 · **Attacked:** not_attempted
- **Location:** `.github/workflows/deploy.yml:32` · **Partition:** ci-and-deploy · **Category:** supply_chain
- The production deploy workflow (secrets.SSH_PRIVATE_KEY, SSH_HOST) uses actions/checkout@v4, pnpm/action-setup@v4 and actions/setup-node@v4: mutable tags, not 40-hex SHAs. A re-pointed tag (tj-actions class) executes attacker code in a job holding the deploy key. CICD-SEC-3/CICD-SEC-4. pnpm/action-setup is third-party; checkout/setup-node are first-party.
- **Suggested fix** (inferred): Pin each uses: to a full commit SHA with a version comment and enable Dependabot for github-actions.
- **Fix surface (sibling sites):** `.github/workflows/deploy.yml:33`; `.github/workflows/deploy.yml:34`; `.github/workflows/ci.yml:38`; `.github/workflows/ci.yml:41`; `.github/workflows/ci.yml:42`

#### SC-2 — Production host runs lockfile-less npm install, bypassing pnpm-lock integrity
- **Severity:** MEDIUM · **Confidence:** CONFIRMED · **CWE:** CWE-494 · **Attacked:** not_attempted
- **Location:** `scripts/deploy-ssh.sh:60` · **Partition:** ci-and-deploy · **Category:** supply_chain
- pack-service.mjs ships a package.json with caret ranges copied from the service (line 44) and no lockfile. deploy-ssh.sh then runs npm install --omit=dev on the production host (line 60). Resolved versions and integrity are not pinned to pnpm-lock.yaml (which CI verifies with --frozen-lockfile and pnpm audit), so a malicious in-range release published after CI would be installed straight onto production, with the app env secrets (JWT private key in api-low) in scope. CICD-SEC-3.
- **Attack scenario:** Compromised in-range release of a transitive dependency is published; next deploy runs its install script/runtime on the host.
- **Suggested fix** (untested): Generate a lockfile at pack time (e.g. pnpm deploy, or write exact versions from pnpm-lock into the packaged package.json plus npm-shrinkwrap.json) and use npm ci on the host.

#### services-api-high:token_scope:0001 — api-high accepts access JWTs of revoked sessions (no session-status check)
- **Severity:** MEDIUM · **Confidence:** LIKELY · **CWE:** CWE-613 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/common/guards/endpoint.guard.ts:54` · **Partition:** services-api-high · **Category:** token_scope
- EndpointGuard.authorize verifies the bearer JWT locally (jwt-verifier.ts verifyAccess: signature, iss/aud/exp, lvl=low) and then loads roles from the DB, but never checks that session sid is still active. api-low does check this on every request (services/api-low/src/common/guards/endpoint.guard.ts:95-99: status.get(sid), st.revoked, st.userId) and revokes sessions on logout/password change/device change (session.service.ts:61-81). Those revocations are therefore not honoured on /s/v1: a stolen or logged-out admin access token (TTL 15 min) keeps full admin access, including H-12/H-22/H-23/H-31 when combined with a still-valid step-up token (5 min), for up to its remaining lifetime.
- **Attack scenario:** Admin logs out or changes password on a lost device to revoke sessions; attacker holding the captured access JWT continues calling admin endpoints on api-high until exp (<=15 min).
- **Suggested fix** (inferred): Add a revocation check in api-high authorize (e.g. internal REST lookup to low with short cache, or consume a session.revoked event into a local denylist keyed by sid) before RBAC. Alternative: accept the 15-minute window and document it as a lock.

#### services-api-low:auth:0001 — Global daily SMS budget can be exhausted by anonymous callers, locking all OTP login
- **Severity:** MEDIUM · **Confidence:** LIKELY · **CWE:** CWE-770 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/auth/otp.service.ts:57` · **Partition:** services-api-low · **Category:** auth
- OtpService.issue() charges one global durable counter 'sms:budget:<day>' (default SMS_DAILY_BUDGET=5000) for every OTP, before the SMS is sent and regardless of phone. L-01 is anonymous (auth none) and its only limits are 5/h per phone and 20/h per IP (packages/api-types/src/low/endpoints.ts:13-16), but the phone can be any syntactically valid 09xxxxxxxxx number, so one IP can issue 20 OTPs/h to distinct numbers. About 11 IPs for 24h (or a few hundred IPs in under an hour) consume the budget; afterwards every OTP request, including login for real users and admins and step-up (L-06), fails with AUTH_OTP_SEND_FAILED until UTC midnight. Users without a password have no fallback. The same cap also bounds attacker-induced SMS spend, but trades it for a platform-wide login outage.
- **Suggested fix** (untested): Split the budget: keep the global ceiling as a circuit breaker but add a per-IP and per-phone-prefix daily sub-budget, and reserve a slice of the global budget for phones that already exist in users (lookup is intentionally avoided today, so reserve for step-up and for phones with a prior verified login via a cheap indexed check) ; add a proof-of-work/CAPTCHA step when the budget passes 50%.

### LOW

#### CS-HIGH-1 — Overview (H-01) returns last 5 audit entries without system.audit.view
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-863 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/domain/overview.service.ts:52` · **Partition:** services-api-high · **Category:** collection_scope
- GET /s/v1/system/overview (H-01, no `permission` in packages/api-types/src/high/endpoints.ts:28-40) is gated only by 'any system role' in EndpointGuard.authorize, yet OverviewService.get() embeds AuditService.last(5) (audit.service.ts:87, unscoped SELECT of audit_logs incl. actor_name, target_label, summary, meta). The dedicated audit endpoint H-40 requires system.audit.view. Currently not exploitable: only developer and super_admin roles exist and both hold system.audit.view as a locked permission (rules.ts:24-25), so the permission is not separable. It is a latent bypass if a role without audit.view is ever added.
- **Suggested fix** (inferred): Return lastAudit only when req.user.perms includes system.audit.view, or add permission to H-01 split.

#### CS-MID-1 — Snapshot refresh uses fixed LIMIT 500 with no ORDER BY over rows that stay in the window
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-770 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/domain/sessions.service.ts:193` · **Partition:** services-api-mid · **Category:** collection_scope
- refreshSnapshots selects up to 500 recurring scheduled/started sessions where next_starts_at IS NULL OR < now. When nextStartMs returns null (range schedule past its end, still status scheduled/started) the row is rewritten to NULL and matches the predicate forever. 500 such rows (created by holders of session.create, or accumulated naturally) starve later sessions, whose next_starts_at (used to order the public list, COALESCE(next_starts_at, created_at)) then goes stale. Availability/ordering impact only; no cross-principal disclosure.
- **Suggested fix** (inferred): Add ORDER BY next_starts_at IS NULL, next_starts_at, id and exclude rows already resolved to NULL (or mark them ended / set a refreshed_at column and order by it ASC).

#### DEP-003 — Deploy workflow is dispatchable from any ref and does not wait for CI; environment gate is optional
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-284 · **Attacked:** not_attempted
- **Location:** `.github/workflows/deploy.yml:64` · **Partition:** ci-and-deploy · **Category:** deployment
- workflow_dispatch (line 64) runs the production deploy job with SSH secrets using whatever ref is selected, and the push trigger (line 62-63) deploys in parallel with the CI workflow rather than after it succeeds. The 'production' environment is referenced (line 81) but manual approval/branch restriction is only suggested in a comment. A user with write access can therefore deploy an unreviewed branch to production unless environment protection rules are configured (cannot be verified statically; defer to human).
- **Suggested fix** (inferred): In Settings > Environments > production restrict deployment branches to master and require reviewers; or add 'if: github.ref == refs/heads/master' to the job.

#### DEP-004 — rsync --delete to unvalidated, repo-variable destination paths
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-20 · **Attacked:** not_attempted
- **Location:** `scripts/deploy-ssh.sh:159` · **Partition:** ci-and-deploy · **Category:** deployment
- APPS_DIR and ADMIN_DOCROOT come from GitHub Variables (deploy.yml:122-123) and are used unvalidated as rsync --delete destinations and interpolated into remote shell (lines 158, 184, 190). A misconfigured value such as '.' or '' segments, or one containing a quote, would delete or run commands in the hosting home directory. Requires repo-admin control of Variables, hence LOW.
- **Suggested fix** (untested): Validate with a regex (e.g. ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$) and reject '.', '..' and absolute paths before use.

#### SC-3 — turbo devDependency uses the floating tag 'latest'
- **Severity:** LOW · **Confidence:** CONFIRMED · **CWE:** CWE-1104 · **Attacked:** not_attempted
- **Location:** `package.json:13` · **Partition:** ci-and-deploy · **Category:** supply_chain
- Root package.json declares turbo as latest. pnpm-lock.yaml pins 2.11.6 and CI uses --frozen-lockfile, which limits impact, but any manifest edit or lockfile regeneration pulls an arbitrary newer build tool that runs in the deploy job with SSH secrets present. (File is outside the partition; reported from the CI-related manifest view.)
- **Suggested fix** (inferred): Pin turbo to an exact or caret version.

#### SS-1 — Dev SMS provider logs full OTP code
- **Severity:** LOW · **Confidence:** CONFIRMED · **CWE:** CWE-532 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/sms/console.provider.ts:10` · **Partition:** services-api-low · **Category:** secret_sprawl
- ConsoleSmsProvider writes the plaintext OTP (phone masked) to the application log. Intended for local dev only; services/api-low/src/config/env.ts:73 rejects SMS_PROVIDER other than faraz when NODE_ENV is production, so exposure requires a non-production NODE_ENV on a reachable deployment (e.g. staging with console provider and shared log access).
- **Suggested fix** (inferred): Keep as is; optionally also reject SMS_PROVIDER=console when NODE_ENV is not development/test in env.ts superRefine.

#### SS-CI-1 — Throwaway MySQL credentials hardcoded in CI workflow (test fixtures)
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-798 · **Attacked:** not_attempted
- **Location:** `.github/workflows/ci.yml:22` · **Partition:** ci-and-deploy · **Category:** secret_sprawl
- The CI MySQL service container and TEST_DB_* env (ci.yml lines 22-25, 36-41, 52) use literal low-entropy dev passwords for an ephemeral container bound to the runner. The same dev values appear in the per-service .env.example files, tests/helpers/app.ts and scripts/local-db.sql. Not a production credential; risk is only copy-paste into real config. No literal production secrets, tracked key files, env dumps or secret echo found in scripts/** or .github/**; deploy.yml uses secrets.* references only and gen-env/gen-secrets write to stdout or git-ignored deploy/.
- **Suggested fix** (inferred): Optionally keep as-is (test fixtures) or generate random per-run passwords in the workflow.

#### TS-002 — Refresh rotation has no absolute session lifetime; a refresh chain can live indefinitely
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-613 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/auth/session.service.ts:125` · **Partition:** services-api-low · **Category:** token_scope
- rotate() issues a fresh refresh token with expires_at=now+REFRESH_TTL_SEC on every rotation (session.service.ts:125 via insertRefresh), and auth_sessions has no absolute expiry column or check (session.service.ts:113). A session whose refresh token is stolen and kept rotated stays valid forever; only reuse detection (legitimate client rotating) ends it. Idle expiry exists (14 d) but no max age.
- **Suggested fix** (inferred): Add auth_sessions.expires_at (e.g. 90 d absolute) and reject in rotate() when exceeded.

#### TS-003 — Session revocation is enforced only in api-low; access JWT remains valid on mid/high until exp
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-613 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/auth/token.service.ts:60` · **Partition:** services-api-low · **Category:** token_scope
- low checks the session row on each bearer request (endpoint.guard.ts:98-103, 5 s cache), but mid/high verify the JWT signature/claims only via JWKS (credentials ledger: 'mid/high: signature only'). After logout, revoke, password change (revokeOthers) or reuse-detection, a stolen access token still works on /o/v1 and /s/v1 for up to ACCESS_TTL_SEC (900 s, max 3600) + 30 s skew. Step-up/high endpoints are additionally gated by step-up. The pv (permVer) claim is emitted but never compared (token.service.ts:62 returns it unused).
- **Suggested fix** (untested): Accept as documented trade-off or have mid/high consult a revocation/permVer signal for sensitive routes.
- **Fix surface (sibling sites):** `services/api-mid/src/auth/jwt-verifier.ts:33`; `services/api-high/src/auth/jwt-verifier.ts:33`

#### apps-web-admin:auth:0001 — Step-up token cache survives logout / session reset
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-613 · **Attacked:** not_attempted
- **Location:** `apps/web-admin/src/lib/auth/auth.svelte.ts:125` · **Partition:** apps-web-admin · **Category:** auth
- AuthStore.#reset() (auth.svelte.ts:125-131) clears the access token and status but never calls stepUp.clear(); the only clear() call is on AUTH_STEP_UP_REQUIRED (utils/stepup.ts:12). StepUpStore (stores/stepup.svelte.ts:3-8,27-31) keeps the step-up token in module memory until its expiry, and ensure() returns it without prompting. After logout or AUTH_REFRESH_INVALID in the same tab (SPA, no reload), a different admin who logs in can run withStepUp() writes without a fresh step-up challenge if the server does not bind the token to the subject. Server-side binding was not verified in this partition.
- **Attack scenario:** Shared workstation: admin A completes step-up, logs out without reloading; admin B logs in on the same tab and performs a role assignment reusing A's cached step-up token within its TTL.
- **Suggested fix** (inferred): Call stepUp.clear() inside AuthStore.#reset() (or from logout in +layout.svelte). Confirm in api-high that X-Step-Up-Token carries and verifies sub.

#### apps-web-admin:auth:0002 — Admin CSP allows script-src 'unsafe-inline' while access token lives in JS memory
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-79 · **Attacked:** not_attempted
- **Location:** `apps/web-admin/scripts/gen-htaccess.mjs:15` · **Partition:** apps-web-admin · **Category:** auth
- The generated CSP (gen-htaccess.mjs:15) sets script-src 'self' 'unsafe-inline'. The admin access token is held in a JS-reachable field (auth.svelte.ts:35 accessToken), so any injected inline script (XSS) could read it and call api-high admin endpoints. No {@html}/innerHTML sinks were found in apps/web-admin/src (grep), so this is defense-in-depth only. SvelteKit static adapter emits an inline bootstrap script, which is the likely reason for the allowance.
- **Suggested fix** (inferred): Use SvelteKit kit.csp with mode 'hash' (or nonce) to drop 'unsafe-inline' from script-src.

#### apps-web-main:mitm:0001 — API base URLs and CSP fall back to plaintext http://localhost when env unset
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-319 · **Attacked:** not_attempted
- **Location:** `apps/web-main/src/lib/api/config.ts:10` · **Partition:** apps-web-main · **Category:** mitm
- LOW_URL/MID_URL default to http://localhost:3001/3002 (config.ts:10-11) and svelte.config.js:5 builds CSP connect-src and ws:// socket origins from the same http defaults (line 6 maps http->ws). Nothing rejects a non-https value in production, so a deployment that omits or mistypes the env (set to http://) would send credentials, refresh cookie requests and the Socket.IO auth token (midClient.ts:58) in cleartext and CSP would permit http/ws origins. Default targets loopback so exploitation requires an operator misconfiguration; no certificate-verification bypass, TLS<1.2 reference or ws:// literal exists in the partition.
- **Suggested fix** (inferred): Fail the build/startup when NODE_ENV=production and either URL does not start with https:// (and drop the localhost fallback outside dev). Alternative: default to https://api.israapp.ir as documented in config.ts:5.

#### cfg-0001 — No dependabot/renovate, CODEOWNERS or SECURITY.md in repository
- **Severity:** LOW · **Confidence:** CONFIRMED · **CWE:** CWE-1104 · **Attacked:** not_attempted
- **Location:** `.github/workflows/ci.yml:1` · **Partition:** ci-and-deploy · **Category:** config
- Repository has no .github/dependabot.yml, CODEOWNERS or SECURITY.md (verified by ls). Dependency updates, review gating of workflow/deploy changes and a vulnerability-disclosure channel are therefore undefined.

#### cfg-0002 — web-admin static SPA CSP permits script-src unsafe-inline
- **Severity:** LOW · **Confidence:** CONFIRMED · **CWE:** CWE-693 · **Attacked:** not_attempted
- **Location:** `scripts/gen-htaccess.mjs:15` · **Partition:** apps-web-admin · **Category:** config
- Duplicated from ASVS V14.4.3 row: the admin SPA CSP generated for .htaccess allows inline scripts, weakening XSS mitigation relative to web-main (nonce/hash).

#### services-api-high:auth:0002 — BOOTSTRAP_DEVELOPER_PHONE keeps granting developer on every matching registration, contradicting docs
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-863 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/internal/events.service.ts:75` · **Partition:** services-api-high · **Category:** auth
- docs-v2/24-env-draft.md says the variable only has effect while no developer exists. Code path onlyPhone (events.service.ts:55,75) grants developer to the directory row matching an env phone on every user.registered even when developers exist, and the env var is never consumed. The env var is a standing privilege grant: any later re-registration/restore of that phone (directory row recreated after deletion, DB restore, number reassignment where phone is unique key) yields developer without an actor or step-up. The grant is audited (system.bootstrap) but bypasses D6.
- **Suggested fix** (inferred): Apply the has.length check also in the onlyPhone branch (targets = has.length ? [] : phones.filter(...)), matching the documented behaviour.

#### services-api-high:auth:0003 — jwtVerify does not require exp, so expiry is optional for access and step-up tokens
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-613 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/auth/jwt-verifier.ts:28` · **Partition:** services-api-high · **Category:** auth
- jwtVerify options (RS256, issuer, audience, clockTolerance) lack requiredClaims: ['exp']. In jose, exp is only enforced when present, so a correctly signed access or step-up token minted without exp would never expire at api-high. Signer is api-low only, so this is defence-in-depth against a minting bug in low or key misuse, with step-up (lvl=stepup) the most sensitive.
- **Suggested fix** (inferred): Add requiredClaims: ['exp','sub','sid'] (and ['jti'] if replay tracking is added) to the jwtVerify options.

#### services-api-high:auth:0004 — Step-up token is replayable for its whole TTL across all step-up endpoints
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-345 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/auth/jwt-verifier.ts:50` · **Partition:** services-api-high · **Category:** auth
- verifyStepUp checks lvl, sub and sid only; no jti single-use tracking and no binding to the target action (tests set TTL 300s). A step-up token captured from one H-12/H-22/H-23/H-31 call (X-Step-Up-Token header, also sent cross-origin with credentials) can be reused for any other step-up write by the same session until it expires.
- **Suggested fix** (inferred): Record consumed jti (inbox-style table) or bind an action/htm claim in low and verify it here.

#### services-api-high:auth:0005 — Global EndpointGuard fails open for handlers without @Route metadata
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-636 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/common/guards/endpoint.guard.ts:32` · **Partition:** services-api-high · **Category:** auth
- canActivate returns true when EP_KEY metadata is absent. Authentication is therefore opt-in per handler: any future controller method added without @Route (e.g. a plain @Get) is served unauthenticated. Currently the only such handler is EventsController.receive, protected by its own InternalGuard, so no present exploit.
- **Suggested fix** (inferred): Default-deny: throw AUTH_REQUIRED when id is missing unless a @Public/@InternalOnly marker is present.

#### services-api-high:auth:0006 — LOW_JWKS_URL (trust root for every admin token) is not required to be https in production
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-345 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/config/env.ts:26` · **Partition:** services-api-high · **Category:** auth
- z.url() accepts http://; superRefine enforces https only for CORS_ORIGINS. If JWKS is fetched over plain HTTP (e.g. internal host), an on-path attacker can substitute keys and mint arbitrary admin access/step-up JWTs. DB roles still gate permissions, but the attacker can impersonate any userId including developers.
- **Suggested fix** (inferred): Add need(prod && !e.LOW_JWKS_URL.startsWith('https://'), 'LOW_JWKS_URL', ...) in superRefine.

#### services-api-high:auth:0007 — Access JWT sid is not checked against session revocation; logout/revoked sessions stay valid for the access TTL
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-613 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/auth/jwt-verifier.ts:35` · **Partition:** services-api-high · **Category:** auth
- verifyAccess trusts sid without consulting low; owner raised access TTL to 20 minutes (STATUS.md). A revoked or stolen session therefore retains admin API access (including non-step-up reads such as user list and audit) for up to 20 minutes after logout/revocation. Role removal is immediate because roles are read from the DB per request (rbac.service.ts:46).
- **Suggested fix** (inferred): Accept as documented residual risk, or add a cheap internal revocation check/short denylist for sid.

#### services-api-high:token_scope:0002 — Step-up token is not purpose-bound or single-use; any step-up satisfies all admin step-up endpoints
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-863 · **Attacked:** not_attempted
- **Location:** `services/api-high/src/auth/jwt-verifier.ts:46` · **Partition:** services-api-high · **Category:** token_scope
- verifyStepUp only checks lvl=stepup, sub and sid match. The token (signed by api-low signStepUp, jti set but never tracked) carries no action/audience scope, so a step-up obtained for any low flow (e.g. PUT /me/password, endpoints.ts:192) is accepted for H-12, H-22, H-23 and H-31 and can be replayed unlimited times within its 5-minute TTL. It remains bound to user+session, so exploitation needs the holder's access token as well.
- **Suggested fix** (inferred): Add an 'act' claim (e.g. admin) to step-up tokens minted for admin use and verify it; optionally track jti in a short-lived store for single use.

#### services-api-low:auth:0003 — Anonymous attacker can lock a victim's password login with a per-phone counter
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-307 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/auth/auth.service.ts:70` · **Partition:** services-api-low · **Category:** auth
- loginPassword() charges the durable counter 'pw:ph:<phone>' (20 per 15 min) before checking the credential, so any unauthenticated caller can exhaust it for an arbitrary phone number (4 source IPs at 5 per 15 min per ip+phone, or 20 requests from a few IPs) and keep the real owner's password login returning RATE_LIMITED. OTP login remains available, so impact is limited to degraded login and admin accounts that depend on password login. The same cap also allows about 1,900 guesses per day per phone from distributed sources.
- **Suggested fix** (inferred): Count only failed attempts toward the per-phone cap, and combine it with a device/cookie signal or exponential backoff rather than a hard lockout; keep the per-ip caps.

#### services-api-low:auth:0004 — Refresh and access issuance never re-check users.status after login
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-613 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/auth/session.service.ts:99` · **Partition:** services-api-low · **Category:** auth
- AuthService.verifyOtp/loginPassword check users.status === 'active' only at login (auth.service.ts:64,79). SessionService.rotate() (session.service.ts:99-135), SessionStatusCache.get() (session-status.cache.ts:33) and EndpointGuard.authenticate() (endpoint.guard.ts:96-100) only look at auth_sessions.revoked_at, so a user whose users.status is later changed to a non-active value keeps working refresh tokens for REFRESH_TTL_SEC (14 days) and new access tokens. No code in api-low currently sets a non-active status or revokes sessions on status change, so exploitation depends on an out-of-band status change; confidence POSSIBLE.
- **Suggested fix** (inferred): Join users.status in the rotate() session lookup and in SessionStatusCache.get(), and revoke all sessions in the same transaction as any status change.

#### services-api-low:auth:0005 — Global guard fails open for handlers lacking an @Route marker
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-636 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/common/guards/endpoint.guard.ts:44` · **Partition:** services-api-low · **Category:** auth
- EndpointGuard.canActivate returns true when the handler has no EP_KEY metadata (line 44). Today the only undecorated handler is EventsController.receive (events.controller.ts:19), protected by a controller-level InternalGuard, so nothing is exposed now, but any future controller that forgets @Route (or uses @Get/@Post directly) is served with no authentication, rate limit or CSRF check. Positive-allowlist authentication fails open.
- **Suggested fix** (inferred): Default-deny: throw when no EP_KEY is present unless the handler or class carries an explicit @InternalRoute/@Public marker, and add a boot test enumerating all routes against ENDPOINTS.low.

#### services-api-low:crypto:0001 — Argon2 cost env floors permit sub-OWASP parameters
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-916 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/config/env.ts:58` · **Partition:** services-api-low · **Category:** crypto
- ARGON2_MEMORY_KIB has min(8) (8 KiB) and ARGON2_TIME min(1); the default (65536 KiB, t=3) meets OWASP, but a misconfigured production env would silently be accepted and password.service.ts passes these straight to argon2id. No production superRefine enforces >=19 MiB / t>=2.
- **Attack scenario:** Operator sets a tiny cost for performance on shared cPanel; leaked hashes become cheap to crack.
- **Suggested fix** (inferred): Raise zod floors to ARGON2_MEMORY_KIB min(19456) and ARGON2_TIME min(2), or enforce in the production superRefine.

#### services-api-low:crypto:0002 — Committed example env contains predictable OTP_PEPPER and INTERNAL_SHARED_SECRET with no production guard
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-798 · **Attacked:** not_attempted
- **Location:** `services/api-low/.env.example:19` · **Partition:** services-api-low · **Category:** crypto
- OTP_PEPPER and INTERNAL_SHARED_SECRET example values (dev-otp-pepper-..., dev-internal-secret-...) satisfy the min(32) check in env.ts:57,60 and nothing rejects them in production. If copied unchanged, the internal token (X-Internal-Token, internal.guard.ts:34) is publicly known and OTP HMACs are computable offline from a DB leak (5-digit space).
- **Suggested fix** (inferred): In env.ts superRefine reject values starting with 'dev-' when NODE_ENV=production.

#### services-api-low:deployment:0001 — NODE_ENV defaults to development; all production fail-fast guards are keyed on NODE_ENV==='production'
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-1188 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/config/env.ts:12` · **Partition:** services-api-low · **Category:** deployment
- env.ts defaults NODE_ENV to 'development' (line 12) and every production guard in superRefine (lines 70-82: JWT_PRIVATE_KEY_PEM required, CORS https-only, SWAGGER off, COOKIE_SECURE true) is conditional on prod. If the cPanel deployment omits NODE_ENV, the service starts with an ephemeral RSA key, relaxed CORS, non-secure cookies and optional Swagger, with no fail-fast. start script (package.json) does not set NODE_ENV. SMS_PROVIDER defaults to faraz so OTP console leak is not reachable by default. Also .env.example ships dev OTP_PEPPER/INTERNAL_SHARED_SECRET values that satisfy the min(32) check, so no guard rejects copied dev secrets in production. Whether deploy sets NODE_ENV is outside partition scope; defer to human.
- **Suggested fix** (inferred): Make NODE_ENV required (remove .default('development')) or have the start script set NODE_ENV=production; reject known dev secret values in prod.

#### services-api-low:mitm:0001 — Production env validation does not require https for FARAZ_BASE_URL / INTERNAL_URL_*
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-319 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/config/env.ts:51` · **Partition:** services-api-low · **Category:** mitm
- EnvSchema uses z.url() for FARAZ_BASE_URL (line 51) and INTERNAL_URL_MID/HIGH (61-62); superRefine (69-83) enforces https only for CORS_ORIGINS. A misconfigured http:// value in production would send the Faraz Api-Key and OTP codes (faraz.provider.ts:23) or X-Internal-Token (mid.client.ts:110, outbox.service.ts:82) in cleartext; fetch follows redirects by default. Defaults are https and internal hops are likely loopback on the same cPanel host, so this is a hardening gap, not an active defect.
- **Suggested fix** (inferred): In superRefine, require FARAZ_BASE_URL to start with https:// in production; require INTERNAL_URL_* https or loopback host.

#### services-api-mid:auth:0003 — Global EndpointGuard fails open for handlers without @Route metadata
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-636 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/common/guards/endpoint.guard.ts:32` · **Partition:** services-api-mid · **Category:** auth
- EndpointGuard is the only APP_GUARD (app.module.ts:65) and returns true when a handler has no EP_KEY (endpoint.guard.ts:32). Authentication, rate-limit and validation therefore apply only to handlers decorated with @Route; any future controller method that forgets it (or uses a plain @Get) is anonymous and unvalidated. Currently all MidController/InfraController handlers use @Route and InternalController has its own guard, so no live bypass was found.
- **Attack scenario:** A developer adds @Post('x') without @Route; it is served unauthenticated.
- **Suggested fix** (inferred): Default-deny: when no EP_KEY, require an explicit @Public()/@InternalOnly marker (or throw), and add a boot-time test that every route has either.

#### services-api-mid:auth:0004 — Internal guard failure lockout is keyed on IP and also blocks callers presenting the valid token
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-307 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/internal/internal.guard.ts:30` · **Partition:** services-api-mid · **Category:** auth
- The lockout check (internal.guard.ts:30-31) runs before the token comparison, so once an IP has 10 failures, even the correct X-Internal-Token from that IP receives 429 for 60s. If TRUST_PROXY does not match the infrastructure (docs-v2/24-env-draft.md:63 warns of this), req.ip collapses to the proxy address and 10 anonymous bad requests lock out low/high event delivery repeatedly. Counters are per-process memory.
- **Attack scenario:** Attacker sends 10 bad tokens per minute through a shared proxy IP, stalling outbox delivery from low/high.
- **Suggested fix** (inferred): Evaluate the token first and only count/lock failures; do not reject valid tokens due to the lockout, or key lockout by (ip, token-prefix).

#### services-api-mid:auth:0005 — queue.turned socket broadcast discloses the current student's userId to every room member
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-200 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/domain/queue.service.ts:346` · **Partition:** services-api-mid · **Category:** auth
- REST hides other users' userId from non-staff (queue.service.ts:270, D4 privacy), but next() emits queue.turned with payload.userId to the whole session room (queue.service.ts:346; live.service.ts:57). Any approved member (including plain students) receives the userId. docs-v2/18-api-mid-web-main-draft.md:81 lists this payload as designed, but names no compensating control and contradicts the D4 REST rule. Impact is low since the current student's name is already visible to all.
- **Attack scenario:** Student joins session room via socket and harvests userIds of other students as their turn comes.
- **Suggested fix** (inferred): Emit queue.turned without userId (clients refetch M-32) or send it only to that user's socket room.

#### services-api-mid:idor:0002 — refreshSnapshots fixed-size unordered scan can be starved by sessions whose next start is permanently NULL
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-770 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/domain/sessions.service.ts:193` · **Partition:** services-api-mid · **Category:** idor
- refreshSnapshots scans 'status IN (scheduled,started) AND schedule_type <> once AND (next_starts_at IS NULL OR next_starts_at < now) LIMIT 500' with no ORDER BY. Rows with no future start (expired range; schedule.ts:35-37) are written back as NULL and match forever. A session.create holder who accumulates many such sessions can fill the window so others' snapshots are never refreshed, skewing the public list order. No disclosure; ordering only. Whether creation accepts expired ranges was not verified.
- **Suggested fix** (untested): Exclude permanently-expired rows (e.g. set status/flag or skip when nextStartMs is null) and add ORDER BY next_starts_at IS NULL, next_starts_at, id with a rotating cursor.

#### services-api-mid:mitm:0001 — Production env validation does not require https for INTERNAL_URL_LOW
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-319 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/config/env.ts:47` · **Partition:** services-api-mid · **Category:** mitm
- INTERNAL_URL_LOW is z.url().optional() (line 33) and superRefine only requires presence in prod (line 47), not https. outbox.service.ts:83 POSTs X-Internal-Token (INTERNAL_SHARED_SECRET) and event bodies to it with default fetch; an http:// non-loopback value would send the shared secret in cleartext. Config-dependent; deployment may use loopback.
- **Attack scenario:** Operator sets INTERNAL_URL_LOW=http://low.internal; on-path attacker captures X-Internal-Token and forges internal events to api-low.
- **Suggested fix** (inferred): In superRefine require INTERNAL_URL_LOW to start with https:// or have hostname exactly 127.0.0.1/localhost (parse via new URL).

#### services-api-mid:mitm:0002 — LOW_JWKS_URL https check bypassable via substring match on loopback
- **Severity:** LOW · **Confidence:** LIKELY · **CWE:** CWE-319 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/config/env.ts:48` · **Partition:** services-api-mid · **Category:** mitm
- Prod guard accepts any URL that merely contains '127.0.0.1' or 'localhost' as a substring (e.g. http://keys.example.com/localhost/jwks), so a cleartext remote JWKS URL passes validation. A MITM on that fetch (jwt-verifier.ts:27) can substitute signing keys and mint accepted JWTs. Requires misconfiguration.
- **Attack scenario:** Misconfigured http JWKS URL containing 'localhost' in path passes boot; on-path attacker serves own JWKS and forges tokens.
- **Suggested fix** (inferred): Parse with new URL() and compare hostname to exact loopback values when protocol is http.

#### services-api-mid:mitm:0003 — MySQL connection has no TLS option or remote-host guard
- **Severity:** LOW · **Confidence:** POSSIBLE · **CWE:** CWE-319 · **Attacked:** not_attempted
- **Location:** `services/api-mid/src/db/data-source.ts:14` · **Partition:** services-api-mid · **Category:** mitm
- dataSourceOptions sets host/port/credentials with no ssl option and env.ts has no DB_SSL/host validation; if DB_HOST is remote in production, credentials and data travel in cleartext. Likely loopback on cPanel, hence POSSIBLE.
- **Suggested fix** (untested): Add optional DB_SSL env mapped to ssl option, and refuse non-loopback DB_HOST without it in prod.

### INFO

#### SC-4 — Dependency audit gate only covers prod deps at high severity and is absent from deploy
- **Severity:** INFO · **Confidence:** POSSIBLE · **CWE:** CWE-1104 · **Attacked:** not_attempted
- **Location:** `.github/workflows/ci.yml:56` · **Partition:** ci-and-deploy · **Category:** supply_chain
- CI runs pnpm audit --prod --audit-level high; deploy.yml triggers on push to master with no dependency audit or dependency on CI success, and no provenance/attestation of the deployed bundle. Maturity gap only.
- **Suggested fix** (inferred): Make deploy depend on CI success (workflow_run or required checks) and consider build attestation.

#### services-api-low:crypto:0003 — SHA-1 used only for ETag derivation (non-security)
- **Severity:** INFO · **Confidence:** CONFIRMED · **CWE:** CWE-328 · **Attacked:** not_attempted
- **Location:** `services/api-low/src/common/envelope.interceptor.ts:51` · **Partition:** services-api-low · **Category:** crypto
- createHash('sha1') hashes the response body for a weak ETag; not used for authentication, signatures or passwords. Same pattern exists in api-mid and api-high envelope interceptors. Informational only.
- **Fix surface (sibling sites):** `services/api-mid/src/common/envelope.interceptor.ts:51`; `services/api-high/src/common/envelope.interceptor.ts:51`


## § B — Scanner findings (external_scanner)

None promoted. Semgrep ran offline with a local rules clone (68 raw results: mostly quality/best-practice noise such as `missing-template-string-indicator`, `robots-denied`; the security-relevant ones — mutable action tags — are tracked as SC-1/DEP-001). Raw run is copied verbatim into `findings.sarif`.

## § C — Governance

None (no baseline yet; first run).

## What Is Sound (negative claims, refuted on adversarial review)

56 rows were attacked and **refuted** with a cited boundary: 23 from the mechanical reconcilers (`validate-egress.py`, `validate-collection-scoping.py` — their raw HIGH/CRITICAL ratings are **not** findings) and 33 deep-dive checks that confirmed a control holds (INFO).

| # | Rule | Claim refuted | Boundary examined | Evidence |
|---|---|---|---|---|
| 1 | methodology | Refutation: no refresh/access token persisted in web storage | Examined apps/web-admin/src only; ran grep -rn 'localStorage | Candidate: token theft via localStorage. Only the hint flag 'isra.admin.session'='1', deviceId and PWA dismiss timestamp are stored; access token is in memory, refresh is an HttpOnly cookie (credent |
| 2 | methodology | Refutation: post-login ?next redirect is same-origin only | Examined utils/nav.ts and callers via grep -rn safeNext src  | feNext rejects non-'/' prefixed, '//' and '/\' values; used by +layout.svelte:50 for goto. SPA router goto cannot navigate cross-origin from a path-only value. |
| 3 | methodology | Refutation: JWT verification pins RS256 and checks iss/aud; no alg none/header-t | Examined services/api-high/src/auth/jwt-verifier.ts and its  | Alleged: alg confusion, alg none, kid/jku header trust, missing iss/aud. jwtVerify pins algorithms RS256, issuer and audience, uses a remote JWKS set only (no jku/x5u/jwk header use), lvl discriminato |
| 4 | methodology | Refutation: role/grant assignment cannot self-escalate to developer or remove la | Examined services/api-high/src/domain/{users,roles,rbac,rule | Alleged: super_admin can grant developer or empty a role. setRoles enforces touchesDeveloper (developer-only) using actor roles taken from DB in the guard, and a FOR UPDATE locked last-holder check; G |
| 5 | methodology | JWT verification pins RS256 and binds iss/aud and lvl (refuted: alg confusion /  | services/api-low/src only; command: grep -rn jwtVerify servi | Both jwtVerify calls pass algorithms ['RS256'], issuer, audience, clockTolerance and use the server's own KeyObject, not header-derived keys; step-up tokens are rejected as access via payload.lvl chec |
| 6 | methodology | Refresh rotation uses single-use hashed tokens with reuse detection (refuted: re | services/api-low/src/auth/session.service.ts and auth.servic | otate() hashes tokens (sha256), locks the row FOR UPDATE, marks rotated_at, and revokes the whole session on reuse outside the 10s web grace window. create() always issues a new session id and ref |
| 7 | methodology | OTP verification counts attempts atomically and is single-use (refuted: parallel | services/api-low/src/auth/otp.service.ts, endpoint.guard.ts, | fy() increments attempts via conditional UPDATE with attempts < OTP_MAX_ATTEMPTS, compares HMAC with timingSafeEqual and consumes with conditional UPDATE, so at most 3 guesses per challeng |
| 8 | methodology | JWT verification pins RS256 and checks iss/aud/exp | Read services/api-mid/src/auth/jwt-verifier.ts whole; grep - | Refutation of alg:none/alg-confusion/missing iss-aud in api-mid JwtVerifier: jwtVerify is called with algorithms ['RS256'], issuer, audience, clockTolerance and a lvl claim check; key comes from creat |
| 9 | methodology | In-session RBAC derived from DB membership with per-handler permission checks | Read mid.controller.ts, access.service.ts, sessions/members/ | Refutation of BOLA/BFLA on sessions, members, queue, attendance and evaluations: every MidController handler calls a service that uses MembersAccess.load with a permission (or approved-membership chec |
| 10 | methodology | H-20 user list is admin-tier restricted | Examined users.service.ts list(), endpoint.guard.ts authoriz | Unscoped user_directory list is gated by system.users.view (endpoints.ts:102, guard endpoint.guard.ts:62), held only by developer/super_admin (locked, rules.ts:24-25); entity is admin directory by |
| 11 | methodology | H-40 audit list is admin-tier restricted | Examined audit.service.ts list(), endpoints.ts H-40; grep -n | t_logs list gated by system.audit.view (endpoints.ts:212), locked on both roles; filters are action/text only, intended global view for admins. |
| 12 | methodology | H-10/H-11 role matrix is non-user data | Examined roles.service.ts list()/permissions(), high.control | Roles/permissions list is a static 2-role matrix (ROLE_KEYS) with holder counts only; no per-user rows; any system role holder reading it is intended (H-10 no permission). |
| 13 | methodology | Evaluations list is caller-scoped for non-staff | Examined evaluations.service.ts list() and access.service.ts | Non-staff predicate e.user_id = caller (evaluations.service.ts:117-118); staff = eval.submit/queue.manage from DB membership. COUNT uses same where. |
| 14 | methodology | Members, attendance, queue and my-sessions lists are scoped by session + DB perm | Examined members.service.ts list, attendance.service.ts list | bers/attendance require membership.approve/attendance.view via access.load (DB roles); queue view restricts non-staff to current item name, own item, waitingCount (D4); mySessions binds m.user_id=c |
| 15 | methodology | Internal list/stat endpoints gated by shared secret and exclude drafts | Examined internal.controller.ts, internal.guard.ts, sessions | blic/sessions excludes draft (status enum has no draft); stats/users points are service-to-service behind InternalGuard (constant-time token, per-IP lockout). |
| 16 | methodology | Refutation: JWT algorithm is pinned and claims validated | Examined services/api-low/src/auth/token.service.ts and keys | Alleged alg-confusion / missing claim validation on JWT verify. |
| 17 | methodology | Refutation: security randomness and comparisons use CSPRNG and constant-time com | grep -rnE 'Math\.random|createHash\(.(md5|sha1)' services/ap | Alleged weak PRNG / timing leak for OTP, refresh token, internal secret. |
| 18 | methodology | Refuted: no pull_request_target / fork-secret exposure in workflows | Examined all files under .github/ (2 workflows: ci.yml, depl | CI triggers on pull_request (no secrets for forks) and push to master; both workflows set top-level permissions: contents: read. Deploy secrets are only in deploy.yml (push master / dispatch), sco |
| 19 | methodology | Refuted: secret-generation scripts do not persist secrets in tracked paths | Read scripts/gen-env.mjs, gen-secrets.mjs, pack-service.mjs, | gen-env.mjs writes env files with mode 0600 to deploy/env (deploy/ is gitignored, .gitignore:33); gen-secrets.mjs prints to stdout only; pack-service.mjs allow-lists svc argument befo |
| 20 | methodology | Refutation: id-param routes H-21/H-22/H-23 are admin-tier by design | Examined services/api-high/src: high.controller.ts, users.se | Alleged: GET/PUT /system/users/{id}[...] take a user id with no per-object ownership scope. user_directory has no owner column; the surface is an admin directory. Access requires a system role (endpo |
| 21 | methodology | Refutation: mass-assignment and developer-role escalation guarded | Examined services/api-high/src: high.controller.ts, users.se | Alleged: setRoles/setGrants/updateSettings allow privilege escalation via body. Bodies are zod .strict() with enum role/grant keys (api-types schemas.ts:45-46); touchesDeveloper blocks non-develo |
| 22 | methodology | Refutation: list endpoints (users, audit, roles) are admin-global, permission-ga | Examined services/api-high/src: high.controller.ts, users.se | Alleged: list endpoints return all rows. user_directory/audit_logs are global admin data with no per-user owner; H-20/H-40 require system.users.view / system.audit.view via endpoint.guard.ts:104. LIKE |
| 23 | methodology | Refutation: id-param routes L-15 and L-19 are owner-scoped | Examined services/api-low/src only: me.controller.ts, me.ser | Alleged: session revoke (L-15) and inbox mark-read (L-19) take a path id and could act on other users' rows. Both pass uid from the JWT (r.user.userId) and filter by user_id in SQL (session.service.t |
| 24 | methodology | Refutation: session-scoped id routes M-02..M-41 enforce membership/permission fr | Examined services/api-mid/src/domain/*.ts, live/live.service | Alleged: path ids (session, memberId, itemId, queueItemId) reach SQL without ownership scope. Every handler calls MembersAccess.load(sessionId, JWT userId, perm): membership and permission come from D |
| 25 | methodology | Refuted: session.location.routeUrl as href (javascript: URL XSS) | Examined apps/web-main routeUrl consumers (grep -rn routeUrl | outeUrl is rendered as href in sessions/[id]/+page.svelte:69 and manage/[id]/+page.svelte:164 without client-side scheme check. Not filed as defect: packages/api-types session.ts:28 restricts it to |
| 26 | methodology | Refuted: {@html} in GuestLanding svelte:head | grep -rn '@html' apps/web-main/src: 1 match; inspected templ | The only {@html} in apps/web-main/src is a static <style> template literal at GuestLanding.svelte:142 containing no interpolation of user data. |
| 27 | methodology | No TLS verification bypass or legacy TLS reference in web-main (refuted) | rg -n -i 'rejectUnauthorized|NODE_TLS_REJECT|TLSv1\.[01]|SSL | Searched for rejectUnauthorized, NODE_TLS_REJECT_UNAUTHORIZED, https.Agent, TLSv1.0/1.1, SSLv2/3, insecure, ws:// literals; none present. HSTS is set when https or x-forwarded-proto=https (hooks. |
| 28 | methodology | No certificate verification disabling in api-mid | services/api-mid (excluding node_modules/dist) only; rg -n - | No rejectUnauthorized:false, NODE_TLS_REJECT_UNAUTHORIZED, custom https.Agent, TLSv1.0/1.1/SSLv, or ws:// outbound client found. |
| 29 | methodology | No tracked secrets or hardcoded credentials found in api-low | Examined services/api-low/** (src, scripts, tests) via rg fo | Only tracked env-like file is .env.example, whose secret-named values contain placeholder wording; real .env.* and deploy/env/*.env are gitignored and untracked. Phase 4 scanners produced no gitleaks/ |
| 30 | methodology | Refutation: no unscoped authenticated-only privileged endpoint in api-high | services/api-high/src guard, verifier, ep.ts, high.controlle | Alleged: endpoints authenticate the token but skip use-time scope/permission check. Global EndpointGuard requires >=1 DB-sourced system role and enforces def.permission against DB-derived perms (not J |
| 31 | methodology | Refuted: user JWT verification and permission use in api-mid | Read auth/jwt-verifier.ts, common/guards/endpoint.guard.ts,  | RS256 pinned, iss/aud/exp checked, lvl=low enforced, session.create requires perms claim at endpoint.guard.ts:61, socket handshake verifies same JWT and disconnects at exp. No token in URL, no tok |
| 32 | methodology | Refuted: contract-bound handler left without authentication in api-low | services/api-low/src, command: grep -rnE '@(Get|Post|Put|Pat | Alleged: EndpointGuard returns true when no @Route id (guard line 49), so an undecorated handler would be unauthenticated. All 24 HTTP handlers in api-low carry @Route; the only non-@Route contro |
| 33 | methodology | Refuted: tokens in URLs/logs and wildcard/ungated token minting in api-low | services/api-low/src only; greps: 'query\.(token|access|api) | No query-string token ingestion or emission found; refresh token only in HttpOnly cookie/body, Authorization header; pino redacts authorization/cookie/x-step-up-token/x-internal-token (app.module.ts:3 |
| 34 | validate-egress:R2 | Byte-serving path to attendance_entries enforces a weaker gate than the resource | services/api-mid/src/domain/{attendance,access}.service.ts | ttendance list gated by access.load(..., attendance.view) and scoped by a.session_id = ? (attendance.service.ts:58-59); roster visibility by permission is the int |
| 35 | validate-egress:R2 | Byte-serving path to point_ledger enforces a weaker gate than the resource requi | services/api-mid/src/internal/ | class-level @UseGuards(InternalGuard) (internal.controller.ts:27): constant-time shared secret, per-IP fail limiter, optional IP allow-list; service-to-service ro |
| 36 | validate-egress:R3 | Capability-only gate: point_ledger served on knowledge of an identifier alone | services/api-mid/src/internal/ | class-level @UseGuards(InternalGuard) (internal.controller.ts:27): constant-time shared secret, per-IP fail limiter, optional IP allow-list; service-to-service ro |
| 37 | validate-egress:R2 | Byte-serving path to queue_items enforces a weaker gate than the resource requir | services/api-mid/src/domain/queue.service.ts | queue.service.ts:38-39 item(): non-staff get userId blanked and name only for current/self; staff gate via access.load. |
| 38 | validate-egress:R2 | Byte-serving path to user_directory enforces a weaker gate than the resource req | services/api-high/src/domain/users.service.ts | GET /s/v1/system/users is an admin directory; gated by permission system.users.view via global EndpointGuard; listing all users is the endpoint purpose, not a per- |
| 39 | validate-egress:R3 | Capability-only gate: user_directory served on knowledge of an identifier alone | services/api-high/src/domain/users.service.ts | GET /s/v1/system/users is an admin directory; gated by permission system.users.view via global EndpointGuard; listing all users is the endpoint purpose, not a per- |
| 40 | validate-egress:R2 | Byte-serving path to user_directory enforces a weaker gate than the resource req | services/api-high/src/domain/high.controller.ts | -tier endpoints gated by EndpointGuard permissions (system.*); heuristic compares against a generic http-layer rank. |
| 41 | validate-collection-scoping:C1 | Collection endpoint returns user_directory rows belonging to other principals | services/api-high/src/domain/users.service.ts | GET /s/v1/system/users is an admin directory; gated by permission system.users.view via global EndpointGuard; listing all users is the endpoint purpose, not a per- |
| 42 | validate-collection-scoping:C2 | Permission-shaped field in user_directory handler with no filter | services/api-high/src/domain/users.service.ts | GET /s/v1/system/users is an admin directory; gated by permission system.users.view via global EndpointGuard; listing all users is the endpoint purpose, not a per- |
| 43 | validate-collection-scoping:C1 | Collection endpoint returns audit_logs rows belonging to other principals | services/api-high/src/domain/audit.service.ts | t log is admin-only by design (permission system.audit.view); no owner column applies. |
| 44 | validate-collection-scoping:C2 | Permission-shaped field in audit_logs handler with no filter | services/api-high/src/domain/audit.service.ts | t log is admin-only by design (permission system.audit.view); no owner column applies. |
| 45 | validate-collection-scoping:C1 | Collection endpoint returns system_roles rows belonging to other principals | services/api-high/src/domain/roles.service.ts | tatic role catalogue (ROLE_KEYS), no per-principal rows; admin-gated. |
| 46 | validate-collection-scoping:C2 | Permission-shaped field in session_members handler with no filter | services/api-mid/src/domain/members.service.ts | bers list gated via access.load; permission-shaped field is a UI hint (canX), real enforcement is server-side per action. |
| 47 | validate-collection-scoping:C6 | scope_evidence for attendance_entries cites a predicate that is not at that line | services/api-mid/src/domain/{attendance,access}.service.ts | ttendance list gated by access.load(..., attendance.view) and scoped by a.session_id = ? (attendance.service.ts:58-59); roster visibility by permission is the int |
| 48 | validate-collection-scoping:C2 | Permission-shaped field in attendance_entries handler with no filter | services/api-mid/src/domain/{attendance,access}.service.ts | ttendance list gated by access.load(..., attendance.view) and scoped by a.session_id = ? (attendance.service.ts:58-59); roster visibility by permission is the int |
| 49 | validate-collection-scoping:C2 | Permission-shaped field in queue_items handler with no filter | services/api-mid/src/domain/queue.service.ts | queue.service.ts:38-39 item(): non-staff get userId blanked and name only for current/self; staff gate via access.load. |
| 50 | validate-collection-scoping:C1 | Collection endpoint returns evaluations rows belonging to other principals | services/api-mid/src/domain/evaluations.service.ts | t() filters by session after access.load(..., evaluations.view); single-row reads gated by session membership. |
| 51 | validate-collection-scoping:C2 | Permission-shaped field in evaluations handler with no filter | services/api-mid/src/domain/evaluations.service.ts | t() filters by session after access.load(..., evaluations.view); single-row reads gated by session membership. |
| 52 | validate-collection-scoping:C2 | Permission-shaped field in auth_sessions handler with no filter | services/api-low/src/auth/session.service.ts | th_sessions listing is user-scoped (user_id = ? from JWT sub). |
| 53 | validate-collection-scoping:C5 | Row-scoping claimed for inbox_messages but no caller-derived predicate | services/api-low/src/me/me.service.ts:88 | .service.ts:88-90: WHERE user_id = ? bound to the JWT subject (uuidToBuf(userId)); inbox is caller-bound — heuristic C1/C5 false positive. |
| 54 | validate-collection-scoping:C1 | Collection endpoint returns inbox_messages rows belonging to other principals | services/api-low/src/me/me.service.ts:88 | .service.ts:88-90: WHERE user_id = ? bound to the JWT subject (uuidToBuf(userId)); inbox is caller-bound — heuristic C1/C5 false positive. |
| 55 | validate-collection-scoping:C2 | Permission-shaped field in inbox_messages handler with no filter | services/api-low/src/me/me.service.ts:88 | .service.ts:88-90: WHERE user_id = ? bound to the JWT subject (uuidToBuf(userId)); inbox is caller-bound — heuristic C1/C5 false positive. |
| 56 | validate-collection-scoping:C2 | Permission-shaped field in sessions handler with no filter | services/api-mid/src/domain/sessions.service.ts | GET /o/v1/me/sessions filters by caller id; permission-shaped field is a display hint. |

## Authorized-Egress (§6.19) & Collection Scoping (§6.20)

- Egress: 22 candidates checked, **0 coverage failures**; 7 mechanical rows → all refuted (internal routes are behind `InternalGuard`; user/admin directory behind permission `system.users.view`; attendance/queue behind `access.load(...)` with session scoping).
- Collections: 16 mechanical rows (HIGH×4, MEDIUM×12 raw) → all refuted; the two real caller-bound lists (`inbox_messages`, `auth_sessions`) bind on `user_id = ?` from the JWT subject. Admin-tier collections (`user_directory`, `audit_logs`, `system_roles`) are permission-gated by design (not owner-scoped).
- Caveat: a clean reconciliation means every *known* candidate was accounted for — **not** a proof of absence. Row-level rules (C1–C6) were validated here by hand against `me.service.ts:88-90`, `users.service.ts:55-80`, `audit.service.ts`, `attendance.service.ts:58-59`, `evaluations.service.ts`.

## Severity Gate (§7.15)

- Findings: 107; capability-tagged: 50; escalations applied: 7 (all R3); governance findings: 0; **blocking: false** after convergence.
- Escalations (asserted → computed): TS-001, TS-1, services-api-high:auth:0001, services-api-low:auth:0002, services-api-mid:auth:0001 (MEDIUM→CRITICAL); services-api-mid:auth:0002, services-api-mid:auth:0006 (LOW→CRITICAL).
- **Why, and how to read it honestly.** The composer found a path *anonymous → knows internal secret → forge `system.role.changed` → admin*. The two entry links are configuration findings, not network-reachable bugs:
  - `services-api-mid:auth:0002` — the documented dev secret in `.env.example` passes the ≥32-char check and production does not reject it (`env.ts:32`). Exploitable only if a deployment copies the example secret.
  - `services-api-mid:auth:0006` — the https guard on `LOW_JWKS_URL` is a substring match (`env.ts:48`). Exploitable only if an operator sets a malicious JWKS URL (operator-controlled env, not attacker input).
  Both are *gated_by_deployment_config*, which by the skill's own rule does **not** suppress R3 (only `structurally_unreachable` with a cited line can). The computed CRITICAL therefore stands as the **worst-case chain**; with per-deployment random secrets (as produced by `scripts/gen-env.mjs`) and a fixed JWKS URL, the practical exposure reduces to "secret disclosure" (MEDIUM). Fix both entry links and scope the secret and the CRITICALs disappear on re-run.
- Persona reachability: anonymous 14, lowest-tier user 28, authenticated user 28 — all report the same crown jewels (admin escalation, settings/flags writes, impersonation) via the chain above.
- **SUPPRESSED ESCALATIONS:** none. **Unprivileged personas / orphan capabilities:** see `phase-07-severity-gate.json`.
- **ORPHAN ANNEXES:** 0 (none printed as leads here: every mechanical row was refuted and listed under *What Is Sound*; 7 were additionally recorded in their judgement twin's `sibling_sites`).

## Methodology Coverage

| Methodology | Status |
|---|---|
| ASVS 4.0.3 L2 | 14 chapters (V1–V14), 210 rows: 105 PASS / 41 FAIL / 33 N/A / 31 manual |
| API Top 10 (2023) | mapped; API1=30, API2=20, API3=7, API4=4, API5=16, API8=17 |
| Web Top 10 (2025) | A01=40, A02=1, A03=7, A04=8, A05=4, A06=4, A07=20, A08=1, A09=1, A10=0 |
| LINDDUN | 4 entities × 7 threats = 28 rows (14 RISK, 14 OK) |
| STRIDE | 4 partitions (api-low, api-mid, api-high, apps-web) — max residual Medium |
| LLM Top 10 / Agentic | N/A (no LLM/MCP usage detected) |
| Authorized-Egress / Collection scoping | ran; coverage gates passed; all rows refuted |
| Scanners | semgrep (offline rules) ✔, pnpm audit ✔ (0 advisories); osv-scanner, gitleaks, trufflehog, trivy: **not available** (replaced by manual git-history regex sweep) |

### ASVS per chapter

| Chapter | PASS | FAIL | N/A | Manual |
|---|---:|---:|---:|---:|
| V1 | 11 | 3 | 2 | 3 |
| V2 | 9 | 7 | 2 | 3 |
| V3 | 14 | 3 | 2 | 1 |
| V4 | 7 | 5 | 1 | 1 |
| V5 | 8 | 1 | 3 | 1 |
| V6 | 6 | 3 | 3 | 3 |
| V7 | 6 | 4 | 0 | 4 |
| V8 | 8 | 3 | 1 | 3 |
| V9 | 5 | 4 | 1 | 2 |
| V10 | 2 | 1 | 2 | 4 |
| V11 | 8 | 2 | 1 | 2 |
| V12 | 3 | 0 | 10 | 1 |
| V13 | 7 | 2 | 5 | 1 |
| V14 | 11 | 3 | 0 | 2 |

#### ASVS FAIL rows

| ASVS | Sev | Location | Note |
|---|---|---|---|
| V1.1.2 | LOW | `docs-v2/05-auth-security.md:1` | No dedicated threat-model/STRIDE document found (grep for threat/STRIDE in docs-v2 returned nothing); security design is stated as principles, not threats and mitigations. |
| V1.4.1 | LOW | `services/api-low/src/common/guards/endpoint.guard.ts:42` | Guard fails open: if a handler lacks the EP_KEY metadata, canActivate returns true, so a route added without the endpoint decorator would have no auth, CSRF or validation (same pattern in mid/high). |
| V1.10.1 | LOW | `.github/workflows/ci.yml:55` | No source-control hardening artifacts found in repo (no CODEOWNERS, no dependabot/renovate config); CI runs pnpm audit --prod --audit-level high only (ci.yml:55). |
| V2.1.1 | LOW | `packages/api-types/src/low/schemas.ts:82` | SetPasswordBody requires only min(8) chars; ASVS 4.0.3 L2 expects >=12 (OTP is primary login, password optional). |
| V2.1.7 | LOW | `services/api-low/src/me/me.service.ts:65` | No breached/common-password check on set; only a rule that the password must not contain the phone number. |
| V2.2.1 | LOW | `services/api-low/src/auth/auth.service.ts:70` | Password login has per-phone durable limit (20/15min) plus guard limits, but no progressive lockout/notification; Phase 5 flagged as LOW (CWE-307). |
| V2.7.6 | LOW | `services/api-low/src/common/crypto.ts:19` | CSPRNG (randomInt) but code is 5 digits (~16.6 bits), below the 20-bit minimum; mitigated by 3 attempts and 120s TTL. |
| V2.8.4 | LOW | `services/api-high/src/auth/jwt-verifier.ts:50` | Step-up token is replayable within its TTL (no jti single-use tracking); Phase 5 flagged as LOW. |
| V2.10.1 | MEDIUM | `services/api-high/src/internal/internal.guard.ts:34` | Service-to-service auth relies on one static INTERNAL_SHARED_SECRET (X-Internal-Token) common to all services, no rotation or per-service identity; optional IP allowlist. Phase 5 MEDIUM. |
| V2.10.4 | LOW | `services/api-low/.env.example:19` | Secrets load from env (zod-validated, min 32 chars) not source, but .env.example ships predictable dev OTP_PEPPER/INTERNAL_SHARED_SECRET values; no secret-manager/vault. Phase 5 LOW. |
| V3.3.2 | LOW | `services/api-low/src/config/env.ts:35` | Only an absolute 14-day refresh lifetime; no idle timeout is enforced (last_active_at is tracked but not used to expire). L2 expects timeouts for re-auth on inactivity; risk accepted for PWA UX. |
| V3.4.1 | LOW | `services/api-low/src/auth/cookie.ts:10` | Refresh cookie sets Secure (forced true in prod, env.ts:82) but lacks __Secure-/__Host- prefix (names isra_rt/isra_rt_admin, path /c/v1/auth, optional Domain). |
| V3.4.4 | LOW | `services/api-low/src/auth/cookie.ts:10` | Cookie not host-locked: __Host- prefix absent and optional COOKIE_DOMAIN widens scope to subdomains; path /c/v1/auth narrows exposure. |
| V4.1.5 | LOW | `services/api-high/src/common/guards/endpoint.guard.ts:32` | Global EndpointGuard returns true when a handler has no @Route metadata (fails open); same in api-mid (guard:32) and api-low (guard:44). Not currently exploitable but default should be deny. |
| V4.1.5 | LOW | `services/api-high/src/auth/jwt-verifier.ts:35` | Access JWT sid not checked against session revocation in high/mid; logged-out or revoked sessions keep access until token expiry (15 min). |
| V4.2.1 | LOW | `services/api-high/src/domain/overview.service.ts:52` | H-01 overview returns last 5 audit entries to any role holder without requiring system.audit.view (permission-scoped data leak). |
| V4.3.1 | LOW | `services/api-high/src/auth/jwt-verifier.ts:50` | Step-up token is replayable across all step-up endpoints for its whole TTL (no jti/single-use or operation binding); weakens MFA-style protection of admin actions. |
| V4.3.3 | MEDIUM | `services/api-low/src/internal/events.service.ts:72` | One shared secret lets any internal peer forge system.role.changed and mint admin claims; no separation of duties or per-sender authorization. |
| V5.1.5 | MEDIUM | `apps/web-main/src/lib/utils/nav.ts:4` | safeNext checks only '/', '//' and '/\'; '/\t/evil.com' or '/\n/evil.com' pass and browsers strip tab/newline, yielding open redirect (Phase5 INJ-WM-001). |
| V6.2.5 | LOW | `services/api-low/src/common/envelope.interceptor.ts:51` | SHA-1 used for ETag (also in mid/high). Non-security use (cache validator), no collision impact; flag as weak-hash hygiene. |
| V6.3.3 | LOW | `apps/web-main/src/lib/api/http.ts:54` | Client Idempotency-Key/device id fall back to Date.now()+Math.random() when crypto.randomUUID is unavailable (also web-admin http.ts:54, device.ts:6). Not secrets; low impact. |
| V6.4.1 | LOW | `services/api-low/.env.example:19` | Predictable dev OTP_PEPPER / INTERNAL_SHARED_SECRET in committed .env.example pass the min(32) check; prod only enforces PASSWORD_PEPPER and key presence, not strength/uniqueness of OTP_PEPPER or shared secret (env.ts:38,72). |
| V7.1.1 | LOW | `services/api-low/src/sms/console.provider.ts:10` | Dev ConsoleSmsProvider logs the full plaintext OTP. Mitigated: env.ts:73 forbids non-faraz provider in production; dev/test only. |
| V7.1.3 | LOW | `services/api-low/src/common/exception.filter.ts:75` | Security events (401/403, login/OTP failures, token reuse) are not logged by the filter or auth.service; only 5xx/unhandled errors are logged, limiting detection of auth abuse. |
| V7.2.1 | LOW | `services/api-low/src/common/exception.filter.ts:73` | Access-control and authentication failures (401/403) are not logged server-side, so they cannot be reviewed; only audit_logs covers successful high-tier admin mutations. |
| V7.4.4 | LOW | `services/api-low/src/main.ts:14` | Bootstrap failure path uses console.error (message only) bypassing pino; unstructured but no secrets. Also exception.filter.ts:73 logs raw HttpException.message for 5xx which could carry internal text. |
| V8.1.6 | LOW | `services/api-low/src/outbox/maintenance.service.ts:41` | No retention/erasure path found for PII (users.phone, profiles names, user_directory copy in api-high, auth_sessions.ip kept until revoked+30d); only expired tokens/sessions purged. |
| V8.3.2 | LOW | `services/api-low/src/sms/console.provider.ts:10` | Dev ConsoleSmsProvider logs full plaintext OTP (phone masked). Dev-only provider but no hard guard shown; user-facing leakage risk if enabled in production (Phase 5 SS-1). |
| V8.3.5 | LOW | `services/api-low/src/auth/otp.service.ts:67` | Phone and IP stored in plaintext (otp_challenges, auth_sessions.ip, user_directory.phone); no field-level encryption or hashing; admin API returns full phone (high users.service.ts:38). Access control relies on permissions. |
| V9.1.1 | LOW | `apps/web-main/src/lib/api/config.ts:10` | API base URLs default to http://localhost and CSP/ws origins derive from them; nothing rejects non-https values in a production build (Phase 5 mitm-0001). |
| V9.2.1 | LOW | `services/api-low/src/config/env.ts:51` | FARAZ_BASE_URL and INTERNAL_URL_MID/HIGH are z.url() only; prod validation does not require https, so Faraz Api-Key/OTP and X-Internal-Token could go over http if misconfigured (Phase 5 api-low mitm-0001). |
| V9.2.1 | LOW | `services/api-mid/src/config/env.ts:48` | LOW_JWKS_URL https guard accepts any URL containing 'localhost' or '127.0.0.1' as substring, so an http JWKS URL can pass in production; INTERNAL_URL_LOW (line 33,47) also lacks https check. |
| V9.2.2 | LOW | `services/api-mid/src/db/data-source.ts:15` | MySQL connection has no ssl option and no loopback/remote host guard; if DB_HOST is remote, credentials and data travel unencrypted (Phase 5 mid mitm-0003). |
| V10.3.2 | MEDIUM | `.github/workflows/ci.yml:41` | Actions pinned by mutable major tags (checkout@v4, pnpm/action-setup@v4, setup-node@v4) in ci.yml:38-42 and deploy.yml:32-34, the deploy job holding SSH secrets; no dependabot.yml. Lockfile is frozen (--frozen-lockfile) which is g |
| V11.1.4 | LOW | `services/api-mid/src/common/guards/endpoint.guard.ts:65` | mid/high rate limits use in-memory per-instance counters (approximate); limits multiply across instances. Only low uses durable scope for sensitive routes. Acceptable for non-sensitive paths. |
| V11.1.7 | LOW | `services/api-mid/src/common/idempotency.interceptor.ts:34` | Idempotency key is optional; endpoints marked idempotency:key skip protection when header absent. Mitigated by DB unique constraints on core business actions. |
| V13.1.4 | MEDIUM | `services/api-high/src/common/guards/endpoint.guard.ts:54` | api-high verifies JWT and loads roles but does not check session revocation (Phase 5 token_scope finding), so revoked-session access tokens stay valid until expiry (15 min). |
| V13.2.1 | MEDIUM | `services/api-low/src/internal/internal.guard.ts:34` | Internal service-to-service routes use one static INTERNAL_SHARED_SECRET shared by low/mid/high with no caller identity or per-event-type scope; compromise of one service authorizes all event types. Mitigated by timing-safe compar |
| V14.1.3 | LOW | `services/api-low/src/config/env.ts:12` | NODE_ENV defaults to development and prod fail-fast guards (CORS, secrets) key on NODE_ENV==='production'; misconfigured host silently runs lax mode (Phase5 finding). |
| V14.2.1 | MEDIUM | `scripts/deploy-ssh.sh:191` | CI audits prod deps at high+ with frozen lockfile, but production host runs unlocked 'npm install' so deployed versions may differ from audited lockfile (DEP-002). |
| V14.4.3 | LOW | `apps/web-admin/scripts/gen-htaccess.mjs:15` | web-admin CSP allows script-src 'unsafe-inline' (web-main uses nonce/hash with script-src 'self'); weakens XSS mitigation on admin SPA. |

## LINDDUN privacy risks

| Entity | Threat | Sev | Note |
|---|---|---|---|
| auth_sessions | Linkability | LOW | Stable client device_id (localStorage isra.deviceId) plus ip stored per session and embedded as 'did' JWT claim (token.service.ts:37) lets sessions of one user be linked across logins; scoped to low DB and user's own tokens, not r |
| auth_sessions | Identifiability | LOW | ip (<=45) and device_label (UA browser/OS, <=80) stored with user_id in clear; combined they re-identify a user's device/location. ip is write-only (never selected after insert) so retention adds no functional value. |
| auth_sessions | Unawareness | LOW | Users see device label and can revoke sessions, but no evidence the UI/consent text tells them that IP address is recorded with each login session. |
| auth_sessions | Non-compliance | LOW | Only revoked sessions are purged (>30d); never-revoked/expired sessions keep ip/device PII indefinitely, and no account-deletion path purges auth_sessions was found; no documented retention for ip. |
| profiles | Linkability | LOW | Names are replicated with phone and stable userId to mid/high user_directory (outbox user.registered), enabling cross-schema linking of name+phone+activity; inherent to design, internal-only. |
| profiles | Identifiability | MEDIUM | Admin user search does LIKE on CONCAT(first_name,last_name) and phone; names are denormalised into audit_logs target_label/summary (users.service.ts:123-124), so real names are embedded in long-lived audit text. |
| profiles | Non-compliance | MEDIUM | No profile/account deletion or erasure endpoint found in api-low; maintenance purges only outbox/otp/sessions, so names persist indefinitely in profiles and in mid/high user_directory and audit_logs; no retention policy or erasure |
| user_directory | Linkability | LOW | api-high replicates phone as UNIQUE key (uq_directory_phone) plus the same user_id as api-mid/low, so records across the 3 schemas and audit_logs are trivially joinable by phone/user_id. Mid correctly omits phone (mid migration li |
| user_directory | Identifiability | MEDIUM | Admin user list/detail returns full phone plus first/last name (users.service.ts:38,67) and supports LIKE search on phone (line 59); high.controller.ts:35 returns own phone. Gated to admin tier (CS-HIGH-R1) but phone is not masked |
| user_directory | Detectability | LOW | Admin search by partial phone LIKE lets an admin confirm whether a given number is registered (existence oracle); limited to authenticated admin-tier callers, so low. Mid exposes only names via LEFT JOIN (members.service.ts:21, qu |
| user_directory | Disclosure of information | MEDIUM | user.registered outbox payload carries plaintext phone to every consumer incl. api-mid, which discards it (mid events.service.ts:40) so over-shared in transit; outbox payload kept 7d after publish (maintenance.service.ts:38) and i |
| user_directory | Non-compliance | MEDIUM | No deletion/erasure path for user_directory: maintenance only purges outbox/inbox (lines 38-39); no user.deleted event or account-deletion handler found in api-low/mid/high src, so phone/names persist in 3 schemas indefinitely and |
| users | Linkability | LOW | users.phone is a stable cross-service key: replicated in user.registered outbox payload (auth.service.ts:120) to api-high user_directory (events.service.ts:51) and used raw in rate-limit key pw:ph:<phone> and otp_challenges. Enabl |
| users | Non-compliance | LOW | No user deletion/erasure/export endpoint found in api-low me/* ; user_directory (api-high) has no purge; otp_challenges rows with phone+ip kept until expiry+1 day (line 38). Retention is bounded for OTP but data-subject rights for |

## STRIDE Tables

# STRIDE: apps-web (apps/web-main + apps/web-admin)

Partition scope: `web-main` (public SvelteKit 2 SSR PWA, adapter-node) and `web-admin` (static SPA behind LiteSpeed `.htaccess`). Both are browser clients of api-low (`/c/v1`), api-mid (`/o/v1` + Socket.IO) and, for admin, api-high (`/s/v1`). Neither holds server secrets; the access token lives in JS memory, the refresh token is an HttpOnly cookie sent only on auth paths. Evidence: Phase 5 findings (`phase-05-*-apps-web-*.jsonl`) and files read at the cited lines. Residual risk is dominated by one Medium item (open-redirect bypass in `safeNext`, web-main, INJ-WM-001); all other rows are Low. Rating key: each of S/T/R/I/D/E is a letter L/M/H residual, or `-` if not applicable.

| Entry/Boundary | S | T | R | I | D | E | Notes/Mitigation |
|---|---|---|---|---|---|---|---|
| web-main post-login redirect (`?next` -> `goto`) | M | - | - | L | - | - | `safeNext` (`apps/web-main/src/lib/utils/nav.ts:2-5`) rejects non-`/`, `//` and `/\` prefixes only. Tab/LF/CR after the leading slash (e.g. `/%09/evil.com`) is stripped by URL parsing and resolves off-origin (INJ-WM-001, MEDIUM/LIKELY). Enables phishing after login. **Rec:** resolve with `new URL(next, origin)`, require `url.origin === origin`, and reject control chars; return `pathname+search+hash`. web-admin variant is path-only SPA `goto` (refuted in apps-web-admin:methodology:0004). |
| web-admin post-login redirect | L | - | - | - | - | - | Same `safeNext` shape but SPA router `goto` cannot leave origin (phase-05 admin methodology:0004). Apply the same hardening for parity. |
| Access token handling (browser memory, Bearer) | L | L | - | L | - | - | Token held in memory only (`apps/web-admin/src/lib/auth/auth.svelte.ts:35,122-131`); only a hint flag, deviceId and PWA-dismiss timestamp in localStorage (`web-main/src/lib/auth/auth.svelte.ts:12-26`; refutation apps-web-admin:methodology:0003). Bearer header added in `src/lib/api/http.ts:63`. Residual: token readable by any XSS (see CSP rows). |
| Refresh cookie (HttpOnly, cross-origin to api-low) | L | L | - | L | - | - | `credentials: 'include'` only when caller sets it for auth paths, otherwise `'omit'` (`web-main/src/lib/api/http.ts:73`, same in web-admin). CSRF/SameSite enforcement is server-side (out of partition; see api-low rows). |
| web-main CSP + security headers (SSR) | - | L | - | L | - | - | SvelteKit `csp` mode auto with nonce/hash, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` (`web-main/svelte.config.js:11-27`). Headers: nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS when https or `x-forwarded-proto` (`hooks.server.ts:6-11`). `style-src 'unsafe-inline'` is a minor gap. |
| web-admin CSP (static, `.htaccess` generated) | - | L | - | M | - | M | `script-src 'self' 'unsafe-inline'` (`web-admin/scripts/gen-htaccess.mjs:15`, apps-web-admin:auth:0002) weakens XSS containment where an admin token with write power lives in JS memory. No `{@html}`/innerHTML sinks found (phase-05 note), so exploitability is defence-in-depth only. **Rec:** drop `'unsafe-inline'` (SPA bundles are external) or use hashes; keep audit of `{@html}` in CI. |
| Build-time API URL config / CSP connect-src | M | L | - | M | - | - | Defaults fall back to `http://localhost:3001/3002` and CSP/ws origins derive from them (`web-main/src/lib/api/config.ts:10-11`, `svelte.config.js:5-6`); web-admin does the same and only emits HSTS if both URLs are https (`gen-htaccess.mjs:11`). Nothing fails the build on non-https in production (apps-web-main:mitm:0001, LOW/POSSIBLE). **Rec:** fail the production build when `PUBLIC_API_*`/`VITE_API_*` is unset or not `https://`. |
| Admin step-up token cache (`X-Step-Up-Token`) | - | - | - | L | - | M | Step-up header added at `web-admin/src/lib/api/http.ts:64`; cleared only on `AUTH_STEP_UP_REQUIRED` (`utils/stepup.ts:12`). `#reset()` (`auth.svelte.ts:125-131`) does not call `stepUp.clear()`, so a step-up token can be reused by a subsequent user on a shared browser until expiry (apps-web-admin:auth:0001, LOW/POSSIBLE; server still verifies the subject). **Rec:** call `stepUp.clear()` in `#reset()`. |
| Socket.IO client to api-mid (`/o/v1/socket.io`) | L | L | - | L | L | - | JWT sent in handshake `auth: { token }`, reconnection disabled, `forceNew` (`web-main/src/lib/api/midClient.ts:56-58`); no token in URL. Server-side verification, room scoping and flood limits are api-mid concerns. The ws:// origin only occurs in the http default (see config row). |
| Service workers (web-main, web-admin) | - | L | - | L | L | - | Handle only same-origin GETs; API (other origin) is never cached (`web-main/src/service-worker.ts:32-37`, mirrored in web-admin). Navigations are network-first with an offline fallback (`:40-43`); only a fixed `ASSETS` allowlist is cache-first (`:48-51`), so no authenticated response is stored. |
| Reflected/DOM injection: `{@html}`, `routeUrl` href | - | L | - | - | - | - | Sole `{@html}` is a static style literal (`GuestLanding.svelte:142`, INJ-WM-003 refuted). `session.location.routeUrl` is rendered as href (`sessions/[id]/+page.svelte:69`) but contract restricts it to https (`packages/api-types` session.ts:28 per INJ-WM-002) and CSP blocks `javascript:`. Residual Low; relies on server-side enforcement in api-mid. |
| Client-side authorization (admin UI route/permission gating) | - | - | - | - | - | L | UI gating is cosmetic; every `/s/v1` call is authorized server-side by api-high endpoint guard (`services/api-high/src/common/guards/endpoint.guard.ts`). A tampered client cannot gain access beyond the token's permissions. |
| Secrets in client bundles | L | - | - | L | - | - | Phase 5 secret_sprawl runs for both apps produced no findings (empty `.jsonl`); CLAUDE.md forbids client keys (Map.ir server-only). Only public API URLs and `CLIENT_ID = 'web-main'` (`config.ts:12`) are embedded. |
| Logging/repudiation of client actions | - | - | L | - | - | - | Browser apps have no audit trail of their own; non-repudiation of admin writes depends on api-high audit log (out of this partition). Step-up gating on sensitive writes (`web-admin/src/lib/utils/stepup.ts:6`) adds attribution. |
| web-main SSR server (adapter-node) request handling | L | L | L | L | M | L | Stateless SSR with no server-side secrets/DB; the `handle` hook only adds headers (`hooks.server.ts:4-13`). Residual DoS is generic Node SSR exposure behind LiteSpeed/proxy; no rate limiting is configured in the app. **Rec:** enforce rate/connection limits at the proxy/LiteSpeed layer and cache prerenderable pages. |

## Residual summary

- High: none.
- Medium: open-redirect bypass (web-main `safeNext`); admin CSP `'unsafe-inline'`; production http fallbacks of API URLs; step-up token surviving logout; SSR DoS exposure (infra-level).
- All other rows Low. No source files were modified.


# STRIDE: services-api-high (services/api-high, /s/v1 admin)

Admin-tier NestJS service. Trust boundaries: (1) admin browser to `/s/v1/system/*` (RS256 JWT minted by api-low, verified locally via JWKS); (2) internal service to `/s/internal/v1/events` (shared secret); (3) outbound fetch to api-low/api-mid (outbox, overview stats); (4) MySQL (raw parameterized SQL); (5) unauthenticated health and docs routes. Mitigations are strong at the authorization layer (DB-derived roles, strict zod bodies, locked last-holder check, audit in same transaction). Residual risk is concentrated in session revocation lag, a single shared internal secret, and replayable non-scoped step-up tokens. Max residual: Medium. Cited lines were read directly; Phase 5 finding IDs are referenced.

Legend: Y = threat applicable, - = not material. Residual in Notes.

| Entry/Boundary | S | T | R | I | D | E | Notes/Mitigation |
|---|---|---|---|---|---|---|---|
| Admin bearer auth: GET/PUT `/s/v1/system/*` (high.controller.ts:31-91) | Y | - | - | - | - | Y | Spoof: JWT verified with RS256 pinned, iss/aud, remote JWKS only, `lvl=low` (jwt-verifier.ts:24-35). Gap: `sid` not checked against revocation, so a revoked/stolen session works for the access TTL (endpoint.guard.ts:54, token_scope:0001, auth:0007). Missing `requiredClaims: ['exp']` (jwt-verifier.ts:28, auth:0003). **Residual Medium.** Rec: add periodic/cached session-status check against low (or short TTL + `perm_ver`/sid denylist) and require `exp`. |
| Authorization (EndpointGuard) (endpoint.guard.ts:49-64) | - | - | - | Y | - | Y | Roles/perms loaded from DB, not JWT claims; empty roles rejected; per-endpoint permission enforced (endpoint.guard.ts:55-59). Fail-open when handler has no `@Route` metadata (endpoint.guard.ts:32, auth:0005). H-01 overview exposes last 5 audit rows without `system.audit.view` (CS-HIGH-1). **Residual Low.** Rec (hygiene): default-deny when EP_KEY missing; gate or strip audit in overview. |
| Role/grant mutation H-22/H-23 (users.service.ts:99-150) | - | Y | Y | - | - | Y | Body zod `.strict()` with enum keys (idor:0002); `touchesDeveloper` blocks non-developers; roles taken under `FOR UPDATE` with last-holder check (users.service.ts:102-106); audit row written in same transaction with actor from DB (users.service.ts:120-121, 145-146). Escalation/repudiation refuted (auth:0009). **Residual Low.** |
| Step-up on sensitive endpoints (endpoint.guard.ts:60-63, jwt-verifier.ts:46-54) | Y | - | Y | - | - | Y | Step-up checks `lvl`, `sub`, `sid` only; no `jti` single-use, no action binding (jwt-verifier.ts:50, token_scope:0002, auth:0004). Captured token can drive any step-up endpoint for its TTL (~300s). **Residual Low** (needs prior token capture plus valid admin session). Rec: add action/`aud` claim and jti tracking if scope grows. |
| Settings write H-30/H-31 and audit read H-40 (settings.service.ts:53-68, audit.service.ts:50,74-87) | - | Y | Y | Y | - | - | Settings update transactional with audit insert (settings.service.ts:53,68); audit inserts only, no UPDATE/DELETE of audit_logs in maintenance (maintenance.service.ts:38-39 touches only outbox/inbox). LIKE input escaped, params bound (audit.service.ts:38,75-80). Audit read gated by `system.audit.view` (CS-HIGH-R2). **Residual Low.** |
| Internal ingest `POST /s/internal/v1/events` (internal.guard.ts:23-40, events.controller.ts:14-24) | Y | Y | - | - | Y | Y | Auth is one static `X-Internal-Token`, timing-safe compare, length cap, per-IP fail throttle (internal.guard.ts:31-38). Same secret shared by low/mid/high, `INTERNAL_ALLOWED_IPS` defaults empty and is optional (env.ts:34; auth:0001). A leaked secret from any service lets an attacker forge `user.registered`-style events into user_directory and, via BOOTSTRAP_DEVELOPER_PHONE logic, potentially grant developer (events.service.ts:55,75; auth:0002). Payload validated by zod (events.controller.ts:10-22); dedupe via `INSERT IGNORE inbox_events` (events.service.ts:45). **Residual Medium.** Rec: per-service-pair secrets or HMAC-signed bodies with timestamp; require non-empty INTERNAL_ALLOWED_IPS in production; make BOOTSTRAP_DEVELOPER_PHONE effective only while no developer exists. |
| JWKS trust root `LOW_JWKS_URL` (env.ts:26, jwt-verifier.ts:24) | Y | Y | - | - | Y | Y | Every admin token depends on this fetch; `z.url()` allows http, https not enforced in production (auth:0006). Cache 10 min, cooldown 15s, timeout configurable (jwt-verifier.ts:24); JWKS outage maps to SERVICE_UNAVAILABLE (jwt-verifier.ts:40). **Residual Low** (on-path key substitution requires network position on internal hop). Rec: enforce https in production env schema. |
| Outbound fetch: outbox to low/mid, overview stats (outbox.service.ts:83-87, overview.service.ts:33) | Y | - | - | Y | Y | - | Fixed env-configured base URLs (no user-controlled URL, no SSRF); timeout via `AbortSignal.timeout`; shared secret sent in header, so TLS on those hops is deployment-dependent. Outbox poll `OUTBOX_POLL_MS` min 100 (env.ts:36) with at-least-once + inbox dedupe. **Residual Low.** |
| Request limits and DoS (bootstrap.ts:24,31,46; endpoint.guard.ts:38-41,66-79; rate-limit.service.ts:18-22) | - | - | - | - | Y | - | JSON body capped 16kb, helmet enabled, content-type enforced, global per-IP and per-endpoint limits. Limiter is in-process memory (per instance, resets on restart) by project lock; effective IP depends on `TRUST_PROXY` setting (bootstrap.ts:24). Behind LiteSpeed a wrong value lets clients spoof IP buckets. Admin surface is low-traffic. **Residual Low.** |
| Health and docs: `/s/health/live|ready`, swagger page (infra.controller.ts:14-26, bootstrap.ts:60-63) | - | - | - | Y | - | - | Unauthenticated; health returns only status, contract version, uptime (infra.controller.ts:15,25). Swagger UI loads scripts from cdnjs under restrictive CSP with `unsafe-inline` (bootstrap.ts:60-63), a third-party script dependency if docs are enabled in production. **Residual Low.** Rec (hygiene): disable docs in production or add SRI. |
| Logging / error output (exception.filter.ts, request-id.middleware.ts) | - | - | Y | Y | - | - | Request-id per request in context (request-context.ts:13); error envelope uses AppError codes. Not deeply audited here; Phase 5 injection partition produced no findings for this service. **Residual Low.** |

Rows: 10. No source files modified.


# STRIDE: services-api-low (services/api-low, /c/v1)

Scope: 24 HTTP handlers under `/c/v1` (OTP/password auth, refresh/logout/step-up, `/me*`, public sessions, JWKS, health), the internal event receiver `POST /c/internal/v1/events`, the outbox publisher and cleanup schedulers, and outbound calls (Faraz SMS, mid/high internal REST). Evidence: surface rows in phase-02-surface.json, Phase 5 findings for this partition, and source regions read (cited file:line). Residual risk is judged after the cited mitigations. Overall: no High residual; the Medium items are the single shared internal secret (cross-service forgery of role claims) and global-budget SMS DoS. Recommendations follow the table.

Legend: cells give the threat in brief and residual (L/M/H); `-` means not applicable.

| Entry/Boundary | S | T | R | I | D | E | Notes/Mitigation |
|---|---|---|---|---|---|---|---|
| POST `/auth/otp/request`, `/auth/otp/verify` (public, L-01/L-02) | Phone-number impersonation via OTP guessing: L | OTP row tampering: L (parameterized SQL, otp.service.ts:49,67) | No security log of OTP issue/verify outcomes: L | User enumeration: L (identical response, otp.service.ts:41) | Global daily SMS budget `sms:budget:<day>` exhausted by anonymous callers blocks all login (otp.service.ts:59, auth:0001): **M** | - | Attempts counted by atomic conditional UPDATE, HMAC + timingSafeEqual, single use (otp.service.ts:96-124; auth:0008 refuted brute force). Resend cooldown (otp.service.ts:48-55). Rec: per-IP/ASN sub-budgets before the global counter, alert at 80% budget, fallback path (password login) kept outside the budget. |
| POST `/auth/login/password` (public) | Credential stuffing: L (argon2id, per-IP, ip+phone, and phone limits; `burn` equalizes timing, auth.service.ts:79) | - | No log of failed logins (no Logger in auth.service.ts/session.service.ts): L | Timing/user enumeration: L (burn on unknown or inactive user) | Per-phone counter `pw:ph:<phone>` (20/15 min) lets anyone lock a victim's password login (auth.service.ts:70, auth:0003): L | - | Argon2 floors in env.ts:58 permit weak parameters if misconfigured (crypto:0001): L. Victim can still use OTP login. |
| POST `/auth/refresh`, `/auth/logout` (refreshCookie/bearerOrCookie) | Stolen refresh token replay: L (single-use sha256 hash, FOR UPDATE, reuse revokes session, session.service.ts:104-131) | Cookie CSRF: L (Origin allowlist + SameSite, endpoint.guard.ts:70-75) | Revocation not logged: L | Token leakage to logs: L (pino redacts authorization/cookie, app.module.ts:37) | Refresh flood: L (global per-IP limit first, endpoint.guard.ts:50) | Suspended/deactivated user keeps refreshing: **M->L** (status checked only at login, auth.service.ts:64; session.service.ts:99-135, auth:0004) | No absolute session lifetime: each rotation resets expiry (session.service.ts:125, TS-002): L. Rec (Low-priority): add `auth_sessions.absolute_expires_at` and a `users.status` check in rotate(). |
| Bearer authentication, EndpointGuard (global, all `/me*`) | JWT forgery/alg confusion: L (RS256 pinned, iss/aud/lvl bound, token.service.ts:52,60; auth:0006, TS-R1 refuted) | - | - | - | Per-request session lookup is cached 5 s: L (endpoint.guard.ts:96) | Guard returns true when a handler lacks `@Route` (endpoint.guard.ts:43-44, auth:0005): L | All 24 HTTP handlers carry `@Route` (TS-R2). Rec: invert to deny-by-default with an explicit `@Public()`/`@Internal()` marker so a future handler cannot fail open. |
| Step-up (`/auth/step-up/otp/*`, PUT `/me/password`) | Step-up token reuse across sessions: L (bound to user+session, auth.service.ts:160-165) | - | Password change not logged: L | - | - | Step-up token accepted as access: L (refuted, TS-R1) | Fresh OTP within STEP_UP_TTL_SEC or signed step-up token required (auth.service.ts:162-163). |
| `/me`, `/me/profile`, `/me/sessions*`, `/me/inbox*`, `/me/points` (bearer) | - | Mass-assignment on PATCH profile: L (zod validation at guard, endpoint.guard.ts:56) | - | IDOR on `{id}` routes: L (user_id scoped SQL; idor:0001 refuted) | List endpoints bounded by LIST contract: L | Cross-user access: L | JSON body capped at 16 kb (bootstrap.ts:48). Content-Type enforced (endpoint.guard.ts:60-64). |
| GET `/public/sessions[/{id}]` (public, SSR source) | - | - | - | Over-exposure of session/teacher fields: L (public DTO from contract; not re-verified per field) | Unauthenticated list scraping: L (global per-IP limit, LIST pagination) | - | Residual depends on web-main caching; no per-route finding raised. |
| GET `/.well-known/jwks.json`, `/health/live`, `/health/ready` | - | - | - | Only public keys exposed: L; `/health/ready` content not audited in depth | Probe flood: L (global per-IP limit) | - | Ephemeral dev key if `JWT_PRIVATE_KEY_PEM` missing (keys.service.ts:21), prod guard in env.ts:70-82 keyed on NODE_ENV (deployment:0001, NODE_ENV defaults to development): L. Rec: fail startup unless NODE_ENV is explicitly set. |
| POST `/c/internal/v1/events` (InternalGuard, PUBLICLY_REACHABLE_INTERNAL_ROUTE flag) | Any holder of the single shared secret can impersonate mid or high (internal.guard.ts:33-34, TS-001): **M** | Forged `system.role.changed` writes `user_claims` (system_roles, grants) used to mint admin claims (events.service.ts:72-83, auth:0002): **M** | Events carry no producer identity; inbox dedupe stores only eventId/type (events.service.ts:52): **M** | - | Brute-force of secret bounded to MAX_FAILS per IP window, in-memory map (internal.guard.ts:30-37): L; the map is cleared at 10k entries and per instance: L | Privilege escalation via forged role event: **M** (see I/T) | Mitigations: constant-time compare (internal.guard.ts:34), optional IP allowlist `INTERNAL_ALLOWED_IPS` (env.ts:63, default empty so route is publicly reachable on the same port), versioned monotonic `perm_ver`, zod payload parse, transactional inbox dedupe. Rec: per-sender secrets or HMAC-signed events with `producer` claim, allow `system.role.changed` only from api-high; require a non-empty IP allowlist in production; bind internal routes to a separate path blocked at LiteSpeed. |
| Outbox publisher / maintenance schedulers (`setInterval`) | Events sent to a spoofed peer if `INTERNAL_URL_*` is http or hijacked: L (mitm:0001, env.ts:51,61-62 only `z.url()`) | Outbox row tampering requires DB access: L | Outbox is durable with attempts/backoff (outbox.service.ts:9,49): L | Secret and payload sent in clear if http: L | `running` flag prevents overlap; BATCH 50, SKIP LOCKED (outbox.service.ts:8,43-49): L | - | Rec: require https for FARAZ_BASE_URL and INTERNAL_URL_* when NODE_ENV=production. |
| Outbound SMS (Faraz) / ConsoleSmsProvider | Provider spoof via http base URL: L (mitm:0001) | - | - | Dev provider logs full OTP (console.provider.ts:10, SS-1): L, blocked in production by env.ts:73 | SMS provider outage fails OTP issue and voids challenge (otp.service.ts:78-83): L (timeout SMS_TIMEOUT_MS) | - | Log masks phone (otp.service.ts:82); no OTP in production logs. |
| CLI `users:replay` (cli_admin) | Operator-only, shell access required: L | Could replay events into DB: L | Not logged: L | - | - | Requires server shell: L | No finding in Phase 5; operator trust boundary. |
| Config/secrets (`.env.example`, env.ts) | - | - | - | Predictable example `OTP_PEPPER` / `INTERNAL_SHARED_SECRET` pass min(32) and have no production reject-list (.env.example:19, crypto:0002): L | - | Known pepper lets an attacker with DB read compute OTP HMACs: L | Rec: reject `dev-*` placeholder values when NODE_ENV=production. |

Cross-cutting notes
- Repudiation: grep shows Logger use only in keys.service.ts and otp.service.ts (sms failure); no structured security-event log for login success/failure, refresh reuse, session revoke or password change. Residual Low for this app size, but a dedicated auth event log helps incident response.
- IP trust: rate limits and the internal allowlist key on `req.ip`; `TRUST_PROXY` defaults to 0 (env.ts:15). Behind cPanel/LiteSpeed an incorrect hop count either collapses all clients into one IP bucket (self-DoS) or lets `X-Forwarded-For` spoofing evade per-IP limits. Verify in deployment; residual Low-Medium, not confirmed.
- Session revocation is enforced only in api-low (endpoint.guard.ts:96-100); mid/high accept the JWT until exp (access TTL 15 min, TS-003): Low.

Recommendations (residual >= Medium)
1. Internal events: per-sender credentials or signed events with producer allowlist per event type; mandatory IP allowlist in production.
2. OTP SMS budget: partition the budget (per IP/prefix/day) so anonymous traffic cannot consume the global cap; alerting at threshold.


# STRIDE: services/api-mid (`/o/v1`, `/o/internal/v1`, Socket.IO)

api-mid is the session/attendance/queue/evaluation service. It verifies low-issued RS256 JWTs locally via JWKS (`auth/jwt-verifier.ts:27-39`), derives in-session RBAC from DB membership rather than JWT claims (`domain/access.service.ts:57-73`), and exposes a shared-secret internal API plus an authenticated Socket.IO channel. The partition has 31 surface rows (22 user HTTP, 2 health, 5 internal, 1 websocket, 2 schedulers, 1 outbound call). Residual risk is dominated by one Medium item: the unscoped shared internal secret (Phase 5 auth:0001 / TS-1). All other Phase 5 findings are Low or Info. Evidence is limited to files actually read; levels are residual after the cited mitigations.

Legend: each STRIDE cell is the residual rating (L/M/H, `-` = not applicable) with the key mitigation or gap. Citations are file:line under `services/api-mid/src/`.

| Entry/Boundary | S | T | R | I | D | E | Notes/Mitigation |
|---|---|---|---|---|---|---|---|
| User REST `/o/v1/*` (M-01..M-43) via global EndpointGuard | L | L | M | L | L | L | S: Bearer JWT, RS256 pinned, iss/aud/exp checked, `lvl==='low'`, token <=4096 B (`auth/jwt-verifier.ts:31-40`). T: zod validation from the contract (`common/guards/endpoint.guard.ts:46`), JSON-only content type (`:42`), 16 KB body limit (`bootstrap.ts:47`), helmet+CORS allowlist (`bootstrap.ts:31-46`). R: request logs redact authorization/cookie/x-internal-token (`app.module.ts:49`) but no durable audit trail of who changed roles/transitions was found in `domain/` (grep for audit/actor found none); residual Medium for role and transition changes. D: global per-IP limit and per-endpoint limit (`endpoint.guard.ts:38,45`), memory-scope counters are per instance. E: guard fails open for handlers lacking `@Route` metadata (`endpoint.guard.ts:32`, auth:0003, Low). Recommend: write session-role/transition changes to an append-only audit table (or emit to high audit). |
| JWT / JWKS trust (low -> mid) | L | L | - | L | L | L | Local verify, no hop per request; unknown kid triggers JWKS refetch with 15 s cooldown (`jwt-verifier.ts:16,27`). JWKS timeout maps to 503, not 401 (`:47`). Revoked sessions stay valid until access expiry (<=15 min), explicitly accepted (`:17`). Prod env check for JWKS transport is a substring match, so `https`-less URLs containing `localhost`/`127.0.0.1` pass (`config/env.ts:48`, auth:0006 / mitm:0002, Low). INTERNAL_URL_LOW https not enforced (`env.ts:47`, mitm:0001, Low). |
| In-session RBAC (membership/queue/eval) | L | L | L | L | - | L | Permissions computed from DB roles each request, not JWT (`access.service.ts:57-73`); draft sessions hidden as NOT_FOUND for non-members (`:70`). Evaluation needs `eval.submit` (supporter, teacher only; manager alone excluded: `domain/rules.ts:13-15`, `evaluations.service.ts:74,82`), self-evaluation blocked (`:87`), one eval per queue item (`db/migrations/1727800000000-InitSchema.ts:87`). Idor phase refuted IDOR on M-02..M-41 (idor:0001). Evaluation list caller-scoped for non-staff (`evaluations.service.ts:119-120`). |
| Attendance check-in (M-attendance POST) | L | L | L | L | L | L | One-time +5: UNIQUE(session,user) on attendance and UNIQUE(reason,ref) on ledger (`attendance.service.ts:30-31,45-47`; migration `:55,:99`); requires approved membership and started session (`:36-37`). Idempotency-Key interceptor for key endpoints (`common/idempotency.interceptor.ts:35-46`). |
| Internal REST `/o/internal/v1/*` (public sessions, stats, user points) | M | L | L | M | L | L | InternalGuard: constant-time compare, optional IP allowlist, 10 fails/min per IP (`internal/internal.guard.ts:23-38`). Reachable on the public domain under cPanel (`:12`). S/I: one static shared secret gates user-points and stats reads (`internal.controller.ts:48-57`); the dev secret documented in repo satisfies `min(32)` and is not rejected in prod (`env.ts:32`, auth:0002, Low). Failure counter keyed on IP also locks out valid-token callers behind a shared IP (`internal.guard.ts:30-31`, auth:0004). Recommend: set `INTERNAL_ALLOWED_IPS` in prod, reject known dev secret, rotate secret per service pair. |
| Internal events `POST /o/internal/v1/events` (inbox) | M | M | M | L | L | M | Any holder of the single secret may post any event type including `system.settings.changed`, which writes settings used for scoring weights/thresholds/maintenance (`internal.controller.ts:59-63`, `internal/events.service.ts:19,48-49`; auth:0001, TS-1). Payloads are zod-parsed and dedupe uses `INSERT IGNORE` on eventId in-transaction (`events.service.ts:35-36,39,49`), so replay is safe, but sender identity and event type are not bound (no per-sender secret, no HMAC, no allowed-type list per caller). Maintenance toggle makes this also a D vector (`endpoint.guard.ts:41`). Recommend: separate per-sender secrets (low vs high) with a type allowlist, or signed events with sender claim; log sender+type. |
| Socket.IO `/o/v1/socket.io` handshake and `session.join` | L | L | L | L | M | L | Token verified at handshake with the same JwtVerifier (`live/live.service.ts:46-59`); socket disconnected at access expiry (`:54`); join only for approved members (`:75-79`) with 30 joins/min and zod message validation (`:73-74`); `maxHttpBufferSize` 4096 (`:39`); CORS allowlist (`:42`). D: no cap on concurrent sockets per user or per IP and no per-connection event rate beyond joins; single-instance fan-out only (`:17-18`). I: `queue.turned` broadcast includes the current student's userId to all room members (`queue.service.ts:346`, auth:0005, Low). Recommend: per-user connection cap. |
| Outbox publisher (mid -> low `/internal/v1/events`) | L | L | L | L | L | - | Sends `X-Internal-Token` with 2 s timeout (`outbox/outbox.service.ts:83-88`); `FOR UPDATE SKIP LOCKED`, batch 50, backoff capped at 1 h (`:8-9,50-68`). Token leaves over INTERNAL_URL_LOW whose scheme is not enforced as https in prod (`env.ts:47`, mitm:0001): MITM on plain http would expose the shared secret (Low if the hop stays on loopback/private net). MySQL connection has no TLS option (`db/data-source.ts:14`, mitm:0003, Low). |
| Schedulers (snapshot refresh, maintenance cleanup) | - | L | - | - | L | - | `refreshSnapshots` uses fixed LIMIT 500 with no ORDER BY, so sessions with permanently NULL next start can starve others (`domain/sessions.service.ts:193`, idor:0002 / CS-MID-1, Low; correctness/availability only). Both timers env-toggleable (`env.ts:38-39`). |
| Health `/o/health/live|ready` | - | - | - | L | L | - | Unauthenticated by design (`infra/infra.controller.ts`); not rate-limited as internalOnly paths skip the global IP cap (`endpoint.guard.ts:37`) when flagged so; residual Low, no data exposed beyond readiness state (not verified field by field). |
| Config/boot (env, CORS, Swagger) | - | L | - | L | - | - | Fail-fast env validation; prod forbids wildcard/non-https CORS and Swagger (`env.ts:49-51`); Swagger mounted only outside production (`bootstrap.ts:49`). |
| MySQL access (raw parameterized SQL) | - | L | - | L | L | L | Queries read use `?` placeholders (e.g. `attendance.service.ts:45,59`, `events.service.ts:35,40`); injection phase for api-mid produced no findings. Lists are bounded (`LIMIT 1000`, `attendance.service.ts:59`). No TLS option on the DB connection (mitm:0003). |

## Residual summary
- Medium: internal events/shared secret not scoped by sender or type (S/T/R/E); no durable audit trail for role/transition changes (R); Socket.IO has no per-user connection cap (D).
- Everything else Low or not applicable.
- Max residual: Medium (no High identified).


## Route Inventory

92 surfaces recorded in `phase-02-surface.json` (first 50):

- POST /c/v1/auth/otp/request — ``
- POST /c/v1/auth/otp/verify — ``
- POST /c/v1/auth/login/password — ``
- POST /c/v1/auth/refresh — ``
- POST /c/v1/auth/logout — ``
- POST /c/v1/auth/step-up/otp/request — ``
- POST /c/v1/auth/step-up/otp/verify — ``
- GET /c/v1/me — ``
- GET /c/v1/me/profile — ``
- PATCH /c/v1/me/profile — ``
- PUT /c/v1/me/password — ``
- GET /c/v1/me/sessions — ``
- DELETE /c/v1/me/sessions/{id} — ``
- POST /c/v1/me/sessions/revoke-others — ``
- GET /c/v1/me/inbox — ``
- GET /c/v1/me/inbox/unread-count — ``
- POST /c/v1/me/inbox/{id}/read — ``
- POST /c/v1/me/inbox/read-all — ``
- GET /c/v1/me/points — ``
- GET /c/v1/public/sessions — ``
- GET /c/v1/public/sessions/{id} — ``
- GET /c/.well-known/jwks.json — ``
- GET /c/health/live — ``
- GET /c/health/ready — ``
- GET /o/v1/me — ``
- GET /o/v1/me/sessions — ``
- GET /o/v1/sessions/{id}/me — ``
- POST /o/v1/sessions — ``
- PATCH /o/v1/sessions/{id} — ``
- POST /o/v1/sessions/{id}/transition — ``
- POST /o/v1/sessions/{id}/members — ``
- GET /o/v1/sessions/{id}/members — ``
- PATCH /o/v1/sessions/{id}/members/{memberId} — ``
- PUT /o/v1/sessions/{id}/members/{memberId}/roles — ``
- POST /o/v1/sessions/{id}/attendance — ``
- GET /o/v1/sessions/{id}/attendance — ``
- POST /o/v1/sessions/{id}/queue — ``
- DELETE /o/v1/sessions/{id}/queue/me — ``
- GET /o/v1/sessions/{id}/queue — ``
- POST /o/v1/sessions/{id}/queue/next — ``
- PATCH /o/v1/sessions/{id}/queue/{itemId} — ``
- POST /o/v1/sessions/{id}/evaluations — ``
- GET /o/v1/sessions/{id}/evaluations — ``
- GET /o/v1/me/points — ``
- GET /o/health/live — ``
- GET /o/health/ready — ``
- GET /s/v1/system/me — ``
- GET /s/v1/system/overview — ``
- GET /s/v1/system/roles — ``
- GET /s/v1/system/permissions — ``

## Unique-to-Skill Findings

The skill-unique signal here is the capability composition: the single-secret chain (TS-001 family) and the env-config entry links (`mid:auth:0002`, `mid:auth:0006`) were individually rated LOW/MEDIUM by analysts; only the composer connected them into a path.

## Audit Coverage

| Phase | Status | Notes |
|---|---|---|
| 0 discovery | completed | |
| 1 partition | completed | 12 partitions (8 full, 4 inventory-only) |
| 2 surface / sinks / credentials / collections | completed | |
| 3 keystone | completed | |
| 4 scanners | **degraded** | semgrep (local rules clone; registry packs blocked by proxy 403) + pnpm audit; osv-scanner/gitleaks/trufflehog/trivy not installable offline → git-history regex sweep (0 hits) |
| 5 deep-dives | completed | 30 (category × partition) pairs validated |
| 6 methodology | completed (deviation) | skill text says 17 ASVS chapters; ASVS 4.0.3 defines 14 (V1–V14) — 14 dispatched. Mechanical egress/collection rows were adjudicated manually and demoted to INFO/refuted with cited lines. |
| 7 synthesis | completed | id collision recorded: `TS-R1` appeared twice with differing payloads → merged (higher severity, unioned sources); id-generation bug to fix upstream |
| 8 baseline | see below | |

Routing assertion: |§A|+|§B|+|§C|+|Annex|+|Sound|+|annexed legs| = 51+0+0+0+56+0 = 107 = total rows (107). ✔

## Remediation Roadmap

No fix reconciliation required (no conflicting `suggested_fix` among findings on the same defect).

**Trivial**
- Reject the `.env.example` dev secrets/peppers in production (compare against a deny-list or require `NODE_ENV=production` hex ≥ 32 random); make `NODE_ENV` default to `production` or fail-closed when unset (`env.ts`).
- `safeNext` (web-main/web-admin `nav.ts`): reject any control chars/backslash and parse with `new URL(next, origin)` then compare `origin`.
- Replace substring `localhost` check on `LOW_JWKS_URL`/`INTERNAL_URL_*` with proper `new URL()` protocol+hostname validation; require https in production (also `FARAZ_BASE_URL`).
- Remove `COOKIE_DOMAIN` or document; add `__Host-` cookie prefix.

**Small**
- Pin GitHub Actions to commit SHAs; add `dependabot.yml`, `CODEOWNERS`, `SECURITY.md`.
- Ship a lockfile (or vendor `node_modules`) in `pack-service.mjs` output and use `npm ci --ignore-scripts` on the host.
- Set `INTERNAL_ALLOWED_IPS` on cPanel and/or add an `.htaccess` deny for `/*/internal/*` from non-server IPs.
- Log 401/403 and OTP failure events (V7.1.3/V7.2.1) without PII.

**Medium**
- Scope internal auth: per-service secrets (or HMAC with caller id + event-type claim, or short-lived service JWT) so one leaked secret cannot forge `system.role.changed`.
- Propagate session revocation to api-mid/high (introspection cache or a revocation-version claim) or shorten access TTL (currently 20 min per owner).
- Step-up token: single-use (`jti`) and operation-bound.
- Idle-timeout for refresh sessions (`last_active_at` is tracked, unused).

**Large**
- PII retention/erasure path (V8.1.6), CI SAST + secret scanning + SBOM, signed releases.

## Honest scope

This audit combines LLM deep-dives over 8 partitions, heuristic reconcilers and ASVS/STRIDE/LINDDUN fan-out. It is **not** a penetration test and not a proof of absence: no running system was attacked, dynamic behaviour behind LiteSpeed/cPanel (headers, TLS, `.htaccess`) and the production env values were not observed, and four recommended scanners were unavailable. "Refuted" rows rest on cited code reads, not exploitation.
