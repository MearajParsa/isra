<script lang="ts">
  import { untrack } from 'svelte';
  import { api, type AuditEntry, type AuditQuery, type Page } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { AUDIT_ACTIONS, AUDIT_PREFIXES, AUDIT_TARGET_TYPES, auditLabel } from '$lib/utils/audit';
  import { formatDateTime, formatNumber, formatRelative } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import { UrlState } from '$lib/utils/urlState.svelte';
  import { isPageString, pageNumber, type QuerySpec } from '$lib/utils/urlQuery';
  import { isValidIsoDate, todayTehran } from '$lib/utils/dates';
  import { buildCsv, downloadCsv } from '$lib/utils/csv';
  import { collectPages } from '$lib/utils/export';
  import { errorMessage } from '$lib/utils/errors';
  import { jalaliString } from '$lib/utils/buckets';
  import { withBase } from '$lib/utils/paths';
  import { toasts } from '$lib/stores/toast.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import SelectField from '$lib/components/ui/SelectField.svelte';
  import JalaliDateField from '$lib/components/ui/JalaliDateField.svelte';
  import Pager from '$lib/components/ui/Pager.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import UserPicker from '$lib/components/features/UserPicker.svelte';

  const PAGE_SIZE = 20;
  const EXPORT_CAP = 5000;
  const ID = (v: string) => /^[A-Za-z0-9_-]{1,64}$/.test(v);
  const spec = {
    q: { def: '' },
    action: { def: '', valid: (v: string) => /^[a-z_.]{1,64}$/.test(v) },
    actor: { def: '', valid: ID },
    tt: { def: '', allowed: ['', 'user', 'role', 'settings', 'session'] },
    tid: { def: '', valid: ID },
    from: { def: '', valid: isValidIsoDate },
    to: { def: '', valid: isValidIsoDate },
    page: { def: '1', valid: isPageString, resetsPage: false }
  } satisfies QuerySpec;
  const url = new UrlState(spec);
  const list = new Resource<Page<AuditEntry>>();
  let open = $state<string | null>(null);
  const canPickUser = $derived(system.can('system.users.view'));

  let qInput = $state(untrack(() => url.values.q));
  $effect(() => {
    const v = qInput.trim();
    if (v === url.values.q) return;
    const t = setTimeout(() => url.set({ q: v }), 300);
    return () => clearTimeout(t);
  });
  $effect(() => {
    const q = url.values.q;
    untrack(() => {
      if (q !== qInput.trim()) qInput = q;
    });
  });
  let tidInput = $state(untrack(() => url.values.tid));
  $effect(() => {
    const v = tidInput.trim();
    if (v === url.values.tid || (v !== '' && !ID(v))) return;
    const t = setTimeout(() => url.set({ tid: v }), 300);
    return () => clearTimeout(t);
  });
  $effect(() => {
    const v = url.values.tid;
    untrack(() => {
      if (v !== tidInput.trim() && (tidInput.trim() === '' || ID(tidInput.trim()))) tidInput = v;
    });
  });
  const tidBad = $derived(tidInput.trim() !== '' && !ID(tidInput.trim()));

  const rangeBad = $derived(!!url.values.from && !!url.values.to && url.values.to < url.values.from);

  function query(page: number, pageSize: number): AuditQuery {
    const v = url.values;
    return { action: v.action || undefined, q: v.q || undefined, actorId: v.actor || undefined, targetType: (v.tt || undefined) as AuditQuery['targetType'], targetId: v.tid || undefined, from: v.from || undefined, to: v.to || undefined, page, pageSize };
  }
  const load = () => {
    if (rangeBad || !system.can('system.audit.view')) return Promise.resolve();
    const q = query(pageNumber(url.values.page), PAGE_SIZE);
    return list.loadLatest((signal) => auth.withAuth((t) => api.system.audit(t, q, { signal })));
  };
  $effect(() => {
    void Object.values(url.values).join('|');
    void load();
  });

  const actionOptions = [
    { value: '', label: 'همهٔ اقدام‌ها' },
    ...AUDIT_PREFIXES.map((p) => ({ value: p.value, label: p.label })),
    ...Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label }))
  ];
  // مقدارِ URL که در فهرست نیست (مثلاً پیشوند دلخواه) هم قابل‌نمایش باشد
  const actionOpts = $derived(actionOptions.some((o) => o.value === url.values.action) ? actionOptions : [...actionOptions, { value: url.values.action, label: url.values.action }]);
  const filterCount = $derived(url.activeCount());

  function targetHref(t: NonNullable<AuditEntry['target']>): string | null {
    if (t.type === 'user') return withBase(`/users/${t.id}`);
    if (t.type === 'session') return withBase(`/sessions/${t.id}`);
    if (t.type === 'role') return withBase('/roles');
    return withBase('/settings');
  }
  const metaText = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));

  // ───────── CSV ─────────
  let exporting = $state(false);
  let progress = $state<{ loaded: number; total: number } | null>(null);
  let waitSec = $state(0);
  let ctl: AbortController | null = null;
  async function exportCsv() {
    if (exporting) return;
    exporting = true;
    progress = { loaded: 0, total: 0 };
    const c = (ctl = new AbortController());
    try {
      const r = await collectPages<AuditEntry>((p) => auth.withAuth((t) => api.system.audit(t, query(p, 50), { signal: c.signal })), {
        cap: EXPORT_CAP,
        pageSize: 50,
        signal: c.signal,
        onProgress: (loaded, total) => ((progress = { loaded, total }), (waitSec = 0)),
        onWait: (s) => (waitSec = s)
      });
      const rows = r.items.map((a) => [a.at, jalaliString(a.at.slice(0, 10)), a.actor.name, a.actor.id, a.action, auditLabel(a.action), a.target?.type ?? '', a.target?.id ?? '', a.target?.label ?? '', a.summary, JSON.stringify(a.meta)]);
      downloadCsv(`audit-${todayTehran()}`, buildCsv(['زمان (ISO)', 'تاریخ شمسی', 'مدیر', 'شناسهٔ مدیر', 'کلید اقدام', 'اقدام', 'نوع هدف', 'شناسهٔ هدف', 'هدف', 'شرح', 'جزئیات (JSON)'], rows));
      if (r.truncated) toasts.info(`فقط ${formatNumber(EXPORT_CAP)} ردیف اول از ${formatNumber(r.total)} مورد دریافت شد؛ فیلتر را محدودتر کنید.`);
      else toasts.success(`${formatNumber(r.items.length)} ردیف در فایل CSV ذخیره شد.`);
    } catch (e) {
      if (!c.signal.aborted) toasts.error(`دریافت CSV ناموفق بود: ${errorMessage(e)}`);
      else toasts.info('دریافت CSV لغو شد.');
    } finally {
      exporting = false;
      progress = null;
      ctl = null;
    }
  }
