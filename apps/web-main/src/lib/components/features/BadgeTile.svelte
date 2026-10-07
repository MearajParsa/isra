<script lang="ts">
  import type { PointsSummary } from '$lib/api/types';
  import { formatNumber, formatShortDate } from '$lib/utils/format';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { LOW_URL } from '$lib/api/config';

  let { badge }: { badge: PointsSummary['badges'][number] } = $props();
  const earned = $derived(badge.awardedAt !== null);
  // L-34: v=hash ⇒ کش immutable مرورگر
  const imageUrl = $derived(badge.image ? `${LOW_URL}/c/v1/public/badges/${encodeURIComponent(badge.id)}/image?v=${badge.image.hash}` : null);
</script>

<div class="tile" class:earned>
  <span class="ico">
    {#if imageUrl}
      <img src={imageUrl} alt="" width="48" height="48" loading="lazy" decoding="async" class:dim={!earned} />
    {:else}
      <Icon name={earned ? 'award' : 'lock'} size={30} />
    {/if}
  </span>
  <strong>{badge.title}</strong>
  <span class="threshold">{formatNumber(badge.threshold)} امتیاز</span>
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
    border: 1.5px dashed var(--color-gray);
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
  .ico img {
    width: 48px;
    height: 48px;
    object-fit: contain;
  }
  .ico img.dim {
    filter: grayscale(1);
    opacity: 0.55;
  }
  .threshold {
    font-size: var(--fs-sm);
  }
  .state {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
</style>
