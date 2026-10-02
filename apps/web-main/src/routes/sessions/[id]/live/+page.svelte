<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { midApi } from '$lib/api';
  import type { Evaluation, EvaluationInput, LiveEvent, QueueAction, QueueState, SessionMe } from '$lib/api/mid-types';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import { formatNumber } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import { ApiError, type Page } from '$lib/api/types';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import LiveIndicator from '$lib/components/ui/LiveIndicator.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import AttendanceCard from '$lib/components/features/AttendanceCard.svelte';
  import QueueStatusCard from '$lib/components/features/QueueStatusCard.svelte';
  import QueueManager from '$lib/components/features/QueueManager.svelte';
  import EvaluationForm from '$lib/components/features/EvaluationForm.svelte';
  import EvaluationResult from '$lib/components/features/EvaluationResult.svelte';

  const id = $derived(page.params.id as string);

  const me = new Resource<SessionMe>();
  const queue = new Resource<QueueState>();
  const attendance = new Resource<{ items: { userId: string; name: string; enteredAt: string }[]; total: number }>();
  const evals = new Resource<Page<Evaluation>>();

  let connected = $state(false);
  let tab = $state('queue');
  let busy = $state<string | null>(null);
  let evalTarget = $state<string | null>(null);
  let evalErrors = $state<Record<string, string>>({});

  const weights = $derived(me.data?.evalWeights ?? { voice: 40, tone: 30, tajweed: 30 });
  const approved = $derived(me.data?.membership?.status === 'approved');
  const perms = $derived(me.data?.permissions ?? []);
  const roles = $derived(me.data?.membership?.roles ?? []);
  const session = $derived(me.data?.session);
  const started = $derived(session?.status === 'started');
  const canQueue = $derived(perms.includes('queue.manage'));
  const canEval = $derived(perms.includes('eval.submit'));
  const canAtt = $derived(perms.includes('attendance.view'));
  const isStudent = $derived(roles.includes('quran_student'));
  const present = $derived(Boolean(me.data?.myAttendance));
  const isStaffView = $derived(canQueue || canAtt);

  const tokenCall = <T,>(fn: (t: string) => Promise<T>) => auth.withAuth(fn);
  const loadMe = (silent = false) => me.load(() => tokenCall((t) => midApi.sessions.me(t, id)), silent);
  const loadQueue = (silent = false) => queue.load(() => tokenCall((t) => midApi.queue.state(t, id)), silent);
  const loadAtt = (silent = false) => attendance.load(() => tokenCall((t) => midApi.attendance.list(t, id)), silent);
  const loadEvals = (silent = false) => evals.load(() => tokenCall((t) => midApi.evaluations.list(t, id)), silent);

  // اعضای واردشده: بارگذاری اولیه
  $effect(() => {
    if (auth.status === 'guest') void goto(`/auth/phone?next=${encodeURIComponent(page.url.pathname)}`, { replaceState: true });
    else if (auth.status === 'member') void loadMe();
  });

  $effect(() => {
    if (!approved) return;
    void loadQueue();
    void loadEvals();
    if (canAtt) void loadAtt();
  });

  function onLive(e: LiveEvent) {
    switch (e.type) {
      case 'attendance.updated':
        if (canAtt) void loadAtt(true);
        break;
      case 'queue.updated':
        void loadQueue(true);
        break;
      case 'queue.turned':
        void loadQueue(true);
        if (e.payload?.userId === auth.me?.id) toasts.success('نوبت شماست! قرائت خود را شروع کنید.');
        break;
      case 'eval.updated':
        void loadEvals(true);
        void loadQueue(true);
        break;
      case 'session.state':
        void loadMe(true);
        if (!e.payload?.resync) toasts.info('وضعیت جلسه تغییر کرد.');
        break;
    }
  }

  // اتصال زنده (Socket.IO روی api-mid): توکن تازه از auth خوانده می‌شود؛ قطع/انقضا ⇒ reconnect خودکار
  $effect(() => {
    const sessionId = id;
    if (!approved) return;
    return midApi.live.subscribe({ getToken: () => auth.accessToken, sessionId, onEvent: onLive, onStatus: (c) => (connected = c) });
  });

  async function run(key: string, fn: () => Promise<void>) {
    busy = key;
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SERVICE_UNAVAILABLE') connected = false;
      toasts.error(errorMessage(e));
    } finally {
      busy = null;
    }
  }

  const checkIn = () =>
    run('att', async () => {
      const r = await tokenCall((t) => midApi.attendance.checkIn(t, id));
      if (r.alreadyPresent) toasts.info('حضور شما قبلاً ثبت شده است.');
      else toasts.success(`حضور ثبت شد؛ ${formatNumber(r.pointsAwarded)} امتیاز گرفتید.`);
      await loadMe(true);
    });
  const join = () =>
    run('q', async () => {
      await tokenCall((t) => midApi.queue.join(t, id));
      await loadQueue(true);
      toasts.success('به صف پیوستید.');
    });
  const leave = () =>
    run('q', async () => {
      await tokenCall((t) => midApi.queue.leave(t, id));
      await loadQueue(true);
      toasts.info('از صف خارج شدید.');
    });
  const next = () =>
    run('next', async () => {
      queue.data = await tokenCall((t) => midApi.queue.next(t, id));
    });
  const act = (itemId: string, action: QueueAction) =>
    run('act', async () => {
      queue.data = await tokenCall((t) => midApi.queue.act(t, id, itemId, action));
    });

  function startEval(itemId: string) {
    evalTarget = itemId;
    evalErrors = {};
    tab = 'evaluation';
  }
  const submitEval = (input: Omit<EvaluationInput, 'queueItemId'>) =>
    run('eval', async () => {
      if (!evalTarget) return;
      try {
        await tokenCall((t) => midApi.evaluations.submit(t, id, { ...input, queueItemId: evalTarget! }));
        toasts.success('ارزیابی ثبت شد.');
        evalTarget = null;
        await Promise.all([loadEvals(true), loadQueue(true)]);
      } catch (e) {
        evalErrors = fieldErrors(e);
        if (Object.keys(evalErrors).length === 0) throw e;
      }
    });

  const targetItem = $derived(
    queue.data ? [queue.data.current, ...queue.data.done].find((i) => i && i.id === evalTarget) ?? null : null
  );
  const evaluable = $derived(
    queue.data ? [queue.data.current, ...queue.data.done].filter((i): i is NonNullable<typeof i> => !!i && !i.evaluated) : []
  );
  const myEvals = $derived((evals.data?.items ?? []).filter((e) => e.userId === auth.me?.id));

  const tabs = $derived([
    { id: 'queue', label: 'صف نوبت', count: queue.data?.waitingCount },
    { id: 'attendance', label: 'حاضرین', count: attendance.data?.total },
    { id: 'evaluation', label: 'ارزیابی' }
  ]);
