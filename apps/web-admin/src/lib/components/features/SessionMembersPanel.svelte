<script lang="ts">
  import { api, type AdminMember, type MembershipStatus, type Page } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { stepped, describeError } from '$lib/utils/adminCall';
  import { MEMBERSHIP } from '$lib/utils/labels';
  import { formatDateTime, formatNumber } from '$lib/utils/format';
  import { formatPhone } from '$lib/utils/phone';
  import { Resource } from '$lib/utils/resource.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Pager from '$lib/components/ui/Pager.svelte';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

  interface Props {
    sessionId: string;
    /** امکان تأیید/رد/حذف (مجوز مدیریت و جلسهٔ حذف‌نشده). ۱.۷.۰: فقط اعضا؛ نقش‌های درون جلسه حذف شد */
    canManage: boolean;
    onchanged?: () => void;
  }
  let { sessionId, canManage, onchanged }: Props = $props();

  const PAGE_SIZE = 50;
  let filter = $state<'' | MembershipStatus>('');
  let pageNo = $state(1);
  const members = new Resource<Page<AdminMember>>();
  let busyId = $state<string | null>(null);

  const load = () => members.loadLatest((signal) => auth.withAuth((t) => api.system.sessionMembers(t, sessionId, { status: filter || undefined, page: pageNo, pageSize: PAGE_SIZE }, { signal })));
  $effect(() => {
    void [sessionId, filter, pageNo];
    void load();
  });

  const tone = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;
  const filters: { v: '' | MembershipStatus; l: string }[] = [
    { v: '', l: 'همه' },
    { v: 'pending', l: 'در انتظار' },
    { v: 'approved', l: 'تأییدشده' },
    { v: 'rejected', l: 'ردشده' }
  ];

  async function act<T>(m: AdminMember, fn: (t: string, su: string) => Promise<T>, ok: string) {
    busyId = m.id;
    try {
      const r = await stepped(fn);
      if (r !== undefined) {
        toasts.success(ok);
        await load();
        onchanged?.();
      }
    } catch (e) {
      toasts.error(describeError(e));
    } finally {
      busyId = null;
    }
  }
  const decide = (m: AdminMember, action: 'approve' | 'reject') =>
    act(m, (t, su) => api.system.decideMember(t, sessionId, m.id, action, su), action === 'approve' ? `عضویت «${m.name}» تأیید شد.` : `عضویت «${m.name}» رد شد.`);

  // ───────── حذف ─────────
  let removeFor = $state<AdminMember | null>(null);
  let removeOpen = $state(false);
  async function remove() {
    const m = removeFor;
    if (!m) return;
    await act(m, (t, su) => api.system.removeMember(t, sessionId, m.id, su).then(() => true), `«${m.name}» از جلسه حذف شد.`);
  }
</script>

<div class="pill-row" role="group" aria-label="فیلتر وضعیت عضویت">
  {#each filters as f (f.v)}
    <button type="button" class="chipbtn" class:active={filter === f.v} aria-pressed={filter === f.v} onclick={() => ((filter = f.v), (pageNo = 1))}>{f.l}</button>
  {/each}
</div>

{#if members.status === 'ready' && members.data}
  {#if members.data.items.length === 0}
    <EmptyState icon="users" compact title="عضوی پیدا نشد" message={filter ? 'فیلتر را تغییر دهید.' : 'هنوز کسی عضو یا متقاضی عضویت نیست.'} />
  {:else}
    <p class="muted fa-small" aria-live="polite">{formatNumber(members.data.total)} مورد</p>
    <ul class="list" class:stale={members.fetching}>
      {#each members.data.items as m (m.id)}
        <li class="row">
          <div class="who">
            <strong>{m.name || 'کاربر حذف‌شده'}</strong>
            <span class="muted fa-small" dir="ltr">{m.phone ? formatPhone(m.phone) : '—'}</span>
          </div>
          <div class="chips">
            <StatusChip tone={tone[m.status]}>{MEMBERSHIP[m.status]}</StatusChip>
          </div>
          <div class="muted fa-small dates">
            درخواست: {formatDateTime(m.requestedAt)}{#if m.decidedAt}<br />تصمیم: {formatDateTime(m.decidedAt)}{/if}
          </div>
          {#if canManage}
            <div class="acts">
              {#if m.status === 'pending'}
                <Button size="sm" loading={busyId === m.id} disabled={busyId !== null} onclick={() => decide(m, 'approve')}>تأیید</Button>
                <Button size="sm" variant="secondary" disabled={busyId !== null} onclick={() => decide(m, 'reject')}>رد</Button>
              {/if}
              <Button size="sm" variant="text" disabled={busyId !== null} onclick={() => ((removeFor = m), (removeOpen = true))}><Icon name="trash" size={18} />حذف</Button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <Pager page={members.data.page} pageSize={members.data.pageSize} total={members.data.total} onpage={(p) => (pageNo = p)} />
  {/if}
{:else if members.status === 'error'}
  <EmptyState icon="alert" tone="error" compact title="اعضا بارگذاری نشد" message={members.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="list" aria-hidden="true">{#each [0, 1, 2] as i (i)}<Skeleton h="84px" radius="var(--radius-md)" />{/each}</div>
{/if}

<ConfirmDialog
  bind:open={removeOpen}
  title="حذف عضو از جلسه"
  message={`«${removeFor?.name ?? ''}» از این جلسه حذف می‌شود. حضور و ارزیابی‌های قبلی او می‌ماند.`}
  confirmLabel="حذف عضو"
  destructive
  onconfirm={remove}
/>

<style>
  .pill-row {
    margin-bottom: var(--space-md);
  }
  .list {
    display: grid;
    gap: var(--space-sm);
  }
  .list.stale {
    opacity: 0.6;
  }
  .row {
    display: grid;
    gap: var(--space-xs) var(--space-md);
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  .who {
    display: grid;
  }
  .chips,
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  @media (min-width: 900px) {
    .row {
      grid-template-columns: 1.2fr 1.4fr 1.2fr auto;
      align-items: center;
    }
  }
</style>
