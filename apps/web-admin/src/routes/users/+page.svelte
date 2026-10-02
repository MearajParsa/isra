<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, type Page, type SystemRoleKey, type SystemUser } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { ROLE_TITLE } from '$lib/utils/audit';
  import { formatDate, formatNumber } from '$lib/utils/format';
  import { formatPhone } from '$lib/utils/phone';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';

  const list = new Resource<Page<SystemUser>>();
  let q = $state('');
  let role = $state<SystemRoleKey | 'none' | ''>('');
  let pageNo = $state(1);
  let debounced = $state('');

  const roleFilters: { v: SystemRoleKey | 'none' | ''; l: string }[] = [
    { v: '', l: 'همه' },
    { v: 'developer', l: 'توسعه‌دهنده' },
    { v: 'super_admin', l: 'مدیر کل' },
    { v: 'none', l: 'بدون نقش' }
  ];

  $effect(() => {
    const v = q;
    const t = setTimeout(() => {
      debounced = v.trim();
      pageNo = 1;
    }, 300);
    return () => clearTimeout(t);
  });

  const load = (silent = false) =>
    list.load(
      () => auth.withAuth((t) => api.system.users(t, { q: debounced, role: role || undefined, page: pageNo, pageSize: 10 })),
      silent
    );
  $effect(() => {
    void debounced;
    void role;
    void pageNo;
    void load(true);
  });

  const totalPages = $derived(list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1);
</script>

<svelte:head><title>کاربران — مدیریت اسراء</title></svelte:head>

<PageHeader title="کاربران" subtitle="جست‌وجو و مدیریت نقش و مجوز کاربران." />

<div class="tools">
  <div class="search">
    <TextField label="جست‌وجو" type="search" bind:value={q} placeholder="نام یا شمارهٔ موبایل" />
  </div>
  <div class="chips" role="group" aria-label="فیلتر نقش">
    {#each roleFilters as f (f.v)}
      <button type="button" class="chip" class:active={role === f.v} aria-pressed={role === f.v} onclick={() => ((role = f.v), (pageNo = 1))}>{f.l}</button>
    {/each}
  </div>
</div>

{#if list.status === 'ready' && list.data}
  {#if list.data.items.length === 0}
    <EmptyState icon="search" title="کاربری پیدا نشد" message="عبارت جست‌وجو یا فیلتر را تغییر دهید.">
      {#snippet action()}<Button variant="secondary" onclick={() => ((q = ''), (role = ''))}>پاک‌کردن فیلترها</Button>{/snippet}
    </EmptyState>
  {:else}
    <p class="muted count">{formatNumber(list.data.total)} کاربر</p>
    <ul class="rows">
      {#each list.data.items as u (u.id)}
        <li>
          <a class="row" href={`/users/${u.id}`}>
            <span class="av" aria-hidden="true">{u.name.charAt(0)}</span>
            <span class="who">
              <strong>{u.name}</strong>
              <span class="muted num" dir="ltr">{formatPhone(u.phone)}</span>
            </span>
            <span class="tags">
              {#each u.roles as r (r)}<span class="tag role">{ROLE_TITLE[r]}</span>{/each}
              {#if u.grants.includes('session.create')}<span class="tag grant">ساخت جلسه</span>{/if}
              {#if u.roles.length === 0 && u.grants.length === 0}<span class="muted small">کاربر عادی</span>{/if}
            </span>
            <span class="muted small date">عضویت: {formatDate(u.createdAt)}</span>
            <Icon name="chevron-left" size={20} class="chev" />
          </a>
        </li>
      {/each}
    </ul>

    {#if totalPages > 1}
      <nav class="pager" aria-label="صفحه‌بندی">
        <Button variant="secondary" size="sm" disabled={pageNo <= 1} onclick={() => (pageNo -= 1)}><Icon name="chevron-right" size={18} />قبلی</Button>
        <span class="muted">صفحهٔ {formatNumber(pageNo)} از {formatNumber(totalPages)}</span>
        <Button variant="secondary" size="sm" disabled={pageNo >= totalPages} onclick={() => (pageNo += 1)}>بعدی<Icon name="chevron-left" size={18} /></Button>
      </nav>
    {/if}
  {/if}
{:else if list.status === 'error'}
  <EmptyState icon={list.offline ? 'wifi-off' : 'alert'} tone="error" title="فهرست کاربران بارگذاری نشد" message={list.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={() => load()}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="rows" aria-hidden="true">
    {#each [0, 1, 2, 3, 4] as i (i)}<Skeleton h="72px" radius="var(--radius-md)" />{/each}
  </div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{/if}

<style>
  .tools {
    display: grid;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }
  .chip {
    padding: 6px 16px;
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-pill);
    background: var(--color-card);
    color: var(--color-primary);
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .chip.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-on-primary);
  }
  .count {
    margin-bottom: var(--space-sm);
    font-size: var(--fs-sm);
  }
  .rows {
    display: grid;
    gap: var(--space-sm);
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
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    margin-top: var(--space-xl);
  }
  @media (min-width: 800px) {
    .row {
      grid-template-columns: auto 1.2fr 1.4fr 11rem auto;
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
