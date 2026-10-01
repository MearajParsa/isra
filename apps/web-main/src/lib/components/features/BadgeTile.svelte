<script lang="ts">
  import type { PointsSummary } from '$lib/api/types';
  import { formatNumber, formatShortDate } from '$lib/utils/format';
  import Icon from '$lib/components/ui/Icon.svelte';

  let { badge }: { badge: PointsSummary['badges'][number] } = $props();
  const earned = $derived(badge.awardedAt !== null);
</script>

<div class="tile" class:earned>
  <span class="ico">
    <Icon name={earned ? 'award' : 'lock'} size={30} />
  </span>
  <strong>{formatNumber(badge.threshold)} امتیاز</strong>
  <span class="state">
    {#if badge.awardedAt}کسب‌شده · {formatShortDate(badge.awardedAt)}{:else}قفل‌شده{/if}
  </span>
</div>

<style>
  .tile {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: var(--space-lg) var(--space-md);
    background: var(--color-card);
    border: 1.5px dashed var(--color-outline);
    border-radius: var(--radius-lg);
    text-align: center;
    color: var(--color-muted);
  }
  .tile.earned {
    border: 1.5px solid var(--color-accent-warm);
    background: var(--color-warm-tint);
    color: var(--color-primary);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    margin-bottom: var(--space-sm);
    border-radius: 50%;
    background: var(--color-secondary);
  }
  .earned .ico {
    background: var(--color-accent-warm);
  }
  .state {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
</style>
