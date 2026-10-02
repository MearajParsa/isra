<script lang="ts">
  import { api } from '$lib/api';
  import type { InboxItem } from '$lib/api/types';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, isNetworkError } from '$lib/utils/errors';
  import { formatNumber } from '$lib/utils/format';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import InboxItemRow from '$lib/components/features/InboxItemRow.svelte';
  import GatePanel from '$lib/components/features/GatePanel.svelte';

  let items = $state<InboxItem[]>([]);
  let total = $state(0);
  let pageNo = $state(1);
  let unreadOnly = $state(false);
  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let error = $state<string | null>(null);
  let offline = $state(false);
  let more = $state(false);
  let expanded = $state<string | null>(null);

  async function load(reset = true) {
    if (reset) {
      status = 'loading';
      pageNo = 1;
    } else {
      more = true;
    }
    error = null;
    try {
      const page = reset ? 1 : pageNo + 1;
      const res = await auth.withAuth((t) => api.me.inbox(t, { page, pageSize: 8, unreadOnly }));
      items = reset ? res.items : [...items, ...res.items];
      total = res.total;
      pageNo = res.page;
      status = 'ready';
    } catch (e) {
      error = errorMessage(e);
      offline = isNetworkError(e);
      if (reset) status = 'error';
      else toasts.error(error);
    } finally {
      more = false;
    }
  }

  $effect(() => {
    if (auth.status === 'member') {
      void unreadOnly;
      void load(true);
    }
  });

  async function open(item: InboxItem) {
    expanded = expanded === item.id ? null : item.id;
    if (!item.readAt) {
      items = items.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i));
      auth.setUnread(auth.unread - 1);
      try {
        await auth.withAuth((t) => api.me.markRead(t, item.id));
      } catch (e) {
        items = items.map((i) => (i.id === item.id ? { ...i, readAt: null } : i));
        auth.setUnread(auth.unread + 1);
        toasts.error(errorMessage(e));
      }
    }
  }

  async function readAll() {
    try {
      await auth.withAuth((t) => api.me.markAllRead(t));
      const now = new Date().toISOString();
      items = items.map((i) => ({ ...i, readAt: i.readAt ?? now }));
      auth.setUnread(0);
      toasts.success('همهٔ پیام‌ها خوانده شد.');
      if (unreadOnly) await load(true);
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  const hasMore = $derived(items.length < total);
</script>

<svelte:head>
  <title>اینباکس — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="container wrap">
  {#if auth.status === 'guest'}
    <GatePanel title="اینباکس مخصوص اعضاست" message="برای دیدن اعلان‌های عضویت، نوبت و ارزیابی وارد حساب خود شوید." />
  {:else}
    <PageHeader title="اینباکس" subtitle={auth.unread > 0 ? `${formatNumber(auth.unread)} پیام خوانده‌نشده` : 'همهٔ پیام‌ها خوانده شده‌اند'}>
      {#snippet actions()}
        <Button variant="text" size="sm" disabled={auth.unread === 0} onclick={readAll}><Icon name="check" size={18} />خواندن همه</Button>
      {/snippet}
    </PageHeader>

    <div class="chips" role="group" aria-label="فیلتر پیام‌ها">
      <button type="button" class="chip" class:active={!unreadOnly} aria-pressed={!unreadOnly} onclick={() => (unreadOnly = false)}>همه</button>
      <button type="button" class="chip" class:active={unreadOnly} aria-pressed={unreadOnly} onclick={() => (unreadOnly = true)}>خوانده‌نشده</button>
    </div>

    {#if status === 'loading' || auth.status === 'unknown'}
      <div class="list" aria-hidden="true">
        {#each [0, 1, 2, 3, 4] as i (i)}<Skeleton h="84px" radius="var(--radius-md)" />{/each}
      </div>
      <span class="sr-only" role="status">در حال بارگذاری پیام‌ها…</span>
    {:else if status === 'error'}
      <EmptyState icon={offline ? 'wifi-off' : 'alert'} tone="error" title={offline ? 'اتصال برقرار نیست' : 'اینباکس بارگذاری نشد'} message={error ?? ''}>
        {#snippet action()}<Button variant="secondary" onclick={() => load(true)}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
      </EmptyState>
    {:else if items.length === 0}
      <EmptyState
        icon="bell"
        title={unreadOnly ? 'پیام خوانده‌نشده‌ای ندارید' : 'اینباکس شما خالی است'}
        message={unreadOnly ? 'همه‌چیز را خوانده‌اید.' : 'اعلان‌های عضویت، نوبت و ارزیابی اینجا نشان داده می‌شود.'}
      />
    {:else}
      <ul class="list">
        {#each items as item (item.id)}
          <InboxItemRow {item} onopen={open} expanded={expanded === item.id} />
        {/each}
      </ul>
      {#if hasMore}
        <div class="more"><Button variant="secondary" loading={more} onclick={() => load(false)}>نمایش پیام‌های بیشتر</Button></div>
      {:else if total > 8}
        <p class="muted end">به انتهای فهرست رسیدید.</p>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .wrap {
    max-width: 44rem;
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
  .list {
    display: grid;
    gap: var(--space-sm);
  }
  .more {
    display: grid;
    justify-items: center;
    margin-top: var(--space-lg);
  }
  .end {
    margin-top: var(--space-lg);
    text-align: center;
    font-size: var(--fs-sm);
  }
</style>
