<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    tone?: 'info' | 'warning' | 'error' | 'success';
    icon?: IconName;
    children: Snippet;
    action?: Snippet;
    role?: 'status' | 'alert';
  }
  let { tone = 'info', icon, children, action, role = 'status' }: Props = $props();
  const defaultIcon: Record<string, IconName> = {
    info: 'info',
    warning: 'alert',
    error: 'alert',
    success: 'check'
  };
</script>

<div class="notice {tone}" {role}>
  <Icon name={icon ?? defaultIcon[tone]} size={20} />
  <div class="text">{@render children()}</div>
  {#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
  .notice {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    border: 1px solid transparent;
  }
  .text {
    flex: 1;
    line-height: 1.8;
    padding-top: 1px;
  }
  .info {
    background: var(--color-primary-tint);
    border-color: color-mix(in srgb, var(--color-primary) 14%, transparent);
  }
  .warning {
    background: var(--color-warm-tint);
    border-color: color-mix(in srgb, var(--color-accent-warm) 70%, transparent);
  }
  .error {
    background: var(--color-error-tint);
    border-color: color-mix(in srgb, var(--color-error) 25%, transparent);
    color: color-mix(in srgb, var(--color-error) 85%, black);
  }
  .success {
    background: var(--color-accent-tint);
    border-color: color-mix(in srgb, var(--color-accent) 25%, transparent);
    color: var(--color-accent);
  }
  .action {
    flex: none;
  }
</style>
