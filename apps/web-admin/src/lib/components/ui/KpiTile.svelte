<script lang="ts">
  import { formatNumber } from '$lib/utils/format';

  interface Props {
    label: string;
    /** null = داده در دسترس نیست (degraded) */
    value: number | string | null;
    hint?: string;
    unit?: string;
  }
  let { label, value, hint, unit }: Props = $props();
  const text = $derived(value === null ? '—' : typeof value === 'number' ? formatNumber(value) : value);
</script>

<div class="tile" class:na={value === null}>
  <span class="lbl">{label}</span>
  <span class="val" aria-label={value === null ? `${label}: در دسترس نیست` : undefined}>{text}{#if unit && value !== null}<span class="unit"> {unit}</span>{/if}</span>
  {#if value === null}<span class="hint">در دسترس نیست</span>{:else if hint}<span class="hint">{hint}</span>{/if}
</div>

<style>
  .tile {
    display: grid;
    gap: 2px;
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    min-width: 0;
  }
  .lbl {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .val {
    font-size: var(--fs-xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.5;
  }
  .unit {
    font-size: var(--fs-sm);
    font-weight: 400;
    color: var(--color-muted);
  }
  .hint {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .na {
    background: var(--color-neutral);
    border-style: dashed;
  }
  .na .val {
    color: var(--color-gray);
  }
</style>
