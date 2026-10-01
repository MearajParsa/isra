<script lang="ts">
  import type { DeviceSession } from '$lib/api/types';
  import { formatRelative } from '$lib/utils/format';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    session: DeviceSession;
    busy?: boolean;
    onrevoke: (s: DeviceSession) => void;
  }
  let { session, busy = false, onrevoke }: Props = $props();
</script>

<li class="row" class:current={session.current}>
  <span class="ico"><Icon name={session.platform === 'android' ? 'phone' : 'monitor'} size={24} /></span>
  <div class="txt">
    <strong>{session.deviceLabel}</strong>
    <span class="muted meta">
      {#if session.current}
        <span class="here">این دستگاه</span> ·
      {/if}
      آخرین فعالیت: {formatRelative(session.lastActiveAt)}
    </span>
  </div>
  <Button variant={session.current ? 'text' : 'secondary'} size="sm" loading={busy} onclick={() => onrevoke(session)}>
    {session.current ? 'خروج' : 'خروج از دستگاه'}
  </Button>
</li>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  .current {
    border-color: var(--color-accent);
    background: var(--color-accent-tint);
  }
  .ico {
    display: grid;
    place-items: center;
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .txt {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .meta {
    font-size: var(--fs-sm);
  }
  .here {
    color: var(--color-accent);
    font-weight: 700;
  }
  @media (max-width: 539px) {
    .row {
      flex-wrap: wrap;
    }
    .row :global(.btn) {
      margin-inline-start: auto;
    }
  }
</style>
