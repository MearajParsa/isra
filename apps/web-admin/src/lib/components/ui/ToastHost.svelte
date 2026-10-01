<script lang="ts">
  import { toasts } from '$lib/stores/toast.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="host" aria-live="polite" aria-atomic="false">
  {#each toasts.items as t (t.id)}
    <div class="toast {t.kind}" role={t.kind === 'error' ? 'alert' : 'status'}>
      <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'} size={20} />
      <span>{t.message}</span>
      <button type="button" class="close" onclick={() => toasts.dismiss(t.id)} aria-label="بستن">
        <Icon name="x" size={18} />
      </button>
    </div>
  {/each}
</div>

<style>
  .host {
    position: fixed;
    inset-inline: var(--space-md);
    bottom: calc(var(--bottomnav-h) + var(--space-md) + env(safe-area-inset-bottom));
    z-index: 60;
    display: grid;
    gap: var(--space-sm);
    justify-items: center;
    pointer-events: none;
  }
  @media (min-width: 900px) {
    .host {
      bottom: var(--space-lg);
    }
  }
  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: min(100%, 28rem);
    padding: 10px var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--color-on-primary);
    box-shadow: var(--elev-2);
    pointer-events: auto;
    animation: in 220ms var(--ease);
  }
  .toast span {
    flex: 1;
    font-size: var(--fs-sm);
  }
  .toast.error {
    background: var(--color-error);
  }
  .toast.success {
    background: var(--color-accent);
  }
  .close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    opacity: 0.8;
  }
  .close:hover {
    opacity: 1;
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
