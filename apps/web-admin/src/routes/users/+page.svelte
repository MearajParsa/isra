<script lang="ts">
  import { untrack } from 'svelte';
  import { withBase } from '$lib/utils/paths';
  import { api, type Page, type SystemUser, type UsersQuery } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { ROLE_TITLE } from '$lib/utils/audit';
  import { USER_STATUS, isDeletedPhone } from '$lib/utils/labels';
  import { formatDate, formatNumber } from '$lib/utils/format';
  import { formatPhone } from '$lib/utils/phone';
  import { Resource } from '$lib/utils/resource.svelte';
  import { UrlState } from '$lib/utils/urlState.svelte';
  import { isPageString, pageNumber, type QuerySpec } from '$lib/utils/urlQuery';
  import { isValidIsoDate, todayTehran } from '$lib/utils/dates';
  import { buildCsv, downloadCsv } from '$lib/utils/csv';
  import { collectPages } from '$lib/utils/export';
  import { errorMessage } from '$lib/utils/errors';
  import { jalaliString } from '$lib/utils/buckets';
  import { toasts } from '$lib/stores/toast.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import SelectField from '$lib/components/ui/SelectField.svelte';
  import JalaliDateField from '$lib/components/ui/JalaliDateField.svelte';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import Pager from '$lib/components/ui/Pager.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import UserFormDialog from '$lib/components/features/UserFormDialog.svelte';

  const PAGE_SIZE = 20;
  const EXPORT_CAP = 5000;

  const spec = {
    q: { def: '' },
    role: { def: '', allowed: ['', 'developer', 'super_admin', 'none'] },
    grant: { def: '', allowed: ['', 'session.create', 'none'] },
    status: { def: '', allowed: ['', 'active', 'disabled', 'deleted'] },
    from: { def: '', valid: isValidIsoDate },
    to: { def: '', valid: isValidIsoDate },
    sort: { def: 'newest', allowed: ['newest', 'oldest', 'name'] },
    page: { def: '1', valid: isPageString, resetsPage: false }
  } satisfies QuerySpec;
  const url = new UrlState(spec);

  const list = new Resource<Page<SystemUser>>();
  const canManage = $derived(system.can('system.users.manage'));

  // جست‌وجوی debounce‌شده
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

  const rangeBad = $derived(!!url.values.from && !!url.values.to && url.values.to < url.values.from);

  function query(page: number, pageSize: number): UsersQuery {
    const v = url.values;
    return {
      q: v.q || undefined,
      role: (v.role || undefined) as UsersQuery['role'],
      grant: (v.grant || undefined) as UsersQuery['grant'],
      status: (v.status || undefined) as UsersQuery['status'],
      createdFrom: v.from || undefined,
      createdTo: v.to || undefined,
      sort: v.sort as UsersQuery['sort'],
      page,
      pageSize
    };
  }

  const load = () => {
    if (rangeBad) {
      list.abort();
      return Promise.resolve();
    }
    const q = query(pageNumber(url.values.page), PAGE_SIZE);
    return list.loadLatest((signal) => auth.withAuth((t) => api.system.users(t, q, { signal })));
  };
  $effect(() => {
    void [url.values.q, url.values.role, url.values.grant, url.values.status, url.values.from, url.values.to, url.values.sort, url.values.page];
    void load();
  });

  const statusTone = { active: 'success', disabled: 'warning', deleted: 'danger' } as const;
  const statusChips = [
    { v: '', l: 'همه' },
    { v: 'active', l: 'فعال' },
    { v: 'disabled', l: 'غیرفعال' },
    { v: 'deleted', l: 'حذف‌شده' }
  ];
  const filterCount = $derived(url.activeCount());

  // ───────── CSV ─────────
  let exporting = $state(false);
  let progress = $state<{ loaded: number; total: number } | null>(null);
  let waitSec = $state(0);
  let exportCtl: AbortController | null = null;

  async function exportCsv() {
    if (exporting) return;
    exporting = true;
    progress = { loaded: 0, total: 0 };
    waitSec = 0;
    const ctl = (exportCtl = new AbortController());
    try {
      const r = await collectPages<SystemUser>(
        (p) => auth.withAuth((t) => api.system.users(t, query(p, 50), { signal: ctl.signal })),
        { cap: EXPORT_CAP, pageSize: 50, signal: ctl.signal, onProgress: (loaded, total) => ((progress = { loaded, total }), (waitSec = 0)), onWait: (s) => (waitSec = s) }
      );
      const rows = r.items.map((u) => [
        u.id,
        u.name,
        isDeletedPhone(u.phone) ? '' : u.phone,
        USER_STATUS[u.status],
        u.roles.map((x) => ROLE_TITLE[x]).join('، '),
        u.grants.includes('session.create') ? 'ساخت جلسه' : '',
        jalaliString(u.createdAt.slice(0, 10)),
        u.createdAt
      ]);
      downloadCsv(`users-${todayTehran()}`, buildCsv(['شناسه', 'نام', 'شمارهٔ موبایل', 'وضعیت', 'نقش‌ها', 'مجوز مستقیم', 'تاریخ عضویت (شمسی)', 'زمان عضویت (ISO)'], rows));
      if (r.truncated) toasts.info(`فقط ${formatNumber(EXPORT_CAP)} ردیف اول از ${formatNumber(r.total)} کاربر دریافت شد؛ فیلتر را محدودتر کنید.`);
      else toasts.success(`${formatNumber(r.items.length)} ردیف در فایل CSV ذخیره شد.`);
    } catch (e) {
      if (!ctl.signal.aborted) toasts.error(`دریافت CSV ناموفق بود: ${errorMessage(e)}`);
      else toasts.info('دریافت CSV لغو شد.');
    } finally {
      exporting = false;
      progress = null;
      exportCtl = null;
    }
  }

  let createOpen = $state(false);
