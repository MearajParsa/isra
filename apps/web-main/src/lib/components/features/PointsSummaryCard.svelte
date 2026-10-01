<script lang="ts">
  import type { PointsSummary } from '$lib/api/types';
  import { formatNumber } from '$lib/utils/format';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    points: PointsSummary;
    href?: string;
  }
  let { points, href }: Props = $props();

  const next = $derived(points.badges.find((b) => !b.awardedAt));
  const prevThreshold = $derived(
    [...points.badges].reverse().find((b) => b.awardedAt)?.threshold ?? 0
  );
  const progress = $derived(
    next ? Math.min(100, Math.round(((points.total - prevThreshold) / (next.threshold - prevThreshold)) * 100)) : 100
  );
</script>

<svelte:element this={href ? 'a' : 'div'} class="card" {href}>
  <div class="row">
    <span class="medal"><Icon name="award" size={28} /></span>
    <div class="num">
      <span class="muted lbl">امتیاز شما</span>
      <strong>{formatNumber(points.total)}</strong>
    </div>
    {#if href}<Icon name="chevron-left" size={22} class="go" />{/if}
  </div>
  <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress} aria-label="پیشرفت تا نشان بعدی">
    <span style:width="{progress}%"></span>
  </div>
  <p class="muted hint">
    {#if next}
      {formatNumber(Math.max(0, next.threshold - points.total))} امتیاز تا نشان «{formatNumber(next.threshold)} امتیاز»
    {:else}
      همهٔ نشان‌ها را کسب کرده‌اید.
    {/if}
  </p>
</svelte:element>

<style>
  .card {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-radius: var(--radius-lg);
    text-decoration: none;
    box-shadow: var(--elev-1);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .medal {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--color-accent-warm);
    color: var(--color-primary);
  }
  .num {
    display: grid;
    flex: 1;
    line-height: 1.3;
  }
  .num strong {
    font-size: var(--fs-xxl);
    font-weight: 900;
  }
  .lbl,
  .hint {
    color: color-mix(in srgb, var(--color-on-primary) 75%, transparent);
    font-size: var(--fs-sm);
  }
  .bar {
    height: 8px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--color-on-primary) 18%, transparent);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--color-accent-warm);
    transition: width 500ms var(--ease);
  }
  :global(.go) {
    color: var(--color-accent-warm);
  }
</style>
