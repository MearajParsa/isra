<script lang="ts">
  import type { Snippet } from 'svelte';
  import Spinner from './Spinner.svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'text' | 'danger' | 'warm' | 'light';
    size?: 'md' | 'sm';
    href?: string;
    type?: 'button' | 'submit';
    loading?: boolean;
    disabled?: boolean;
    full?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    href,
    type = 'button',
    loading = false,
    disabled = false,
    full = false,
    onclick,
    children
  }: Props = $props();
</script>

{#if href && !disabled}
  <a class="btn {variant} {size}" class:full {href} {onclick}>
    {@render children()}
  </a>
{:else}
  <button
    class="btn {variant} {size}"
    class:full
    {type}
    disabled={disabled || loading}
    aria-busy={loading}
    {onclick}
  >
    {#if loading}<Spinner size={18} />{/if}
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    min-height: var(--control-h);
    padding: 0 var(--space-lg);
    border: 1.5px solid transparent;
    border-radius: var(--radius-md);
    font-weight: 700;
    font-size: var(--fs-md);
    line-height: 1.2;
    text-decoration: none;
    white-space: nowrap;
    transition:
      background-color var(--dur) var(--ease),
      transform var(--dur) var(--ease),
      box-shadow var(--dur) var(--ease);
    -webkit-tap-highlight-color: transparent;
  }
  .btn.sm {
    min-height: 40px;
    padding: 0 var(--space-md);
    font-size: var(--fs-sm);
  }
  .btn.full {
    width: 100%;
  }
  .btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
  .primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .primary:active:not(:disabled) {
    background: var(--color-primary-pressed);
  }

  .warm {
    background: var(--color-accent-warm);
    color: var(--color-primary);
  }
  .warm:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-accent-warm) 88%, white);
  }

  .secondary {
    background: transparent;
    color: var(--color-primary);
    border-color: var(--color-primary);
  }
  .secondary:hover:not(:disabled) {
    background: var(--color-primary-tint);
  }

  .light {
    background: transparent;
    color: var(--color-on-primary);
    border-color: color-mix(in srgb, var(--color-on-primary) 55%, transparent);
  }
  .light:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-on-primary) 12%, transparent);
  }

  .text {
    background: transparent;
    color: var(--color-accent);
    padding-inline: var(--space-sm);
    min-height: 40px;
  }
  .text:hover:not(:disabled) {
    background: var(--color-accent-tint);
  }

  .danger {
    background: var(--color-error);
    color: var(--color-on-error);
  }
  .danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-error) 88%, black);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