</script>

<svelte:head>
  <title>{session ? `اتاق جلسه — ${session.title}` : 'اتاق جلسه'} — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="container wrap">
  {#if me.status === 'error'}
    <EmptyState
      icon={me.offline ? 'wifi-off' : 'alert'}
      tone="error"
      title={me.error?.includes('پیدا نشد') ? 'جلسه پیدا نشد' : 'اتاق جلسه بارگذاری نشد'}
      message={me.error ?? ''}
    >
      {#snippet action()}
        <Button variant="secondary" onclick={() => loadMe()}><Icon name="refresh" size={18} />تلاش دوباره</Button>
        <Button variant="text" href="/my-sessions">جلسه‌های من</Button>
      {/snippet}
    </EmptyState>
  {:else if me.status !== 'ready' || !me.data}
    <div class="sk" aria-hidden="true">
      <Skeleton w="50%" h="32px" />
      <Skeleton h="96px" radius="var(--radius-lg)" />
      <Skeleton h="180px" radius="var(--radius-lg)" />
    </div>
    <span class="sr-only" role="status">در حال بارگذاری اتاق جلسه…</span>
  {:else if !approved && session}
    <PageHeader title={session.title} backHref={`/sessions/${id}`} />
    <EmptyState
      icon="lock"
      title="فقط اعضای جلسه وارد اتاق می‌شوند"
      message={me.data.membership?.status === 'pending' ? 'درخواست عضویت شما در انتظار تأیید است.' : 'ابتدا از صفحهٔ جلسه درخواست عضویت دهید.'}
    >
      {#snippet action()}<Button href={`/sessions/${id}`}>صفحهٔ جلسه</Button>{/snippet}
    </EmptyState>
  {:else if session}
    <PageHeader title={session.title} backHref="/my-sessions">
      {#snippet actions()}
        <span class="hd"><StatusChip status={session.status} />{#if started}<LiveIndicator {connected} />{/if}</span>
      {/snippet}
    </PageHeader>

    {#if session.status === 'scheduled'}
      <NoticeBanner tone="info">جلسه هنوز شروع نشده است. ثبت حضور و صف پس از شروع توسط مدیر جلسه فعال می‌شود.</NoticeBanner>
    {:else if session.status === 'ended'}
      <NoticeBanner tone="info">این جلسه پایان یافته است. نتایج ارزیابی شما در پایین نمایش داده می‌شود.</NoticeBanner>
    {:else if !connected}
      <NoticeBanner tone="warning">اتصال زنده قطع است؛ تغییرات با تأخیر نمایش داده می‌شود.</NoticeBanner>
    {/if}

    <div class="stack">
      <div class="cols">
        <AttendanceCard {started} enteredAt={me.data.myAttendance?.enteredAt ?? null} busy={busy === 'att'} oncheckin={checkIn} />
        {#if isStudent && queue.data}
          <QueueStatusCard queue={queue.data} {started} {present} busy={busy === 'q'} onjoin={join} onleave={leave} />
        {:else if isStudent && queue.status === 'loading'}
          <Skeleton h="220px" radius="var(--radius-lg)" />
        {/if}
      </div>

      {#if isStaffView}
        <section aria-label="مدیریت جلسه">
          <Tabs label="بخش‌های اتاق جلسه" {tabs} active={tab} onchange={(t) => (tab = t)} />

          <div id="panel-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={tab !== 'queue'}>
            {#if tab === 'queue'}
              {#if queue.data && canQueue}
                <QueueManager
                  queue={queue.data}
                  {started}
                  canEvaluate={canEval}
                  busy={busy === 'next' || busy === 'act'}
                  onnext={next}
                  onact={act}
                  onevaluate={startEval}
                />
              {:else if queue.status === 'error'}
                <EmptyState icon="alert" tone="error" compact title="صف بارگذاری نشد" message={queue.error ?? ''}>
                  {#snippet action()}<Button variant="secondary" size="sm" onclick={() => loadQueue()}>تلاش دوباره</Button>{/snippet}
                </EmptyState>
              {:else}
                <Skeleton h="160px" radius="var(--radius-lg)" />
              {/if}
            {/if}
          </div>

          <div id="panel-attendance" role="tabpanel" aria-labelledby="tab-attendance" hidden={tab !== 'attendance'}>
            {#if tab === 'attendance'}
              {#if attendance.data}
                {#if attendance.data.items.length === 0}
                  <EmptyState icon="users" compact title="هنوز کسی حاضر نشده" message="با ثبت حضور اعضا، فهرست اینجا زنده به‌روز می‌شود." />
                {:else}
                  <p class="muted cnt">{formatNumber(attendance.data.total)} نفر حاضر هستند</p>
                  <ul class="att">
                    {#each attendance.data.items as a (a.userId)}
                      <li><span class="ok"><Icon name="check" size={16} /></span><strong>{a.name}</strong></li>
                    {/each}
                  </ul>
                {/if}
              {:else if attendance.status === 'error'}
                <EmptyState icon="alert" tone="error" compact title="حاضرین بارگذاری نشد" message={attendance.error ?? ''} />
              {:else}
                <Skeleton h="140px" radius="var(--radius-lg)" />
              {/if}
            {/if}
          </div>

          <div id="panel-evaluation" role="tabpanel" aria-labelledby="tab-evaluation" hidden={tab !== 'evaluation'}>
            {#if tab === 'evaluation'}
              {#if !canEval}
                <NoticeBanner tone="warning">
                  ثبت ارزیابی فقط برای معلم و پشتیبان جلسه مجاز است. مدیر جلسه به‌تنهایی نمی‌تواند ارزیابی ثبت کند.
                </NoticeBanner>
              {:else if targetItem}
                <EvaluationForm
                  name={targetItem.name ?? 'قرآن‌آموز'}
                  {weights}
                  busy={busy === 'eval'}
                  errors={evalErrors}
                  onsubmit={submitEval}
                  oncancel={() => (evalTarget = null)}
                />
              {:else if evaluable.length > 0}
                <h3 class="h">منتظر ارزیابی</h3>
                <ul class="pick">
                  {#each evaluable as it (it.id)}
                    <li>
                      <span><strong>{it.name}</strong> {#if it.status === 'current'}<span class="tag">در حال قرائت</span>{/if}</span>
                      <Button size="sm" onclick={() => startEval(it.id)}>ثبت ارزیابی</Button>
                    </li>
                  {/each}
                </ul>
              {:else}
                <EmptyState icon="check" compact title="ارزیابی در انتظاری نیست" message="بعد از قرائت هر نفر می‌توانید ارزیابی او را ثبت کنید." />
              {/if}

              <h3 class="h">ارزیابی‌های ثبت‌شده</h3>
              {#if evals.data && evals.data.items.length > 0}
                <div class="evs">
                  {#each evals.data.items as ev (ev.id)}<EvaluationResult evaluation={ev} staff />{/each}
                </div>
              {:else if evals.status === 'ready'}
                <p class="muted">هنوز ارزیابی‌ای ثبت نشده است.</p>
              {/if}
            {/if}
          </div>
        </section>
      {/if}

      {#if isStudent || session.status === 'ended'}
        <section aria-labelledby="my-ev">
          <h2 id="my-ev" class="h">نتیجهٔ ارزیابی‌های شما</h2>
          {#if myEvals.length > 0}
            <div class="evs">{#each myEvals as ev (ev.id)}<EvaluationResult evaluation={ev} />{/each}</div>
          {:else if evals.status === 'ready'}
            <p class="muted">هنوز ارزیابی‌ای برای شما ثبت نشده است. بعد از قرائت، نتیجه اینجا نمایش داده می‌شود.</p>
          {:else}
            <Skeleton h="120px" radius="var(--radius-lg)" />
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wrap {
    max-width: 56rem;
    padding-top: var(--space-xl);
    padding-bottom: var(--space-2xl);
  }
  .hd {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }
  .sk,
  .stack {
    display: grid;
    gap: var(--space-lg);
  }
  .stack {
    margin-top: var(--space-md);
  }
  .cols {
    display: grid;
    gap: var(--space-md);
    align-items: start;
  }
  @media (min-width: 800px) {
    .cols {
      grid-template-columns: 1fr 1fr;
    }
  }
  .h {
    margin-block: var(--space-lg) var(--space-sm);
    font-size: var(--fs-lg);
  }
  .evs,
  .pick,
  .att {
    display: grid;
    gap: var(--space-sm);
  }
  .pick li,
  .att li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  .att li {
    justify-content: flex-start;
  }
  .ok {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .tag {
    margin-inline-start: 6px;
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-tint);
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-weight: 700;
  }
  .cnt {
    margin-bottom: var(--space-sm);
    font-size: var(--fs-sm);
  }
</style>
