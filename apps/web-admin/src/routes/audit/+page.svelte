<script lang="ts">
  import { api, type AuditEntry, type Page } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { AUDIT_ACTIONS, auditLabel } from '$lib/utils/audit';
  import { formatDateTime, formatNumber, formatRelative } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';

  const list = new Resource<Page<AuditEntry>>();
  let actionFilter = $state('');
  let q = $state('');
  let debounced = $state('');
  let pageNo = $state(1);
  let open = $state<string | null>(null);

  $effect(() => {
    const v = q;
    const t = setTimeout(() => {
      debounced = v.trim();
      pageNo = 1;
    }, 300);
    return () => clearTimeout(t);
  });

  const load = (silent = false) =>
    list.load(() => auth.withAuth((t) => api.system.audit(t, { action: actionFilter || undefined, q: debounced, page: pageNo, pageSize: 10 })), silent);
  $effect(() => {
    void actionFilter;
    void debounced;
    void pageNo;
    void load(true);
  });

  const totalPages = $derived(list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1);
</script>

<svelte:head><title>گزارش‌ها — مدیریت اسراء</title></svelte:head>

<PageHeader title="گزارش اقدام‌ها" subtitle="همهٔ اقدام‌های حساس مدیریتی؛ فقط‌خواندنی و غیرقابل حذف." />

{#if !system.can('system.audit.view')}
  <EmptyState icon="lock" title="دسترسی به گزارش‌ها ندارید" message="مجوز مشاهدهٔ گزارش‌ها برای نقش شما فعال نیست." />
{:else}
  <div class="tools">
    <TextField label="جست‌وجو" type="search" bind:value={q} placeholder="شرح یا نام مدیر" />
    <div class="sel">
      <label for="act">نوع اقدام</label>
      <select id="act" bind:value={actionFilter} onchange={() => (pageNo = 1)}>
        <option value="">همه</option>
        {#each Object.entries(AUDIT_ACTIONS) as [k, v] (k)}<option value={k}>{v}</option>{/each}
      </select>
    </div>
  </div>

  {#if list.status === 'ready' && list.data}
    {#if list.data.items.length === 0}
      <EmptyState icon="list" title="موردی پیدا نشد" message="فیلترها را تغییر دهید.">
        {#snippet action()}<Button variant="secondary" onclick={() => ((q = ''), (actionFilter = ''))}>پاک‌کردن فیلترها</Button>{/snippet}
      </EmptyState>
    {:else}
      <p class="muted count">{formatNumber(list.data.total)} مورد</p>
      <ul class="rows">
        {#each list.data.items as a (a.id)}
          <li class="entry">
            <button type="button" class="head" aria-expanded={open === a.id} onclick={() => (open = open === a.id ? null : a.id)}>
              <span class="tag">{auditLabel(a.action)}</span>
              <span class="sum">{a.summary}</span>
              <span class="muted meta">{a.actor.name} · {formatRelative(a.at)}</span>
              <Icon name="chevron-down" size={20} class={open === a.id ? 'rot' : ''} />
            </button>
            {#if open === a.id}
              <dl class="detail">
                <div><dt>زمان</dt><dd>{formatDateTime(a.at)}</dd></div>
                <div><dt>مدیر</dt><dd>{a.actor.name}</dd></div>
                {#if a.target}<div><dt>هدف</dt><dd>{a.target.label}</dd></div>{/if}
                <div><dt>کلید</dt><dd><code dir="ltr">{a.action}</code></dd></div>
                <div class="full"><dt>جزئیات فنی</dt><dd><pre dir="ltr">{JSON.stringify(a.meta, null, 2)}</pre></dd></div>
              </dl>
            {/if}
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
    <EmptyState icon={list.offline ? 'wifi-off' : 'alert'} tone="error" title="گزارش‌ها بارگذاری نشد" message={list.error ?? ''}>
      {#snippet action()}<Button variant="secondary" onclick={() => load()}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="rows" aria-hidden="true">
      {#each [0, 1, 2, 3, 4] as i (i)}<Skeleton h="64px" radius="var(--radius-md)" />{/each}
    </div>
  {/if}
{/if}

<style>
  .tools {
    display: grid;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }
  @media (min-width: 720px) {
    .tools {
      grid-template-columns: 1fr 16rem;
      align-items: end;
    }
  }
  .sel {
    display: grid;
    gap: 6px;
  }
  .sel label {
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  select {
    min-height: var(--control-h);
    padding: 0 var(--space-md);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  .count {
    margin-bottom: var(--space-sm);
    font-size: var(--fs-sm);
  }
  .rows {
    display: grid;
    gap: var(--space-sm);
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
  .sum {
    grid-column: 1;
  }
  .meta {
    grid-column: 1;
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
    padding: var(--space-md);
    border-top: 1px solid var(--color-outline);
    background: var(--color-neutral);
    font-size: var(--fs-sm);
  }
  .detail div {
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
  }
  pre {
    margin: 0;
    padding: var(--space-sm);
    background: var(--color-card);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    font-size: var(--fs-xs);
    text-align: left;
  }
  code {
    font-size: var(--fs-xs);
  }
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    margin-top: var(--space-xl);
  }
</style>
