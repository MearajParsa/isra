<script lang="ts">
  import { page } from '$app/state';
  import { midApi } from '$lib/api';
  import type { Member, SessionMe, SessionState } from '$lib/api/mid-types';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage } from '$lib/utils/errors';
  import { formatDateTime, formatNumber } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import LifecycleStepper from '$lib/components/features/LifecycleStepper.svelte';
  import ScheduleInfo from '$lib/components/features/ScheduleInfo.svelte';
  import MemberRow from '$lib/components/features/MemberRow.svelte';

  const id = $derived(page.params.id as string);
  const me = new Resource<SessionMe>();
  const members = new Resource<Member[]>();

  let tab = $state('overview');
  let busyMember = $state<string | null>(null);
  let confirmOpen = $state(false);
  let target = $state<Exclude<SessionState, 'draft'> | null>(null);

  const perms = $derived(me.data?.permissions ?? []);
  const can = (p: string) => perms.includes(p as never);
  const session = $derived(me.data?.session);
  /** ۱.۷.۰: صاحب یا پشتیبان جلسه */
  const isStaff = $derived(me.data?.role === 'owner' || me.data?.role === 'supporter');
  /** M-11: membership.manage یا membership.approve */
  const canMembers = $derived(can('membership.approve') || can('membership.manage'));

  const loadMe = () => me.load(() => auth.withAuth((t) => midApi.sessions.me(t, id)));
  const loadMembers = (silent = false) => members.load(() => auth.withAuth((t) => midApi.members.list(t, id)), silent);

  $effect(() => {
    void loadMe();
  });
  $effect(() => {
    if (canMembers) void loadMembers();
  });

  const pending = $derived((members.data ?? []).filter((m) => m.status === 'pending'));
  const approved = $derived((members.data ?? []).filter((m) => m.status === 'approved'));

  const nextStep = $derived.by((): { to: Exclude<SessionState, 'draft'>; label: string; msg: string; destructive: boolean } | null => {
    switch (session?.status) {
      case 'draft':
        return { to: 'scheduled', label: 'انتشار جلسه', msg: 'جلسه برای همه قابل مشاهده می‌شود و اعضا می‌توانند درخواست عضویت دهند. پس از انتشار فقط زمان‌بندی قابل ویرایش است.', destructive: false };
      case 'scheduled':
        return { to: 'started', label: 'شروع جلسه', msg: 'حضور و صف نوبت برای اعضا فعال می‌شود. این کار قابل برگشت نیست.', destructive: false };
      case 'started':
        return { to: 'ended', label: 'پایان جلسه', msg: 'جلسه تمام می‌شود و حضور و صف بسته می‌شود. این کار قابل برگشت نیست.', destructive: true };
      default:
        return null;
    }
  });

  function askTransition() {
    if (!nextStep) return;
    target = nextStep.to;
    confirmOpen = true;
  }
  async function doTransition() {
    if (!target) return;
    try {
      await auth.withAuth((t) => midApi.sessions.transition(t, id, target!));
      toasts.success('وضعیت جلسه به‌روز شد.');
      await loadMe();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }

  async function decide(m: Member, action: 'approve' | 'reject') {
    busyMember = m.id;
    try {
      await auth.withAuth((t) => midApi.members.decide(t, id, m.id, action));
      toasts.success(action === 'approve' ? `عضویت ${m.name} تأیید شد.` : `درخواست ${m.name} رد شد.`);
      await Promise.all([loadMembers(true), loadMe()]);
    } catch (e) {
      toasts.error(errorMessage(e));
    } finally {
      busyMember = null;
    }
  }
  const tabs = $derived([
    { id: 'overview', label: 'نمای کلی' },
    ...(canMembers ? [{ id: 'members', label: 'اعضا', count: pending.length }] : [])
  ]);
</script>

<svelte:head>
  <title>{session ? `پنل جلسه — ${session.title}` : 'پنل جلسه'} — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if me.status === 'error'}
  <EmptyState icon={me.offline ? 'wifi-off' : 'alert'} tone="error" title="پنل جلسه بارگذاری نشد" message={me.error ?? ''}>
    {#snippet action()}
      <Button variant="secondary" onclick={loadMe}><Icon name="refresh" size={18} />تلاش دوباره</Button>
      <Button variant="text" href="/manage">بازگشت</Button>
    {/snippet}
  </EmptyState>
{:else if me.status !== 'ready' || !session}
  <div class="sk" aria-hidden="true">
    <Skeleton w="50%" h="32px" />
    <Skeleton h="90px" radius="var(--radius-lg)" />
    <Skeleton h="160px" radius="var(--radius-lg)" />
  </div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{:else if !isStaff}
  <EmptyState icon="lock" title="دسترسی به پنل این جلسه ندارید" message="فقط استاد و پشتیبان‌های جلسه به این بخش دسترسی دارند.">
    {#snippet action()}<Button href="/manage">بازگشت</Button>{/snippet}
  </EmptyState>
{:else}
  <PageHeader title={session.title} backHref="/manage">
    {#snippet actions()}<StatusChip status={session.status} />{/snippet}
  </PageHeader>

  <Tabs label="بخش‌های پنل جلسه" {tabs} active={tab} onchange={(t) => (tab = t)} />

  <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden={tab !== 'overview'}>
    {#if tab === 'overview'}
      <div class="stack">
        <section class="card" aria-label="مراحل جلسه">
          <LifecycleStepper status={session.status} />
          {#if can('session.edit') && nextStep}
            <div class="act">
              <p class="muted small">مرحلهٔ بعد: <strong>{nextStep.label}</strong> — فقط رو به جلو.</p>
              <Button variant={nextStep.destructive ? 'danger' : 'primary'} onclick={askTransition}>{nextStep.label}</Button>
            </div>
          {:else if session.status === 'ended'}
            <p class="muted small act">جلسه پایان یافته و دیگر تغییر نمی‌کند.</p>
          {:else if !can('session.edit')}
            <p class="muted small act">فقط استاد جلسه یا پشتیبانِ دارای مجوز ویرایش می‌تواند وضعیت را تغییر دهد.</p>
          {/if}
        </section>

        <section class="card info">
          <h3>مشخصات</h3>
          <p class="desc">{session.description}</p>
          <ScheduleInfo schedule={session.schedule} />
          {#if session.nextStartsAt}<p class="small"><Icon name="calendar" size={16} /> شروع بعدی: <strong>{formatDateTime(session.nextStartsAt)}</strong></p>{/if}
          <p class="small"><Icon name="pin" size={16} /> {session.location.label}</p>
          {#if session.location.routeUrl}
          <Button href={session.location.routeUrl} external variant="secondary" size="sm"><Icon name="route" size={16} />مسیریابی</Button>
        {/if}
          <div class="btns">
            {#if can('session.edit')}
              {#if session.status === 'draft' || session.status === 'scheduled'}
                <Button variant="secondary" href={`/manage/${id}/edit`}>ویرایش جلسه</Button>
              {:else}
                <NoticeBanner tone="info">جلسهٔ شروع‌شده یا پایان‌یافته قابل ویرایش نیست.</NoticeBanner>
              {/if}
            {/if}
            {#if session.status === 'started' || session.status === 'ended'}
              <Button href={`/sessions/${id}/live`}><Icon name="mic" size={18} />اتاق جلسه</Button>
            {/if}
          </div>
        </section>

        {#if can('membership.approve') && pending.length > 0}
          <NoticeBanner tone="warning">
            {formatNumber(pending.length)} درخواست عضویت منتظر بررسی است.
            {#snippet action()}<Button size="sm" variant="text" onclick={() => (tab = 'members')}>مشاهده</Button>{/snippet}
          </NoticeBanner>
        {/if}
      </div>
    {/if}
  </div>

  <div id="panel-members" role="tabpanel" aria-labelledby="tab-members" hidden={tab !== 'members'}>
    {#if tab === 'members'}
      {#if members.status === 'ready' && members.data}
        <h3 class="h">درخواست‌های در انتظار ({formatNumber(pending.length)})</h3>
        {#if pending.length === 0}
          <p class="muted">درخواست جدیدی نیست.</p>
        {:else}
          <ul class="list">
            {#each pending as m (m.id)}
              <MemberRow member={m} canApprove={can('membership.approve')} busy={busyMember === m.id} ondecide={decide} />
            {/each}
          </ul>
        {/if}

        <h3 class="h">اعضا ({formatNumber(approved.length)})</h3>
        {#if approved.length === 0}
          <p class="muted">هنوز عضو تأییدشده‌ای نیست.</p>
        {:else}
          <ul class="list">
            {#each approved as m (m.id)}
              <MemberRow member={m} canApprove={false} busy={busyMember === m.id} ondecide={decide} />
            {/each}
          </ul>
        {/if}
      {:else if members.status === 'error'}
        <EmptyState icon="alert" tone="error" compact title="فهرست اعضا بارگذاری نشد" message={members.error ?? ''}>
          {#snippet action()}<Button variant="secondary" size="sm" onclick={() => loadMembers()}>تلاش دوباره</Button>{/snippet}
        </EmptyState>
      {:else}
        <Skeleton h="160px" radius="var(--radius-lg)" />
      {/if}
    {/if}
  </div>

  <ConfirmDialog
    bind:open={confirmOpen}
    title={nextStep?.label ?? ''}
    message={nextStep?.msg ?? ''}
    confirmLabel={nextStep?.label ?? 'تأیید'}
    destructive={nextStep?.destructive ?? false}
    onconfirm={doTransition}
  />
{/if}

<style>
  .sk,
  .stack {
    display: grid;
    gap: var(--space-lg);
  }
  .card {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .act {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--color-outline);
  }
  .small {
    font-size: var(--fs-sm);
  }
  .desc {
    line-height: 2;
  }
  .btns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }
  .h {
    margin-block: var(--space-lg) var(--space-sm);
    font-size: var(--fs-lg);
  }
  .list {
    display: grid;
    gap: var(--space-sm);
  }
</style>
