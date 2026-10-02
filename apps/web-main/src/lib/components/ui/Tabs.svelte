<script lang="ts">
  export interface TabItem {
    id: string;
    label: string;
    count?: number;
  }
  interface Props {
    tabs: TabItem[];
    active: string;
    label: string;
    onchange: (id: string) => void;
  }
  let { tabs, active, label, onchange }: Props = $props();

  function onKey(e: KeyboardEvent, i: number) {
    // در RTL «راست» = قبلی
    const dir = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    onchange(next.id);
    queueMicrotask(() => document.getElementById(`tab-${next.id}`)?.focus());
  }
</script>

<div class="tabs" role="tablist" aria-label={label}>
  {#each tabs as t, i (t.id)}
    <button
      id={`tab-${t.id}`}
      type="button"
      role="tab"
      class="tab"
      class:active={active === t.id}
      aria-selected={active === t.id}
      aria-controls={`panel-${t.id}`}
      tabindex={active === t.id ? 0 : -1}
      onclick={() => onchange(t.id)}
      onkeydown={(e) => onKey(e, i)}
    >
      {t.label}
      {#if t.count !== undefined && t.count > 0}<span class="cnt">{t.count}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: var(--space-xs);
    padding: 4px;
    margin-bottom: var(--space-lg);
    background: var(--color-neutral);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }
  .tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 var(--space-md);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted);
    font-weight: 700;
    font-size: var(--fs-sm);
    white-space: nowrap;
    transition: background-color var(--dur) var(--ease);
  }
  .tab:hover {
    color: var(--color-primary);
  }
  .tab.active {
    background: var(--color-card);
    color: var(--color-primary);
    box-shadow: var(--elev-1);
  }
  .cnt {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-warm);
    color: var(--color-primary);
    font-size: 0.7rem;
  }
</style>
