<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import type { SessionStatus } from '$lib/api/types';
  import { formatNumber, statusLabel } from '$lib/utils/format';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import SessionCard from '$lib/components/features/SessionCard.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';

  let { data } = $props();

  const filters: { value: SessionStatus | null; label: string }[] = [
    { value: null, label: 'همه' },
    { value: 'started', label: statusLabel.started },
    { value: 'scheduled', label: statusLabel.scheduled },
    { value: 'ended', label: statusLabel.ended }
  ];

  const pageNo = $derived(data.result?.page ?? 1);
  const totalPages = $derived(
    data.result ? Math.max(1, Math.ceil(data.result.total / data.result.pageSize)) : 1
  );

  function href(status: SessionStatus | null, page = 1) {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (page > 1) q.set('page', String(page));
    const s = q.toString();
    return s ? `/sessions?${s}` : '/sessions';
  }
</script>

<svelte:head>
  <title>جلسات قرآن — اسراء</title>
  <meta name="description" content="فهرست جلسات قرآن اسراء: جلسات پیش‌رو، در حال برگزاری و پایان‌یافته." />
</svelte:head>

<div class="container wrap">
  <PageHeader title="جلسات قرآن" subtitle="جلسات را مرور کنید و جلسهٔ مناسب خود را پیدا کنید." />

  <nav class="chips" aria-label="فیلتر وضعیت جلسه">
    {#each filters as f (f.label)}
      {@const active = data.status === f.value}
      <a class="chip" class:active href={href(f.value)} aria-current={active ? 'true' : undefined} data-sveltekit-noscroll>
        {f.label}
      </a>
    {/each}
  </nav>

  {#if data.error}
    <EmptyState icon="alert" tone="error" title="بارگذاری جلسات ممکن نشد" message={data.error}>
      {#snippet action()}
        <Button variant="secondary" onclick={() => invalidateAll()}><Icon name="refresh" size={18} />تلاش دوباره</Button>
      {/snippet}
    </EmptyState>
  {:else if data.result && data.result.items.length === 0}
    <EmptyState
      icon="calendar"
      title={data.status ? 'جلسه‌ای با این وضعیت پیدا نشد' : 'هنوز جلسه‌ای ثبت نشده'}
      message={data.status ? 'فیلتر دیگری را امتحان کنید.' : 'به‌محض اعلام جلسهٔ جدید اینجا می‌بینید.'}
    >
      {#snippet action()}
        {#if data.status}<Button variant="secondary" href="/sessions">نمایش همهٔ جلسات</Button>{/if}
      {/snippet}
    </EmptyState>
  {:else if data.result}
    <div class="grid">
      {#each data.result.items as s (s.id)}
        <SessionCard session={s} />
      {/each}
    </div>

    {#if totalPages > 1}
      <nav class="pager" aria-label="صفحه‌بندی جلسات">
        <Button variant="secondary" size="sm" disabled={pageNo <= 1} onclick={() => goto(href(data.status, pageNo - 1))}>
          <Icon name="chevron-right" size={18} />قبلی
        </Button>
        <span class="muted">صفحهٔ {formatNumber(pageNo)} از {formatNumber(totalPages)}</span>
        <Button variant="secondary" size="sm" disabled={pageNo >= totalPages} onclick={() => goto(href(data.status, pageNo + 1))}>
          بعدی<Icon name="chevron-left" size={18} />
        </Button>
      </nav>
    {/if}
  {/if}
</div>

<Footer />

<style>
  .wrap {
    padding-top: var(--space-xl);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }
  .chip {
    padding: 6px 16px;
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-pill);
    background: var(--color-card);
    color: var(--color-primary);
    font-size: var(--fs-sm);
    font-weight: 700;
    text-decoration: none;
    transition: background-color var(--dur) var(--ease);
  }
  .chip:hover {
    background: var(--color-primary-tint);
  }
  .chip.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-on-primary);
  }
  .grid {
    display: grid;
    gap: var(--space-md);
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 960px) {
    .grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    margin-top: var(--space-xl);
  }
</style>
