<script lang="ts">
  import type { MySessionItem } from '$lib/api/mid-types';
  import { formatDateTime, scheduleLabel, formatNumber } from '$lib/utils/format';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import RoleChips from '$lib/components/ui/RoleChips.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    item: MySessionItem;
    /** نمای «مدیریت»: دکمهٔ پنل جلسه */
    manage?: boolean;
  }
  let { item, manage = false }: Props = $props();
  const s = $derived(item.session);
  const approved = $derived(item.membership === 'approved');
  const isStaff = $derived(item.roles.some((r) => r !== 'quran_student'));
  const when = $derived(
    s.status === 'started'
      ? 'اکنون در حال برگزاری است'
      : s.nextStartsAt
        ? `شروع بعدی: ${formatDateTime(s.nextStartsAt)}`
        : scheduleLabel(s.schedule)
  );
</script>

<article class="card" class:live={s.status === 'started' && approved}>
  <div class="top">
    <StatusChip status={s.status} />
    <RoleChips roles={item.roles} membership={item.membership} />
    {#if item.pendingCount}
      <span class="pend" title="درخواست‌های عضویت در انتظار">
        {formatNumber(item.pendingCount)} درخواست جدید
      </span>
    {/if}
  </div>
  <h3><a href={manage ? `/manage/${s.id}` : `/sessions/${s.id}`}>{s.title}</a></h3>
  <p class="meta"><Icon name="clock" size={16} />{when}</p>
  <p class="meta"><Icon name="pin" size={16} />{s.location.label}</p>
  <div class="acts">
    {#if approved && (s.status === 'started' || s.status === 'ended')}
      <Button href={`/sessions/${s.id}/live`} size="sm" variant={s.status === 'started' ? 'primary' : 'secondary'}>
        {s.status === 'started' ? 'ورود به اتاق جلسه' : 'نتایج جلسه'}
      </Button>
    {/if}
    {#if manage || isStaff}
      <Button href={`/manage/${s.id}`} size="sm" variant="secondary"><Icon name="shield" size={18} />پنل جلسه</Button>
    {/if}
    <Button href={`/sessions/${s.id}`} size="sm" variant="text">جزئیات</Button>
  </div>
</article>

<style>
  .card {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
    box-shadow: var(--elev-1);
  }
  .live {
    border-color: var(--color-accent);
    box-shadow:
      0 0 0 1px var(--color-accent),
      var(--elev-1);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }
  .pend {
    margin-inline-start: auto;
    padding: 1px 10px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-warm);
    color: var(--color-primary);
    font-size: var(--fs-xs);
    font-weight: 700;
  }
  h3 a {
    color: inherit;
    text-decoration: none;
  }
  h3 a:hover {
    text-decoration: underline;
  }
  .meta {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .meta :global(svg) {
    margin-top: 6px;
    flex: none;
    color: var(--color-accent);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }
</style>
