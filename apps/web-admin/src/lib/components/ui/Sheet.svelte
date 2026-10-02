<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    open?: boolean;
    title: string;
    onclose?: () => void;
    /** بستن با کلیک بیرون/ESC مجاز است؟ (در حال انجام کار false) */
    dismissible?: boolean;
    children: Snippet;
    footer?: Snippet;
  }

  let { open = $bindable(false), title, onclose, dismissible = true, children, footer }: Props = $props();

  let dlg: HTMLDialogElement | undefined = $state();
  const uid = $props.id();

  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  });

  function requestClose() {
    if (!dismissible) return;
    open = false;
    onclose?.();
  }
  function handleCancel(e: Event) {
    e.preventDefault();
    requestClose();
  }
  function handleClick(e: MouseEvent) {
    if (e.target === dlg) requestClose();
  }
  function handleNativeClose() {
    if (open) {
      open = false;
      onclose?.();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dlg}
  aria-labelledby={`sh-${uid}`}
  oncancel={handleCancel}
  onclick={handleClick}
  onclose={handleNativeClose}
>
  <div class="panel">
    <div class="grab" aria-hidden="true"></div>
    <header>
      <h2 id={`sh-${uid}`}>{title}</h2>
      {#if dismissible}
        <button type="button" class="close" onclick={requestClose} aria-label="بستن">
          <Icon name="x" size={22} />
        </button>
      {/if}
    </header>
    <div class="body">{@render children()}</div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </div>
</dialog>

<style>
  dialog {
    width: 100%;
    max-width: none;
    margin: auto 0 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-on-surface);
    overflow: visible;
  }
  dialog::backdrop {
    background: var(--color-scrim);
    animation: fade 180ms var(--ease);
  }
  dialog[open] .panel {
    animation: up 240ms var(--ease);
  }
  .panel {
    background: var(--color-surface);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding: var(--space-sm) var(--space-lg) calc(var(--space-lg) + env(safe-area-inset-bottom));
    box-shadow: var(--elev-2);
    max-height: 90dvh;
    overflow: auto;
  }
  .grab {
    width: 40px;
    height: 4px;
    margin: 4px auto var(--space-md);
    border-radius: var(--radius-pill);
    background: var(--color-outline);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }
  h2 {
    font-size: var(--fs-lg);
  }
  .close {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
    margin-inline-end: -8px;
  }
  .close:hover {
    background: var(--color-secondary);
  }
  .body {
    display: grid;
    gap: var(--space-md);
  }
  footer {
    display: grid;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
  }

  @media (min-width: 640px) {
    dialog {
      width: min(30rem, calc(100% - 2 * var(--space-md)));
      margin: auto;
    }
    .panel {
      border-radius: var(--radius-lg);
      padding: var(--space-lg);
    }
    .grab {
      display: none;
    }
    dialog[open] .panel {
      animation: pop 200ms var(--ease);
    }
    footer {
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes up {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      transform: scale(0.97);
      opacity: 0;
    }
  }
</style>
