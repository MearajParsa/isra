<script lang="ts">
  import { formatNumber } from '$lib/utils/format';
  let { count, dotOnly = false }: { count: number; dotOnly?: boolean } = $props();
  const label = $derived(count > 99 ? `${formatNumber(99)}+` : formatNumber(count));
</script>

{#if count > 0}
  {#if dotOnly}
    <span class="dot" aria-hidden="true"></span>
  {:else}
    <span class="badge" aria-label={`${formatNumber(count)} مورد خوانده‌نشده`}>{label}</span>
  {/if}
{/if}

<style>
  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-warm);
    color: var(--color-primary);
    font-size: 0.7rem;
    font-weight: 900;
    line-height: 1;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-accent-warm);
    box-shadow: 0 0 0 2px var(--color-surface);
  }
</style>
