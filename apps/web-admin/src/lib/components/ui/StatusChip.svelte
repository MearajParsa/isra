<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
    children: Snippet;
  }
  let { tone = 'neutral', children }: Props = $props();
</script>

<span class="chip {tone}">{@render children()}</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 1px 10px;
    border-radius: var(--radius-pill);
    font-size: var(--fs-xs);
    font-weight: 700;
    white-space: nowrap;
    line-height: 1.7;
  }
  .neutral {
    background: var(--color-neutral);
    color: var(--color-muted);
  }
  .success {
    background: var(--color-accent-tint);
    color: var(--color-accent);
  }
  .warning {
    background: var(--color-warm-tint);
    color: var(--color-primary);
  }
  .danger {
    background: var(--color-error-tint);
    color: var(--color-error);
  }
  .info {
    background: var(--color-primary-tint);
    color: var(--color-primary);
  }
</style>