</script>

<svelte:head><title>گزارش اقدام‌ها — مدیریت اسراء</title></svelte:head>

<PageHeader title="گزارش اقدام‌ها" subtitle="همهٔ اقدام‌های حساس مدیریتی؛ فقط‌خواندنی و غیرقابل حذف.">
  {#snippet actions()}
    <Button variant="secondary" size="sm" loading={exporting} disabled={!list.data || list.data.total === 0 || rangeBad} onclick={exportCsv}><Icon name="download" size={18} />دریافت CSV</Button>
  {/snippet}
</PageHeader>

{#if !system.can('system.audit.view')}
  <EmptyState icon="lock" title="دسترسی به گزارش‌ها ندارید" message="مجوز مشاهدهٔ گزارش‌ها برای نقش شما فعال نیست." />
{:else}
  <form class="filters" role="search" aria-label="فیلتر گزارش اقدام‌ها" onsubmit={(e) => e.preventDefault()}>
    <div class="wide"><TextField label="جست‌وجو" type="search" bind:value={qInput} placeholder="شرح یا نام مدیر" maxlength={60} /></div>
    <SelectField label="نوع اقدام" value={url.values.action} onchange={(v) => url.set({ action: v })} options={actionOpts} />
    {#if canPickUser}
      <UserPicker label="مدیر انجام‌دهنده" valueId={url.values.actor} onchange={(id) => url.set({ actor: id })} />
    {/if}
    <SelectField
      label="نوع هدف"
      value={url.values.tt}
      onchange={(v) => url.set({ tt: v })}
      options={[{ value: '', label: 'همه' }, ...Object.entries(AUDIT_TARGET_TYPES).map(([value, label]) => ({ value, label }))]}
    />
    <TextField label="شناسهٔ هدف" bind:value={tidInput} ltr placeholder="مثلاً شناسهٔ کاربر یا جلسه" maxlength={64} error={tidBad ? 'فقط حروف انگلیسی، رقم، - و _' : null} />
    <JalaliDateField label="از تاریخ" clearable value={url.values.from} onchange={(v) => url.set({ from: v })} />
    <JalaliDateField label="تا تاریخ" clearable value={url.values.to} onchange={(v) => url.set({ to: v })} />
    {#if filterCount > 0}
      <div class="wide"><button type="button" class="chipbtn" onclick={() => { qInput = ''; tidInput = ''; url.reset(); }}>پاک‌کردن فیلترها ({formatNumber(filterCount)})</button></div>
    {/if}
  </form>

  {#if rangeBad}<NoticeBanner tone="warning" role="alert">تاریخ پایان نباید قبل از تاریخ شروع باشد.</NoticeBanner>{/if}

  {#if exporting && progress}
    <div class="exp" role="status" aria-live="polite">
      <span>{waitSec > 0 ? `محدودیت نرخ درخواست؛ ${formatNumber(waitSec)} ثانیه صبر…` : `در حال آماده‌سازی CSV: ${formatNumber(progress.loaded)} از ${formatNumber(progress.total)}`}</span>
      <progress max={progress.total || 1} value={progress.loaded}></progress>
      <Button variant="text" size="sm" onclick={() => ctl?.abort()}>لغو</Button>
    </div>
  {/if}

  {#if list.status === 'ready' && list.data && !rangeBad}
    {#if list.data.items.length === 0}
      <EmptyState icon="list" title="موردی پیدا نشد" message="فیلترها را تغییر دهید.">
        {#snippet action()}{#if filterCount > 0}<Button variant="secondary" onclick={() => { qInput = ''; tidInput = ''; url.reset(); }}>پاک‌کردن فیلترها</Button>{/if}{/snippet}
      </EmptyState>
    {:else}
      <p class="muted count" aria-live="polite">{formatNumber(list.data.total)} مورد{#if list.fetching} · در حال به‌روزرسانی…{/if}</p>
      <ul class="rows" class:stale={list.fetching} aria-busy={list.fetching}>
        {#each list.data.items as a (a.id)}
          <li class="entry">
            <button type="button" class="head" aria-expanded={open === a.id} onclick={() => (open = open === a.id ? null : a.id)}>
              <span class="tag">{auditLabel(a.action)}</span>
              <span class="sum">{a.summary}</span>
              <span class="muted meta">{a.actor.name} · {formatRelative(a.at)}{#if a.target} · {AUDIT_TARGET_TYPES[a.target.type] ?? a.target.type}: {a.target.label}{/if}</span>
              <Icon name="chevron-down" size={20} class={open === a.id ? 'rot' : ''} />
            </button>
            {#if open === a.id}
              <dl class="detail">
                <div><dt>زمان</dt><dd>{formatDateTime(a.at)}</dd></div>
                <div><dt>مدیر</dt><dd>{a.actor.name}</dd></div>
                {#if a.target}
                  <div><dt>هدف</dt><dd>{#if targetHref(a.target)}<a href={targetHref(a.target)}>{a.target.label || a.target.id}</a>{:else}{a.target.label}{/if}</dd></div>
                {/if}
                <div><dt>کلید</dt><dd><code dir="ltr">{a.action}</code></dd></div>
                {#if Object.keys(a.meta).length}
                  <div class="full">
                    <dt>جزئیات</dt>
                    <dd>
                      <ul class="kv">
                        {#each Object.entries(a.meta) as [k, v] (k)}<li><code dir="ltr">{k}</code><span dir="auto">{metaText(v)}</span></li>{/each}
                      </ul>
                    </dd>
                  </div>
                {/if}
              </dl>
            {/if}
          </li>
        {/each}
      </ul>
      <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onpage={(p) => url.set({ page: String(p) })} />
    {/if}
  {:else if list.status === 'error' && !rangeBad}
    <EmptyState icon={list.offline ? 'wifi-off' : 'alert'} tone="error" title="گزارش‌ها بارگذاری نشد" message={list.error ?? ''}>
      {#snippet action()}<Button variant="secondary" onclick={() => load()}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
    </EmptyState>
  {:else if !rangeBad}
    <div class="rows" aria-hidden="true">{#each [0, 1, 2, 3, 4] as i (i)}<Skeleton h="72px" radius="var(--radius-md)" />{/each}</div>
    <span class="sr-only" role="status">در حال بارگذاری…</span>
  {/if}
{/if}

<style>
  .exp {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-primary-tint);
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
  }
  .exp progress {
    flex: 1;
    min-width: 8rem;
    accent-color: var(--color-accent);
  }
  .count {
    margin-bottom: var(--space-sm);
    font-size: var(--fs-sm);
  }
  .rows {
    display: grid;
    gap: var(--space-sm);
  }
  .rows.stale {
    opacity: 0.6;
  }
  .entry {
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px var(--space-md);
    align-items: center;
    width: 100%;
    padding: var(--space-md);
    border: 0;
    background: transparent;
    text-align: start;
  }
  .head:hover {
    background: var(--color-primary-tint);
  }
  .tag {
    justify-self: start;
    padding: 1px 10px;
    border-radius: var(--radius-pill);
    background: var(--color-primary-tint);
    color: var(--color-primary);
    font-size: var(--fs-xs);
    font-weight: 700;
    white-space: nowrap;
  }
  .sum,
  .meta {
    grid-column: 1;
  }
  .meta {
    font-size: var(--fs-xs);
  }
  .head :global(svg) {
    grid-column: 2;
    grid-row: 1 / span 3;
    color: var(--color-gray);
    transition: transform var(--dur) var(--ease);
  }
  .head :global(.rot) {
    transform: rotate(180deg);
  }
  .detail {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: var(--space-md);
    border-top: 1px solid var(--color-outline);
    background: var(--color-neutral);
    font-size: var(--fs-sm);
  }
  .detail > div {
    display: flex;
    gap: var(--space-md);
  }
  .detail .full {
    display: grid;
  }
  dt {
    min-width: 5.5rem;
    color: var(--color-muted);
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  .kv {
    display: grid;
    gap: 4px;
  }
  .kv li {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
  .kv code {
    padding: 0 6px;
    background: var(--color-card);
    border-radius: var(--radius-sm);
    font-size: var(--fs-xs);
  }
  .kv span {
    overflow-wrap: anywhere;
  }
</style>
