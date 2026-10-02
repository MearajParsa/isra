<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import type { DeviceSession } from '$lib/api/types';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage } from '$lib/utils/errors';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import DeviceSessionRow from '$lib/components/features/DeviceSessionRow.svelte';

  const list = new Resource<DeviceSession[]>();
  let target = $state<DeviceSession | null>(null);
  let confirmOne = $state(false);
  let confirmOthers = $state(false);

  const load = () => list.load(() => auth.withAuth((t) => api.me.listSessions(t)));
  $effect(() => {
    void load();
  });

  const others = $derived((list.data ?? []).filter((s) => !s.current));

  function ask(s: DeviceSession) {
    target = s;
    confirmOne = true;
  }

  async function revokeOne() {
    if (!target) return;
    const s = target;
    try {
      await auth.withAuth((t) => api.me.revokeSession(t, s.id));
      if (s.current) {
        await auth.logout();
        toasts.info('از حساب خود خارج شدید.');
        await goto('/', { replaceState: true });
        return;
      }
      toasts.success('دستگاه از حساب شما خارج شد.');
      await load();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  async function revokeOthers() {
    try {
      await auth.withAuth((t) => api.me.revokeOthers(t));
      toasts.success('از همهٔ دستگاه‌های دیگر خارج شدید.');
      await load();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }
</script>

<svelte:head>
  <title>دستگاه‌ها و نشست‌ها — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHeader title="دستگاه‌ها و نشست‌ها" subtitle="دستگاه‌هایی که با حساب شما وارد شده‌اند." backHref="/account" />

{#if list.status === 'ready' && list.data}
  <ul class="list">
    {#each list.data as s (s.id)}
      <DeviceSessionRow session={s} onrevoke={ask} />
    {/each}
  </ul>

  {#if others.length === 0}
    <p class="muted note"><Icon name="shield" size={18} />دستگاه دیگری وارد حساب شما نشده است.</p>
  {:else}
    <div class="all">
      <Button variant="secondary" onclick={() => (confirmOthers = true)}>خروج از همهٔ دستگاه‌های دیگر</Button>
    </div>
  {/if}
{:else if list.status === 'error'}
  <EmptyState icon={list.offline ? 'wifi-off' : 'alert'} tone="error" title="فهرست دستگاه‌ها بارگذاری نشد" message={list.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="list" aria-hidden="true">
    {#each [0, 1, 2] as i (i)}<Skeleton h="80px" radius="var(--radius-md)" />{/each}
  </div>
{/if}

<ConfirmDialog
  bind:open={confirmOne}
  title={target?.current ? 'خروج از این دستگاه' : 'خروج از دستگاه'}
  message={target?.current
    ? 'از حساب خود در همین دستگاه خارج می‌شوید.'
    : `«${target?.deviceLabel ?? ''}» از حساب شما خارج می‌شود و باید دوباره وارد شود.`}
  confirmLabel="خروج"
  destructive
  onconfirm={revokeOne}
/>

<ConfirmDialog
  bind:open={confirmOthers}
  title="خروج از همهٔ دستگاه‌های دیگر"
  message="همهٔ نشست‌ها به‌جز این دستگاه بسته می‌شوند و باید دوباره وارد شوند."
  confirmLabel="خروج از بقیه"
  destructive
  onconfirm={revokeOthers}
/>

<style>
  .list {
    display: grid;
    gap: var(--space-sm);
  }
  .note {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
    font-size: var(--fs-sm);
  }
  .all {
    margin-top: var(--space-lg);
  }
</style>
