<script lang="ts">
  import type { SessionSchedule } from '$lib/api/types';
  import { scheduleLabel, scheduleTypeLabel, formatNumber } from '$lib/utils/format';
  import Icon from '$lib/components/ui/Icon.svelte';

  let { schedule }: { schedule: SessionSchedule } = $props();
  const duration = $derived(
    schedule.type === 'once'
      ? Math.round((new Date(schedule.endsAt).getTime() - new Date(schedule.startsAt).getTime()) / 60000)
      : schedule.durationMin
  );
</script>

<div class="info">
  <Icon name="clock" size={18} />
  <span class="label">{scheduleLabel(schedule)}</span>
  <span class="meta">{scheduleTypeLabel[schedule.type]} · {formatNumber(duration)} دقیقه</span>
</div>

<style>
  .info {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: var(--space-sm);
    align-items: start;
    font-size: var(--fs-sm);
  }
  .info :global(svg) {
    margin-top: 5px;
    color: var(--color-accent);
  }
  .label {
    font-weight: 700;
  }
  .meta {
    grid-column: 2;
    color: var(--color-muted);
  }
</style>
