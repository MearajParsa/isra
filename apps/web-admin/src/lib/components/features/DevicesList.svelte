<script lang="ts">
  import type { UserDeviceSession } from '$lib/api';
  import { clientLabel } from '$lib/utils/labels';
  import { formatRelative, formatDateTime } from '$lib/utils/format';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    sessions: UserDeviceSession[];
    /** شناسهٔ نشستی که در حال revoke است */
    busyId?: string | null;
    /** نمایش نشان «همین دستگاه» */
    showCurrent?: boolean;
    canRevoke?: boolean;
    onrevoke: (s: UserDeviceSession) => void;
  }
  let { sessions, busyId = null, showCurrent = false, canRevoke = true, onrevoke }: Props = $props();

  const active = $derived(sessions.filter((s) => !s.revokedAt));
  const ended = $derived(sessions.filter((s) => s.revokedAt));
  const groups = $derived.by(() => {
    const m = new Map<string, UserDeviceSession[]>();
    for (const s of active) {
      const k = clientLabel(s.client);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  });
</script>

{#if active.length === 0}
  <p class="muted fa-small">نشست فعالی وجود ندارد.</p>
{:else}
  {#each groups as [name, list] (name)}
    <section class="grp" aria-label={name}>
      <h4>{name} <span class="muted fa-small">({list.length.toLocaleString('fa-IR')})</span></h4>
      <ul>
        {#each list as s (s.id)}
          <li class="row">
            <span class="ico"><Icon name={s.platform === 'android' ? 'phone' : 'monitor'} size={22} /></span>
            <span class="info">
              <strong>{s.deviceLabel}{#if showCurrent && s.current} <StatusChip tone="success">همین دستگاه</StatusChip>{/if}</strong>
              <span class="muted meta">
                <bdi dir="ltr">{s.ipMasked}</bdi> · آخرین فعالیت {formatRelative(s.lastActiveAt)} · ورود {formatDateTime(s.createdAt)}
              </span>
            </span>
            {#if canRevoke && !(showCurrent && s.current)}
              <Button variant="secondary" size="sm" loading={busyId === s.id} disabled={busyId !== null} onclick={() => onrevoke(s)}>خروج</Button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}
{/if}
{#if ended.length}
  <details class="ended">
    <summary>نشست‌های پایان‌یافته ({ended.length.toLocaleString('fa-IR')})</summary>
    <ul>
      {#each ended as s (s.id)}
        <li class="row off">
          <span class="ico"><Icon name={s.platform === 'android' ? 'phone' : 'monitor'} size={20} /></span>
          <span class="info">
            <span>{s.deviceLabel} · {clientLabel(s.client)}</span>
            <span class="muted meta">پایان: {formatDateTime(s.revokedAt!)}</span>
          </span>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .grp {
    display: grid;
    gap: var(--space-sm);
  }
  .grp + .grp {
    margin-top: var(--space-md);
  }
  h4 {
    margin: 0;
    font-size: var(--fs-md);
  }
  ul {
    display: grid;
    gap: var(--space-sm);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    background: var(--color-card);
  }
  .row.off {
    background: var(--color-neutral);
    color: var(--color-muted);
  }
  .ico {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .info {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .meta {
    font-size: var(--fs-xs);
  }
  .ended {
    margin-top: var(--space-md);
    font-size: var(--fs-sm);
  }
  .ended summary {
    cursor: pointer;
    font-weight: 700;
    margin-bottom: var(--space-sm);
  }
  @media (max-width: 520px) {
    .row {
      flex-wrap: wrap;
    }
  }
</style>
