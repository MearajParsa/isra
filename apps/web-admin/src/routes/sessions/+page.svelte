<script lang="ts">
  import { untrack } from 'svelte';
  import { withBase } from '$lib/utils/paths';
  import { api, type AdminSession, type AdminSessionsQuery, type Page } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { SESSION_STATE } from '$lib/utils/labels';
  import { formatNumber, formatDateTime, scheduleLabel } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import { UrlState } from '$lib/utils/urlState.svelte';
  import { isPageString, pageNumber, type QuerySpec } from '$lib/utils/urlQuery';
  import { isValidIsoDate } from '$lib/utils/dates';
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
  import UserPicker from '$lib/components/features/UserPicker.svelte';

  const PAGE_SIZE = 20;
  const spec = {
    q: { def: '' },
    status: { def: '', allowed: ['', 'draft', 'scheduled', 'started', 'ended'] },
    creator: { def: '', valid: (v: string) => /^[A-Za-z0-9_-]{1,64}$/.test(v) },
    from: { def: '', valid: isValidIsoDate },
    to: { def: '', valid: isValidIsoDate },
    deleted: { def: '', allowed: ['', '1'] },
    sort: { def: 'newest', allowed: ['newest', 'oldest', 'title', 'nextStart'] },
    page: { def: '1', valid: isPageString, resetsPage: false }
  } satisfies QuerySpec;
  const url = new UrlState(spec);
  const list = new Resource<Page<AdminSession>>();
  const canManage = $derived(system.can('system.sessions.manage'));
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

  const rangeBad = $derived(!!url.values.from && !!url.values.to && url.values.to < url.values.from);

  const load = () => {
    if (rangeBad) {
      list.abort();
      return Promise.resolve();
    }
    const v = url.values;
    const q: AdminSessionsQuery = {
      q: v.q || undefined,
      status: (v.status || undefined) as AdminSessionsQuery['status'],
      creatorId: v.creator || undefined,
      from: v.from || undefined,
      to: v.to || undefined,
      includeDeleted: v.deleted === '1',
      sort: v.sort as AdminSessionsQuery['sort'],
      page: pageNumber(v.page),
      pageSize: PAGE_SIZE
    };
    return list.loadLatest((signal) => auth.withAuth((t) => api.system.sessions(t, q, { signal })));
  };
  $effect(() => {
    void Object.values(url.values).join('|');
    void load();
  });

  const tone = { draft: 'neutral', scheduled: 'info', started: 'success', ended: 'warning' } as const;
  const filterCount = $derived(url.activeCount());
</script>

<svelte:head><title>جلسه‌ها — مدیریت اسراء</title></svelte:head>

