<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, type AdminSession, type SessionInput, type SessionState } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { stepped, describeError } from '$lib/utils/adminCall';
  import { fieldErrors } from '$lib/utils/errors';
  import { NEXT_STATE, SESSION_STATE, TRANSITION_LABEL } from '$lib/utils/labels';
  import { formatDateTime, formatNumber, scheduleLabel } from '$lib/utils/format';
  import { mapServerFields } from '$lib/utils/sessionForm';
  import { withBase } from '$lib/utils/paths';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import SessionForm from '$lib/components/features/SessionForm.svelte';
  import SessionMembersPanel from '$lib/components/features/SessionMembersPanel.svelte';
  import SessionReadonlyTables from '$lib/components/features/SessionReadonlyTables.svelte';

  const id = $derived(page.params.id as string);
  const session = new Resource<AdminSession>();
  const load = (silent = false) => session.load(() => auth.withAuth((t) => api.system.session(t, id)), silent);
  $effect(() => {
    void id;
    void load();
  });

  const canManage = $derived(system.can('system.sessions.manage'));
  const s = $derived(session.data);
  const gone = $derived(!!s?.deletedAt);
  const editable = $derived(!!s && !gone && (s.status === 'draft' || s.status === 'scheduled'));
  const tone = { draft: 'neutral', scheduled: 'info', started: 'success', ended: 'warning' } as const;

  const VALID = ['info', 'members', 'attendance', 'queue', 'evaluations', 'status', 'delete'];
  let tab = $state(untrack(() => (VALID.includes(page.url.searchParams.get('tab') ?? '') ? (page.url.searchParams.get('tab') as string) : 'info')));
  function setTab(t: string) {
    tab = t;
    const u = new URL(page.url);
    if (t === 'info') u.searchParams.delete('tab');
    else u.searchParams.set('tab', t);
    void goto(u.pathname + u.search, { replaceState: true, keepFocus: true, noScroll: true });
  }
  const tabs = $derived([
    { id: 'info', label: 'اطلاعات' },
    { id: 'members', label: 'اعضا', count: s?.counts.pending ?? 0 },
    { id: 'attendance', label: 'حضور' },
    { id: 'queue', label: 'صف نوبت' },
    { id: 'evaluations', label: 'ارزیابی‌ها' },
    { id: 'status', label: 'وضعیت' },
    { id: 'delete', label: 'حذف' }
  ]);

  // ───────── ویرایش ─────────
  let saving = $state(false);
  let serverErrors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);
  async function save(input: SessionInput) {
    saving = true;
    serverErrors = {};
    formError = null;
    try {
      const r = await stepped((t, su) => api.system.updateSession(t, id, input, su));
      if (r) {
        session.data = r;
        toasts.success('جلسه ذخیره شد.');
      }
    } catch (e) {
      const f = fieldErrors(e);
      if (Object.keys(f).length) serverErrors = mapServerFields(f);
      else formError = describeError(e);
    } finally {
      saving = false;
    }
  }
  const initial = $derived<SessionInput | null>(s ? { title: s.title, description: s.description, schedule: s.schedule, location: { label: s.location.label, routeUrl: s.location.routeUrl ?? null } } : null);

  // ───────── وضعیت و حذف ─────────
  let transAsk = $state(false);
  let delAsk = $state(false);
  const next = $derived(s ? NEXT_STATE[s.status] : null);
  async function transition() {
    if (!next) return;
    try {
      const r = await stepped((t, su) => api.system.transitionSession(t, id, next, su));
      if (r) {
        session.data = r;
        toasts.success(`وضعیت جلسه: ${SESSION_STATE[r.status]}`);
      }
    } catch (e) {
      toasts.error(describeError(e));
    }
  }
  async function remove() {
    try {
      const ok = await stepped((t, su) => api.system.deleteSession(t, id, su).then(() => true));
      if (ok) {
        toasts.success('جلسه حذف شد (حذف نرم).');
        await load(true);
        setTab('info');
      }
    } catch (e) {
      toasts.error(describeError(e));
    }
  }

  const lifecycle: SessionState[] = ['draft', 'scheduled', 'started', 'ended'];
</script>

