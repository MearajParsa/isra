<script lang="ts" module>
  export interface MenuItem {
    id: string;
    label: string;
    icon?: IconName;
    danger?: boolean;
    disabled?: boolean;
    /** دلیل غیرفعال‌بودن (زیر عنوان نمایش داده می‌شود) */
    hint?: string;
    /** خط جداکننده قبل از آیتم */
    separator?: boolean;
  }
  import type { IconName } from './Icon.svelte';
</script>

<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    items: MenuItem[];
    label?: string;
    triggerLabel?: string;
    onselect: (id: string) => void;
  }
  let { items, label = 'منوی عملیات', triggerLabel = 'عملیات', onselect }: Props = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();
  const uid = $props.id();

  const enabled = () => Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  function toggle() {
    open = !open;
    if (open) queueMicrotask(() => enabled()[0]?.focus());
  }
  function close(focusTrigger = true) {
    open = false;
    if (focusTrigger) trigger?.focus();
  }
  function pick(it: MenuItem) {
    if (it.disabled) return;
    close();
    onselect(it.id);
  }
  function key(e: KeyboardEvent) {
    if (!open) return;
    const els = enabled();
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      els.at(-1)?.focus();
    } else if (e.key === 'Tab') close(false);
  }
  function outside(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={outside} />

<div class="menu" bind:this={root} onkeydown={key} role="presentation">
  <button bind:this={trigger} type="button" class="trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={`m-${uid}`} aria-label={label} onclick={toggle}>
    {triggerLabel}<Icon name="chevron-down" size={18} />
  </button>
  {#if open}
    <div class="panel" id={`m-${uid}`} role="menu" aria-label={label}>
      {#each items as it (it.id)}
        {#if it.separator}<hr />{/if}
        <button type="button" role="menuitem" class="item" class:danger={it.danger} aria-disabled={it.disabled ? 'true' : undefined} tabindex="-1" onclick={() => pick(it)}>
          {#if it.icon}<Icon name={it.icon} size={20} />{/if}
          <span class="txt">
            <span>{it.label}</span>
            {#if it.hint}<span class="hint">{it.hint}</span>{/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    display: inline-block;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 var(--space-md);
    border: 1.5px solid var(--color-primary);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-primary);
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .trigger:hover {
    background: var(--color-primary-tint);
  }
  .panel {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + 6px);
    z-index: 40;
    display: grid;
    min-width: 15rem;
    max-width: min(22rem, 90vw);
    padding: 6px;
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    box-shadow: var(--elev-2);
  }
  hr {
    margin: 4px 6px;
    border: 0;
    border-top: 1px solid var(--color-outline);
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    width: 100%;
    min-height: 44px;
    padding: 8px 12px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-primary);
    text-align: start;
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .item:hover:not([aria-disabled='true']),
  .item:focus-visible {
    background: var(--color-primary-tint);
  }
  .item.danger {
    color: var(--color-error);
  }
  .item[aria-disabled='true'] {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .txt {
    display: grid;
    min-width: 0;
  }
  .hint {
    font-weight: 400;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    white-space: normal;
  }
</style>
