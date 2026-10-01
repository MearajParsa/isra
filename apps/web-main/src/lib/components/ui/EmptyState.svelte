<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    icon?: IconName;
    title: string;
    message?: string;
    tone?: 'neutral' | 'error';
    action?: Snippet;
    compact?: boolean;
  }
  let { icon = 'info', title, message, tone = 'neutral', action, compact = false }: Props = $props();
</script>

<div class="empty" class:compact class:error={tone === 'error'}>
  <div class="ico"><Icon name={icon} size={compact ? 28 : 36} /></div>
  <h3>{title}</h3>
  {#if message}<p class="muted">{message}</p>{/if}
  {#if action}<div class="act">{@render action()}</div>{/if}
</div>

<style>
  .empty {
    display: grid;
    justify-items: center;
    gap: var(--space-sm);
    padding: var(--space-2xl) var(--space-md);
    text-align: center;
  }
  .empty.compact {
    padding: var(--space-xl) var(--space-md);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    margin-bottom: var(--space-sm);
    border-radius: var(--radius-pill);
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .compact .ico {
    width: 56px;
    height: 56px;
  }
  .error .ico {
    background: var(--color-error-tint);
    color: var(--color-error);
  }
  p {
    max-width: 30rem;
  }
  .act {
    margin-top: var(--space-md);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    justify-content: center;
  }
</style>
