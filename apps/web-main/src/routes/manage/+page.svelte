<script lang="ts">
  import { midApi } from '$lib/api';
  import type { MySessionItem } from '$lib/api/mid-types';
  import { auth } from '$lib/auth/auth.svelte';
  import { caps } from '$lib/stores/caps.svelte';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import MySessionCard from '$lib/components/features/MySessionCard.svelte';

  const list = new Resource<MySessionItem[]>();
  const load = () => list.load(() => auth.withAuth((t) => midApi.me.sessions(t, 'staff')));
  $effect(() => {
    void load();
  });
</script>

<svelte:head>
  <title>مدیریت جلسه — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHeader title="مدیریت جلسه" subtitle="جلسه‌هایی که استاد یا پشتیبان آن هستید.">
  {#snippet actions()}
    {#if caps.canCreate}<Button href="/manage/new" size="sm"><Icon name="plus" size={18} />ساخت جلسه</Button>{/if}
  {/snippet}
</PageHeader>

{#if list.status === 'ready' && list.data}
  {#if list.data.length === 0}
    <EmptyState icon="calendar" title="هنوز جلسه‌ای برای مدیریت ندارید" message={caps.canCreate ? 'اولین جلسهٔ خود را بسازید.' : 'وقتی نقشی در جلسه‌ای بگیرید اینجا دیده می‌شود.'}>
      {#snippet action()}{#if caps.canCreate}<Button href="/manage/new">ساخت جلسه</Button>{/if}{/snippet}
    </EmptyState>
  {:else}
    <div class="grid">
      {#each list.data as item (item.session.id)}<MySessionCard {item} manage />{/each}
    </div>
  {/if}
{:else if list.status === 'error'}
  <EmptyState icon={list.offline ? 'wifi-off' : 'alert'} tone="error" title="فهرست بارگذاری نشد" message={list.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="grid" aria-hidden="true">
    {#each [0, 1, 2, 3] as i (i)}<Skeleton h="180px" radius="var(--radius-lg)" />{/each}
  </div>
{/if}

<style>
  .grid {
    display: grid;
    gap: var(--space-md);
  }
  @media (min-width: 720px) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
