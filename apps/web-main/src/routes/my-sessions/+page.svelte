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
  import GatePanel from '$lib/components/features/GatePanel.svelte';

  const list = new Resource<MySessionItem[]>();
  let filter = $state<'all' | 'staff' | 'student'>('all');

  const load = () => list.load(() => auth.withAuth((t) => midApi.me.sessions(t, 'all')));
  $effect(() => {
    if (auth.status === 'member') void load();
  });

  const isStaff = (i: MySessionItem) => i.membership === 'approved' && i.roles.some((r) => r !== 'quran_student');
  const shown = $derived(
    (list.data ?? []).filter((i) => (filter === 'all' ? true : filter === 'staff' ? isStaff(i) : !isStaff(i)))
  );
  const filters = [
    { v: 'all', l: 'همه' },
    { v: 'staff', l: 'مدیریت‌شده' },
    { v: 'student', l: 'عضویت' }
  ] as const;
</script>

<svelte:head>
  <title>جلسه‌های من — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="container wrap">
  {#if auth.status === 'guest'}
    <GatePanel title="جلسه‌های من مخصوص اعضاست" message="برای دیدن جلسه‌هایی که عضو آن‌ها هستید وارد حساب خود شوید." />
  {:else}
    <PageHeader title="جلسه‌های من" subtitle="جلسه‌هایی که عضو آن‌ها هستید یا مدیریت می‌کنید.">
      {#snippet actions()}
        {#if caps.canManage}<Button href="/manage" variant="secondary" size="sm"><Icon name="shield" size={18} />مدیریت</Button>{/if}
      {/snippet}
    </PageHeader>

    <div class="chips" role="group" aria-label="فیلتر جلسه‌ها">
      {#each filters as f (f.v)}
        <button type="button" class="chip" class:active={filter === f.v} aria-pressed={filter === f.v} onclick={() => (filter = f.v)}>{f.l}</button>
      {/each}
    </div>

    {#if list.status === 'ready' && list.data}
      {#if shown.length === 0}
        <EmptyState
          icon="calendar"
          title={list.data.length === 0 ? 'هنوز عضو هیچ جلسه‌ای نیستید' : 'جلسه‌ای در این دسته نیست'}
          message={list.data.length === 0 ? 'جلسات را مرور کنید و درخواست عضویت دهید.' : 'فیلتر دیگری را امتحان کنید.'}
        >
          {#snippet action()}<Button href="/sessions">مشاهدهٔ جلسات</Button>{/snippet}
        </EmptyState>
      {:else}
        <div class="grid">
          {#each shown as item (item.session.id)}<MySessionCard {item} />{/each}
        </div>
      {/if}
    {:else if list.status === 'error'}
      <EmptyState icon={list.offline ? 'wifi-off' : 'alert'} tone="error" title="فهرست بارگذاری نشد" message={list.error ?? ''}>
        {#snippet action()}<Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
      </EmptyState>
    {:else}
      <div class="grid" aria-hidden="true">
        {#each [0, 1, 2] as i (i)}<Skeleton h="180px" radius="var(--radius-lg)" />{/each}
      </div>
      <span class="sr-only" role="status">در حال بارگذاری…</span>
    {/if}
  {/if}
</div>

<style>
  .wrap {
    max-width: 56rem;
    padding-top: var(--space-xl);
    padding-bottom: var(--space-2xl);
  }
  .chips {
    display: flex;
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
  @media (min-width: 720px) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