<svelte:head><title>{s ? `${s.title} — جلسه‌ها` : 'جلسه'} — مدیریت اسراء</title></svelte:head>

<PageHeader title={s?.title ?? 'جلسه'} backHref={withBase('/sessions')}>
  {#snippet actions()}
    {#if s}<span class="pill-row"><StatusChip tone={tone[s.status]}>{SESSION_STATE[s.status]}</StatusChip>{#if gone}<StatusChip tone="danger">حذف‌شده</StatusChip>{/if}</span>{/if}
  {/snippet}
</PageHeader>

{#if session.status === 'ready' && s && initial}
  {#if gone}<NoticeBanner tone="error">این جلسه در {formatDateTime(s.deletedAt!)} حذف شده است و فقط در پنل مدیریت دیده می‌شود. تاریخچهٔ حضور، ارزیابی و امتیاز حفظ شده است.</NoticeBanner>{/if}

  <Tabs {tabs} active={tab} label="بخش‌های جلسه" onchange={setTab} />

  <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabindex="-1">
    {#if tab === 'info'}
      <section class="card" aria-label="خلاصه">
        <dl class="facts">
          <div><dt>سازنده</dt><dd><a href={withBase(`/users/${s.createdBy.id}`)}>{s.createdBy.name || 'کاربر حذف‌شده'}</a></dd></div>
          <div><dt>زمان‌بندی</dt><dd>{scheduleLabel(s.schedule)}</dd></div>
          <div><dt>برگزاری بعدی</dt><dd>{s.nextStartsAt ? formatDateTime(s.nextStartsAt) : '—'}</dd></div>
          <div><dt>اعضا</dt><dd>{formatNumber(s.counts.members)} (در انتظار: {formatNumber(s.counts.pending)})</dd></div>
          <div><dt>حضور / ارزیابی</dt><dd>{formatNumber(s.counts.attendance)} / {formatNumber(s.counts.evaluations)}</dd></div>
          <div><dt>ساخته‌شده</dt><dd>{formatDateTime(s.createdAt)}</dd></div>
          <div><dt>آخرین ویرایش</dt><dd>{formatDateTime(s.updatedAt)}</dd></div>
        </dl>
      </section>
      {#if !editable}
        <NoticeBanner tone="info">{gone ? 'جلسهٔ حذف‌شده قابل ویرایش نیست.' : 'ویرایش فقط در وضعیت پیش‌نویس یا پیش‌رو ممکن است.'}</NoticeBanner>
      {:else if !canManage}
        <NoticeBanner tone="info">برای ویرایش، مجوز «مدیریت جلسه‌ها» لازم است.</NoticeBanner>
      {/if}
      {#key s.updatedAt}
        <SessionForm {initial} submitLabel="ذخیرهٔ تغییرات" busy={saving} readonly={!editable || !canManage} {serverErrors} {formError} onsubmit={save} />
      {/key}
    {:else if tab === 'members'}
      <SessionMembersPanel sessionId={id} canManage={canManage && !gone} onchanged={() => load(true)} />
    {:else if tab === 'attendance'}
      <SessionReadonlyTables sessionId={id} kind="attendance" />
    {:else if tab === 'queue'}
      <SessionReadonlyTables sessionId={id} kind="queue" />
    {:else if tab === 'evaluations'}
      <SessionReadonlyTables sessionId={id} kind="evaluations" />
    {:else if tab === 'status'}
      <section class="card" aria-labelledby="st-h">
        <h2 id="st-h">چرخهٔ حیات جلسه</h2>
        <ol class="steps" aria-label="مراحل">
          {#each lifecycle as st, i (st)}
            {@const idx = lifecycle.indexOf(s.status)}
            <li class:done={i < idx} class:cur={i === idx} aria-current={i === idx ? 'step' : undefined}>
              <span class="dot" aria-hidden="true">{#if i < idx}<Icon name="check" size={16} />{:else}{formatNumber(i + 1)}{/if}</span>
              <span>{SESSION_STATE[st]}</span>
            </li>
          {/each}
        </ol>
        <p class="muted fa-small">تغییر وضعیت فقط یک قدم رو به جلو ممکن است و برگشت ندارد.</p>
        {#if !canManage}
          <NoticeBanner tone="info">برای تغییر وضعیت، مجوز «مدیریت جلسه‌ها» لازم است.</NoticeBanner>
        {:else if gone}
          <NoticeBanner tone="info">جلسهٔ حذف‌شده تغییر وضعیت ندارد.</NoticeBanner>
        {:else if next}
          <div><Button onclick={() => (transAsk = true)}><Icon name="chevron-left" size={18} />{TRANSITION_LABEL[next]}</Button></div>
        {:else}
          <NoticeBanner tone="success">جلسه به پایان رسیده است.</NoticeBanner>
        {/if}
      </section>
    {:else if tab === 'delete'}
      <section class="card danger" aria-labelledby="dl-h">
        <h2 id="dl-h">حذف جلسه</h2>
        <p>حذف جلسه از همهٔ فهرست‌های کاربران پنهان می‌شود (حذف نرم) و در هر وضعیتی ممکن است. تاریخچهٔ حضور، ارزیابی و امتیاز حفظ می‌شود و فقط در پنل مدیریت (گزینهٔ «نمایش حذف‌شده‌ها») دیده می‌شود.</p>
        {#if !canManage}
          <NoticeBanner tone="info">برای حذف، مجوز «مدیریت جلسه‌ها» لازم است.</NoticeBanner>
        {:else if gone}
          <NoticeBanner tone="info">این جلسه پیش‌تر حذف شده است.</NoticeBanner>
        {:else}
          <div><Button variant="danger" onclick={() => (delAsk = true)}><Icon name="trash" size={18} />حذف جلسه</Button></div>
        {/if}
      </section>
    {/if}
  </div>

  <ConfirmDialog
    bind:open={transAsk}
    title={next ? TRANSITION_LABEL[next] : 'تغییر وضعیت'}
    message={next ? `وضعیت «${s.title}» از «${SESSION_STATE[s.status]}» به «${SESSION_STATE[next]}» تغییر می‌کند و برگشت‌پذیر نیست.` : ''}
    confirmLabel="تأیید و ادامه"
    onconfirm={transition}
  />
  <ConfirmDialog bind:open={delAsk} title="حذف جلسه" message={`«${s.title}» حذف می‌شود و برای کاربران دیده نخواهد شد. ادامه می‌دهید؟`} confirmLabel="حذف جلسه" destructive onconfirm={remove} />
{:else if session.status === 'error'}
  <EmptyState icon={session.offline ? 'wifi-off' : 'alert'} tone="error" title="جلسه بارگذاری نشد" message={session.error ?? ''}>
    {#snippet action()}
      <Button variant="secondary" onclick={() => load()}><Icon name="refresh" size={18} />تلاش دوباره</Button>
      <Button variant="text" href={withBase('/sessions')}>بازگشت</Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="stack" aria-hidden="true"><Skeleton h="52px" radius="var(--radius-md)" /><Skeleton h="260px" radius="var(--radius-lg)" /></div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{/if}

<style>
  .stack {
    display: grid;
    gap: var(--space-md);
  }
  .card {
    margin-bottom: var(--space-md);
  }
  .card.danger {
    border-color: color-mix(in srgb, var(--color-error) 35%, var(--color-outline));
    background: var(--color-error-tint);
  }
  .facts {
    display: grid;
    gap: var(--space-sm) var(--space-lg);
    margin: 0;
    font-size: var(--fs-sm);
  }
  @media (min-width: 720px) {
    .facts {
      grid-template-columns: 1fr 1fr;
    }
  }
  .facts div {
    display: flex;
    gap: var(--space-sm);
  }
  dt {
    min-width: 7rem;
    color: var(--color-muted);
  }
  dd {
    margin: 0;
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--color-muted);
    font-weight: 700;
  }
  .dot {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 2px solid var(--color-outline);
    font-size: var(--fs-sm);
  }
  .steps li.done .dot {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }
  .steps li.cur {
    color: var(--color-primary);
  }
  .steps li.cur .dot {
    background: var(--color-accent-warm);
    border-color: var(--color-accent-warm);
    color: var(--color-primary);
  }
</style>
