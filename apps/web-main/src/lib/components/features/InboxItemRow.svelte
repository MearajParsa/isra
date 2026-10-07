<script lang="ts">
  import type { InboxItem, InboxKind } from '$lib/api/types';
  import { formatRelative } from '$lib/utils/format';
  import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';

  interface Props {
    item: InboxItem;
    onopen?: (item: InboxItem) => void;
    expanded?: boolean;
  }
  let { item, onopen, expanded = false }: Props = $props();

  const icons: Record<InboxKind, IconName> = {
    membership: 'users',
    turn: 'mic',
    evaluation: 'check',
    system: 'info',
    announcement: 'bell',
    session: 'calendar'
  };
  const kindLabel: Record<InboxKind, string> = {
    membership: 'عضویت',
    turn: 'نوبت',
    evaluation: 'ارزیابی',
    system: 'سیستم',
    announcement: 'اطلاعیه',
    session: 'جلسه'
  };
  // نوع ناشناخته (نسخهٔ آیندهٔ سرور) مثل system نمایش داده می‌شود
  const kind = $derived<InboxKind>(item.kind in icons ? item.kind : 'system');
  const unread = $derived(!item.readAt);
</script>

<li>
  <button type="button" class="row" class:unread aria-expanded={expanded} onclick={() => onopen?.(item)}>
    <span class="ico {kind}"><Icon name={icons[kind]} size={22} /></span>
    <span class="txt">
      <span class="head">
        <span class="title">{item.title}</span>
        <span class="time muted">{formatRelative(item.createdAt)}</span>
      </span>
      <span class="body" class:open={expanded}>{item.body}</span>
      <span class="kind muted">{kindLabel[kind]}</span>
    </span>
    {#if unread}<span class="dot" aria-label="خوانده‌نشده"></span>{/if}
  </button>
</li>

<style>
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-md);
    text-align: start;
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    transition: background-color var(--dur) var(--ease);
  }
  .row:hover {
    background: var(--color-primary-tint);
  }
  .row.unread {
    background: var(--color-warm-tint);
    border-color: color-mix(in srgb, var(--color-accent-warm) 70%, var(--color-outline));
  }
  .ico {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .ico.turn {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .ico.evaluation {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
  .txt {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    align-items: baseline;
  }
  .title {
    font-weight: 700;
  }
  .unread .title {
    font-weight: 700;
  }
  .time {
    flex: none;
    font-size: var(--fs-xs);
  }
  .body {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .body.open {
    -webkit-line-clamp: unset;
    line-clamp: unset;
    display: block;
  }
  .kind {
    font-size: var(--fs-xs);
  }
  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    margin-top: 8px;
    border-radius: 50%;
    background: var(--color-accent);
  }
</style>
