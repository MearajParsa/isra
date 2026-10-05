<script lang="ts">
  import { formatNumber, formatPercent } from '$lib/utils/format';

  interface Item {
    label: string;
    value: number;
  }
  interface Props {
    title: string;
    items: Item[];
    color?: string;
  }
  let { title, items, color = 'var(--chart-1)' }: Props = $props();
  const total = $derived(items.reduce((a, i) => a + i.value, 0));
  const max = $derived(Math.max(1, ...items.map((i) => i.value)));
  const uid = $props.id();
</script>

<figure class="bl" aria-labelledby={`bl-${uid}`}>
  <figcaption id={`bl-${uid}`}>{title}</figcaption>
  {#if items.length === 0 || total === 0}
    <p class="muted fa-small">داده‌ای برای نمایش نیست.</p>
  {:else}
    <ul>
      {#each items as it (it.label)}
        <li>
          <span class="lbl">{it.label}</span>
          <span class="track" aria-hidden="true"><span class="bar" style:width="{(it.value / max) * 100}%" style:background={color}></span></span>
          <span class="val">{formatNumber(it.value)} <span class="pct muted">({formatPercent((it.value / total) * 100)})</span></span>
        </li>
      {/each}
    </ul>
  {/if}
</figure>

<style>
  .bl {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  figcaption {
    font-weight: 700;
  }
  ul {
    display: grid;
    gap: 10px;
  }
  li {
    display: grid;
    grid-template-columns: 7.5rem 1fr auto;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--fs-sm);
  }
  .track {
    height: 10px;
    border-radius: 5px;
    background: var(--color-neutral);
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    border-radius: 5px;
  }
  .val {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pct {
    font-size: var(--fs-xs);
  }
  @media (max-width: 480px) {
    li {
      grid-template-columns: 1fr auto;
    }
    .track {
      grid-column: 1 / -1;
      order: 3;
    }
  }
</style>
