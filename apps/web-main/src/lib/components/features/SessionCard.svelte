<script lang="ts">
  import type { PublicSession } from '$lib/api/types';
  import { formatDateTime, scheduleLabel } from '$lib/utils/format';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  let { session }: { session: PublicSession } = $props();
  const when = $derived(
    session.status === 'started'
      ? 'اکنون در حال برگزاری است'
      : session.nextStartsAt
        ? `شروع بعدی: ${formatDateTime(session.nextStartsAt)}`
        : session.status === 'ended'
          ? 'این جلسه پایان یافته است'
          : scheduleLabel(session.schedule)
  );
</script>

<a class="card" href={`/sessions/${session.id}`} class:ended={session.status === 'ended'}>
  <div class="top">
    <StatusChip status={session.status} />
  </div>
  <h3>{session.title}</h3>
  <p class="desc">{session.description}</p>
  <ul class="meta">
    <li><Icon name="clock" size={16} />{when}</li>
    <li><Icon name="pin" size={16} />{session.location.label}</li>
  </ul>
  <span class="more">مشاهدهٔ جزئیات<Icon name="chevron-left" size={18} /></span>
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    height: 100%;
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
    color: inherit;
    text-decoration: none;
    box-shadow: var(--elev-1);
    transition:
      transform var(--dur) var(--ease),
      box-shadow var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: var(--elev-2);
    border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-outline));
  }
  .ended {
    background: color-mix(in srgb, var(--color-card) 60%, var(--color-surface));
  }
  .ended h3 {
    color: var(--color-muted);
  }
  h3 {
    font-size: var(--fs-lg);
  }
  .desc {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .meta {
    display: grid;
    gap: 6px;
    margin-top: auto;
    padding-top: var(--space-sm);
    font-size: var(--fs-sm);
  }
  .meta li {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
  }
  .meta :global(svg) {
    margin-top: 6px;
    flex: none;
    color: var(--color-accent);
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-accent);
    font-weight: 700;
    font-size: var(--fs-sm);
  }
</style>