</script>

<svelte:head><title>کاربران — مدیریت اسراء</title></svelte:head>

<PageHeader title="کاربران" subtitle="جست‌وجو، فیلتر و مدیریت کاربران، نقش‌ها و دسترسی‌ها.">
  {#snippet actions()}
    <div class="hact">
      <Button variant="secondary" size="sm" loading={exporting} disabled={!list.data || list.data.total === 0 || rangeBad} onclick={exportCsv}><Icon name="download" size={18} />دریافت CSV</Button>
      {#if canManage}<Button size="sm" onclick={() => (createOpen = true)}><Icon name="plus" size={18} />کاربر جدید</Button>{/if}
    </div>
  {/snippet}
</PageHeader>

<form class="filters" role="search" aria-label="فیلتر کاربران" onsubmit={(e) => e.preventDefault()}>
  <div class="wide">
    <TextField label="جست‌وجو" type="search" bind:value={qInput} placeholder="نام یا شمارهٔ موبایل" maxlength={60} />
  </div>
  <SelectField
    label="نقش سیستم"
    value={url.values.role}
    onchange={(v) => url.set({ role: v })}
    options={[{ value: '', label: 'همه' }, { value: 'developer', label: 'توسعه‌دهنده' }, { value: 'super_admin', label: 'مدیر کل' }, { value: 'none', label: 'بدون نقش' }]}
  />
  <SelectField
    label="مجوز مستقیم"
    value={url.values.grant}
    onchange={(v) => url.set({ grant: v })}
    options={[{ value: '', label: 'همه' }, { value: 'session.create', label: 'ساخت جلسه' }, { value: 'none', label: 'بدون مجوز مستقیم' }]}
  />
  <SelectField
    label="مرتب‌سازی"
    value={url.values.sort}
    onchange={(v) => url.set({ sort: v })}
    options={[{ value: 'newest', label: 'جدیدترین' }, { value: 'oldest', label: 'قدیمی‌ترین' }, { value: 'name', label: 'نام (الفبایی)' }]}
  />
  <JalaliDateField label="عضویت از تاریخ" clearable value={url.values.from} onchange={(v) => url.set({ from: v })} />
  <JalaliDateField label="عضویت تا تاریخ" clearable value={url.values.to} onchange={(v) => url.set({ to: v })} />
  <div class="wide pill-row" role="group" aria-label="فیلتر وضعیت">
    {#each statusChips as c (c.v)}
      <button type="button" class="chipbtn" class:active={url.values.status === c.v} aria-pressed={url.values.status === c.v} onclick={() => url.set({ status: c.v })}>{c.l}</button>
    {/each}
    {#if filterCount > 0}
      <button type="button" class="chipbtn clr" onclick={() => { qInput = ''; url.reset(['sort']); }}><Icon name="x" size={16} />پاک‌کردن فیلترها ({formatNumber(filterCount)})</button>
    {/if}
  </div>
</form>

{#if rangeBad}
  <NoticeBanner tone="warning" role="alert">تاریخ پایان نباید قبل از تاریخ شروع باشد.</NoticeBanner>
{/if}

{#if exporting && progress}
  <div class="exp" role="status" aria-live="polite">
    <span>{waitSec > 0 ? `محدودیت نرخ درخواست؛ ${formatNumber(waitSec)} ثانیه صبر…` : `در حال آماده‌سازی CSV: ${formatNumber(progress.loaded)} از ${formatNumber(progress.total)}`}</span>
    <progress max={progress.total || 1} value={progress.loaded}></progress>
    <Button variant="text" size="sm" onclick={() => exportCtl?.abort()}>لغو</Button>
  </div>
{/if}

{#if list.status === 'ready' && list.data && !rangeBad}
  {#if list.data.items.length === 0}
    <EmptyState icon="search" title="کاربری پیدا نشد" message="عبارت جست‌وجو یا فیلترها را تغییر دهید.">
      {#snippet action()}
        {#if filterCount > 0}<Button variant="secondary" onclick={() => { qInput = ''; url.reset(['sort']); }}>پاک‌کردن فیلترها</Button>{/if}
      {/snippet}
    </EmptyState>
  {:else}
    <p class="muted count" aria-live="polite">{formatNumber(list.data.total)} کاربر{#if list.fetching} · در حال به‌روزرسانی…{/if}</p>
    <ul class="rows" class:stale={list.fetching} aria-busy={list.fetching}>
      {#each list.data.items as u (u.id)}
        <li>
          <a class="row" href={withBase(`/users/${u.id}`)}>
            <span class="av" aria-hidden="true">{(u.name || '؟').charAt(0)}</span>
            <span class="who">
              <strong>{u.name || 'کاربر حذف‌شده'}</strong>
              <span class="muted num" dir="ltr">{isDeletedPhone(u.phone) ? '—' : formatPhone(u.phone)}</span>
            </span>
            <span class="tags">
              <StatusChip tone={statusTone[u.status]}>{USER_STATUS[u.status]}</StatusChip>
              {#each u.roles as r (r)}<span class="tag role">{ROLE_TITLE[r]}</span>{/each}
              {#if u.grants.includes('session.create')}<span class="tag grant">ساخت جلسه</span>{/if}
            </span>
            <span class="muted small date">عضویت: {formatDate(u.createdAt)}</span>
            <Icon name="chevron-left" size={20} class="chev" />
          </a>
        </li>
      {/each}
    </ul>
    <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onpage={(p) => url.set({ page: String(p) })} />
  {/if}
{:else if list.status === 'error' && !rangeBad}
  <EmptyState icon={list.offline ? 'wifi-off' : 'alert'} tone="error" title="فهرست کاربران بارگذاری نشد" message={list.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={() => load()}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else if !rangeBad}
  <div class="rows" aria-hidden="true">
    {#each [0, 1, 2, 3, 4] as i (i)}<Skeleton h="76px" radius="var(--radius-md)" />{/each}
  </div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{/if}

<UserFormDialog bind:open={createOpen} onsaved={() => void load()} />

<style>
  .hact {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    justify-content: flex-end;
  }
  .clr {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-style: dashed;
  }
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
    transition: opacity var(--dur) var(--ease);
  }
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-xs) var(--space-md);
    align-items: center;
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    color: inherit;
    text-decoration: none;
    transition: background-color var(--dur) var(--ease);
  }
  .row:hover {
    background: var(--color-primary-tint);
  }
  .av {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--color-secondary);
    color: var(--color-primary);
    font-weight: 700;
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .num {
    font-size: var(--fs-sm);
    text-align: right;
  }
  .tags {
    grid-column: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .date {
    grid-column: 2;
  }
  :global(.chev) {
    grid-column: 3;
    grid-row: 1;
    color: var(--color-gray);
  }
  .small {
    font-size: var(--fs-xs);
  }
  .tag {
    padding: 1px 10px;
    border-radius: var(--radius-pill);
    font-size: var(--fs-xs);
    font-weight: 700;
  }
  .tag.role {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
  .tag.grant {
    background: var(--color-accent-tint);
    color: var(--color-accent);
  }
  @media (min-width: 800px) {
    .row {
      grid-template-columns: auto 1.2fr 1.6fr 11rem auto;
    }
    .tags,
    .date {
      grid-column: auto;
    }
    :global(.chev) {
      grid-column: auto;
      grid-row: auto;
    }
  }
</style>
