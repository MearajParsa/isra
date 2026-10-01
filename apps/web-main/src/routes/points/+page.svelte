<script lang="ts">
  import { api } from '$lib/api';
  import type { PointsSummary } from '$lib/api/types';
  import { auth } from '$lib/auth/auth.svelte';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import PointsSummaryCard from '$lib/components/features/PointsSummaryCard.svelte';
  import BadgeTile from '$lib/components/features/BadgeTile.svelte';
  import GatePanel from '$lib/components/features/GatePanel.svelte';

  const points = new Resource<PointsSummary>();
  const load = () => points.load(() => auth.withAuth((t) => api.me.points(t)));

  $effect(() => {
    if (auth.status === 'member') void load();
  });
</script>

<svelte:head>
  <title>امتیاز و نشان‌ها — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="container wrap">
  {#if auth.status === 'guest'}
    <GatePanel title="امتیازها مخصوص اعضاست" message="با ورود به حساب، امتیاز و نشان‌های خود را اینجا ببینید." />
  {:else}
    <PageHeader title="امتیاز و نشان‌ها" subtitle="با حضور در جلسات امتیاز جمع کنید و نشان بگیرید." />

    {#if points.status === 'ready' && points.data}
      <PointsSummaryCard points={points.data} />

      {#if points.data.total === 0}
        <div class="gap"></div>
        <NoticeBanner tone="info">هنوز امتیازی ندارید. با حضور در یک جلسه، ۵ امتیاز می‌گیرید.</NoticeBanner>
      {/if}

      <h2 class="h">نشان‌ها</h2>
      <ul class="badges">
        {#each points.data.badges as b (b.key)}
          <li><BadgeTile badge={b} /></li>
        {/each}
      </ul>
      <p class="muted rule">هر ورود به جلسه فقط یک‌بار ۵ امتیاز دارد. نشان‌های کسب‌شده با کم‌شدن امتیاز باطل نمی‌شوند.</p>
    {:else if points.status === 'error'}
      <EmptyState icon={points.offline ? 'wifi-off' : 'alert'} tone="error" title="امتیازها بارگذاری نشد" message={points.error ?? ''}>
        {#snippet action()}<Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
      </EmptyState>
    {:else}
      <div class="sk" aria-hidden="true">
        <Skeleton h="150px" radius="var(--radius-lg)" />
        <div class="badges">
          {#each [0, 1, 2, 3] as i (i)}<Skeleton h="160px" radius="var(--radius-lg)" />{/each}
        </div>
      </div>
      <span class="sr-only" role="status">در حال بارگذاری امتیازها…</span>
    {/if}
  {/if}
</div>

<style>
  .wrap {
    max-width: 44rem;
    padding-top: var(--space-xl);
    padding-bottom: var(--space-2xl);
  }
  .gap {
    height: var(--space-md);
  }
  .h {
    margin-block: var(--space-xl) var(--space-md);
  }
  .badges {
    display: grid;
    gap: var(--space-md);
    grid-template-columns: repeat(2, 1fr);
  }
  .sk {
    display: grid;
    gap: var(--space-xl);
  }
  .rule {
    margin-top: var(--space-lg);
    font-size: var(--fs-sm);
  }
  @media (min-width: 640px) {
    .badges {
      grid-template-columns: repeat(4, 1fr);
    }
  }
</style>
