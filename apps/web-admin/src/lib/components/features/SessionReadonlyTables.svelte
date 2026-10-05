<script lang="ts" module>
  export type ReadonlyKind = 'attendance' | 'queue' | 'evaluations';
</script>

<script lang="ts">
  import { api, type AdminQueue, type AttendanceEntry, type Evaluation, type QueueItem } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { formatDateTime, formatNumber } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';

  interface Props {
    sessionId: string;
    kind: ReadonlyKind;
  }
  let { sessionId, kind }: Props = $props();

  const att = new Resource<{ items: AttendanceEntry[]; total: number }>();
  const queue = new Resource<AdminQueue>();
  const evals = new Resource<{ items: Evaluation[]; total: number }>();
  const res = $derived(kind === 'attendance' ? att : kind === 'queue' ? queue : evals);

  function load() {
    if (kind === 'attendance') return att.loadLatest((signal) => auth.withAuth((t) => api.system.sessionAttendance(t, sessionId, { signal })));
    if (kind === 'queue') return queue.loadLatest((signal) => auth.withAuth((t) => api.system.sessionQueue(t, sessionId, { signal })));
    return evals.loadLatest((signal) => auth.withAuth((t) => api.system.sessionEvaluations(t, sessionId, { signal })));
  }
  $effect(() => {
    void [sessionId, kind];
    void load();
  });

  const name = (n: string | null) => n || 'کاربر حذف‌شده';
  const qStatus = { waiting: 'در صف', current: 'نوبت فعلی', done: 'انجام‌شده' } as const;
  const qTone = { waiting: 'neutral', current: 'success', done: 'info' } as const;
  const queueRows = $derived<QueueItem[]>(queue.data ? [...(queue.data.current ? [queue.data.current] : []), ...queue.data.waiting, ...queue.data.done] : []);
</script>

<div class="bar">
  <span class="muted fa-small" aria-live="polite">
    {#if kind === 'attendance' && att.data}{formatNumber(att.data.total)} حاضر
    {:else if kind === 'queue' && queue.data}{formatNumber(queue.data.waitingCount)} نفر در انتظار
    {:else if kind === 'evaluations' && evals.data}{formatNumber(evals.data.total)} ارزیابی{/if}
    · نمای فقط‌خواندنی مدیر
  </span>
  <Button variant="text" size="sm" onclick={load}><Icon name="refresh" size={18} />تازه‌سازی</Button>
</div>

{#if res.status === 'error'}
  <EmptyState icon={res.offline ? 'wifi-off' : 'alert'} tone="error" compact title="بارگذاری نشد" message={res.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={load}>تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else if res.status !== 'ready'}
  <div class="sk" aria-hidden="true"><Skeleton h="44px" /><Skeleton h="44px" /><Skeleton h="44px" /></div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{:else if kind === 'attendance' && att.data}
  {#if att.data.items.length === 0}
    <EmptyState icon="users" compact title="حضوری ثبت نشده" />
  {:else}
    <div class="tblwrap">
      <table class="tbl">
        <caption class="sr-only">حاضرین جلسه</caption>
        <thead><tr><th scope="col">#</th><th scope="col">نام</th><th scope="col">زمان ورود</th></tr></thead>
        <tbody>
          {#each att.data.items as a, i (a.userId + a.enteredAt)}
            <tr><td class="num">{formatNumber(i + 1)}</td><th scope="row">{name(a.name)}</th><td>{formatDateTime(a.enteredAt)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{:else if kind === 'queue' && queue.data}
  {#if queueRows.length === 0}
    <EmptyState icon="list" compact title="صف خالی است" />
  {:else}
    <div class="tblwrap">
      <table class="tbl">
        <caption class="sr-only">صف نوبت جلسه</caption>
        <thead><tr><th scope="col">جایگاه</th><th scope="col">نام</th><th scope="col">وضعیت</th><th scope="col">ورود به صف</th><th scope="col">ارزیابی</th></tr></thead>
        <tbody>
          {#each queueRows as q (q.id)}
            <tr>
              <td class="num">{q.position ? formatNumber(q.position) : '—'}</td>
              <th scope="row">{name(q.name)}</th>
              <td><StatusChip tone={qTone[q.status]}>{qStatus[q.status]}</StatusChip></td>
              <td>{formatDateTime(q.joinedAt)}</td>
              <td>{q.evaluated ? 'انجام شده' : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{:else if kind === 'evaluations' && evals.data}
  {#if evals.data.items.length === 0}
    <EmptyState icon="award" compact title="ارزیابی‌ای ثبت نشده" />
  {:else}
    <div class="tblwrap">
      <table class="tbl wide">
        <caption class="sr-only">ارزیابی‌های جلسه</caption>
        <thead>
          <tr><th scope="col">قرآن‌آموز</th><th scope="col">ارزیاب</th><th scope="col" class="n">صوت</th><th scope="col" class="n">لحن</th><th scope="col" class="n">تجوید</th><th scope="col" class="n">نمره (۱۰۰)</th><th scope="col" class="n">امتیاز</th><th scope="col">یادداشت</th><th scope="col">زمان</th></tr>
        </thead>
        <tbody>
          {#each evals.data.items as e (e.id)}
            <tr>
              <th scope="row">{name(e.userName)}</th>
              <td>{name(e.evaluatorName)}</td>
              <td class="n">{formatNumber(e.voice)}</td>
              <td class="n">{formatNumber(e.tone)}</td>
              <td class="n">{formatNumber(e.tajweed)}</td>
              <td class="n"><strong>{formatNumber(e.score)}</strong></td>
              <td class="n">{formatNumber(e.points)}</td>
              <td class="note">{e.note || '—'}</td>
              <td>{formatDateTime(e.createdAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }
  .sk {
    display: grid;
    gap: var(--space-sm);
  }
  .tbl.wide {
    min-width: 58rem;
  }
  .note {
    max-width: 18rem;
    white-space: normal;
  }
</style>