<PageHeader title="جلسه‌ها" subtitle="همهٔ جلسه‌ها (شامل پیش‌نویس و حذف‌شده) با فیلتر و مدیریت.">
  {#snippet actions()}
    {#if canManage}<Button size="sm" href={withBase('/sessions/new')}><Icon name="plus" size={18} />جلسهٔ جدید</Button>{/if}
  {/snippet}
</PageHeader>

<form class="filters" role="search" aria-label="فیلتر جلسه‌ها" onsubmit={(e) => e.preventDefault()}>
  <div class="wide"><TextField label="جست‌وجو" type="search" bind:value={qInput} placeholder="عنوان یا آدرس" maxlength={60} /></div>
  <SelectField
    label="وضعیت"
    value={url.values.status}
    onchange={(v) => url.set({ status: v })}
    options={[{ value: '', label: 'همه' }, ...(Object.entries(SESSION_STATE).map(([value, label]) => ({ value, label })))]}
  />
  <SelectField
    label="مرتب‌سازی"
    value={url.values.sort}
    onchange={(v) => url.set({ sort: v })}
    options={[{ value: 'newest', label: 'جدیدترین' }, { value: 'oldest', label: 'قدیمی‌ترین' }, { value: 'title', label: 'عنوان' }, { value: 'nextStart', label: 'نزدیک‌ترین برگزاری' }]}
  />
  {#if canPickUser}
    <div class="wide"><UserPicker label="سازنده" valueId={url.values.creator} onchange={(id) => url.set({ creator: id })} /></div>
  {/if}
  <JalaliDateField label="برگزاری بعدی از" clearable value={url.values.from} onchange={(v) => url.set({ from: v })} />
  <JalaliDateField label="برگزاری بعدی تا" clearable value={url.values.to} onchange={(v) => url.set({ to: v })} />
  <label class="chk">
    <input type="checkbox" checked={url.values.deleted === '1'} onchange={(e) => url.set({ deleted: e.currentTarget.checked ? '1' : '' })} />
    <span>نمایش جلسه‌های حذف‌شده</span>
  </label>
  {#if filterCount > 0}
    <div class="wide"><button type="button" class="chipbtn" onclick={() => { qInput = ''; url.reset(['sort']); }}>پاک‌کردن فیلترها ({formatNumber(filterCount)})</button></div>
  {/if}
</form>

{#if rangeBad}<NoticeBanner tone="warning" role="alert">تاریخ پایان نباید قبل از تاریخ شروع باشد.</NoticeBanner>{/if}

{#if list.status === 'ready' && list.data && !rangeBad}
  {#if list.data.items.length === 0}
    <EmptyState icon="calendar" title="جلسه‌ای پیدا نشد" message="فیلترها را تغییر دهید.">
      {#snippet action()}{#if filterCount > 0}<Button variant="secondary" onclick={() => { qInput = ''; url.reset(['sort']); }}>پاک‌کردن فیلترها</Button>{/if}{/snippet}
    </EmptyState>
  {:else}
    <p class="muted count" aria-live="polite">{formatNumber(list.data.total)} جلسه{#if list.fetching} · در حال به‌روزرسانی…{/if}</p>
    <ul class="rows" class:stale={list.fetching} aria-busy={list.fetching}>
      {#each list.data.items as s (s.id)}
        <li>
          <a class="row" class:gone={!!s.deletedAt} href={withBase(`/sessions/${s.id}`)}>
            <span class="main">
              <strong>{s.title}</strong>
              <span class="muted small">{scheduleLabel(s.schedule)}</span>
              <span class="muted small">سازنده: {s.createdBy.name || 'کاربر حذف‌شده'} · {s.location.label}</span>
            </span>
            <span class="tags">
              <StatusChip tone={tone[s.status]}>{SESSION_STATE[s.status]}</StatusChip>
              {#if s.deletedAt}<StatusChip tone="danger">حذف‌شده</StatusChip>{/if}
              {#if s.counts.pending > 0}<StatusChip tone="warning">{formatNumber(s.counts.pending)} درخواست عضویت</StatusChip>{/if}
            </span>
            <span class="muted small cnt">
              {formatNumber(s.counts.members)} عضو · {formatNumber(s.counts.attendance)} حضور · {formatNumber(s.counts.evaluations)} ارزیابی
              {#if s.nextStartsAt}<br />بعدی: {formatDateTime(s.nextStartsAt)}{/if}
            </span>
            <Icon name="chevron-left" size={20} class="chev" />
          </a>
        </li>
      {/each}
    </ul>
    <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onpage={(p) => url.set({ page: String(p) })} />
  {/if}
{:else if list.status === 'error' && !rangeBad}
  <EmptyState icon={list.offline ? 'wifi-off' : 'alert'} tone="error" title="فهرست جلسه‌ها بارگذاری نشد" message={list.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={() => load()}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else if !rangeBad}
  <div class="rows" aria-hidden="true">{#each [0, 1, 2, 3, 4] as i (i)}<Skeleton h="92px" radius="var(--radius-md)" />{/each}</div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{/if}

<style>
  .chk {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-height: var(--control-h);
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .chk input {
    width: 22px;
    height: 22px;
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
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-xs) var(--space-md);
    align-items: center;
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    color: inherit;
    text-decoration: none;
  }
  .row:hover {
    background: var(--color-primary-tint);
  }
  .row.gone {
    background: var(--color-neutral);
  }
  .main {
    display: grid;
    min-width: 0;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    grid-column: 1;
  }
  .cnt {
    grid-column: 1;
  }
  .small {
    font-size: var(--fs-xs);
  }
  :global(.row .chev) {
    grid-column: 2;
    grid-row: 1;
    color: var(--color-gray);
  }
  @media (min-width: 900px) {
    .row {
      grid-template-columns: 1.6fr 1fr 1.2fr auto;
    }
    .tags,
    .cnt {
      grid-column: auto;
    }
    :global(.row .chev) {
      grid-column: auto;
      grid-row: auto;
    }
  }
</style>
