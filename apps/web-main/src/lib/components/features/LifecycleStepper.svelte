<script lang="ts">
  import type { SessionState } from '$lib/api/mid-types';
  import Icon from '$lib/components/ui/Icon.svelte';

  let { status }: { status: SessionState } = $props();
  const steps: { id: SessionState; label: string }[] = [
    { id: 'draft', label: 'پیش‌نویس' },
    { id: 'scheduled', label: 'منتشرشده' },
    { id: 'started', label: 'در حال برگزاری' },
    { id: 'ended', label: 'پایان‌یافته' }
  ];
  const idx = $derived(steps.findIndex((s) => s.id === status));
</script>

<ol class="steps" aria-label="مراحل جلسه">
  {#each steps as s, i (s.id)}
    <li class:done={i < idx} class:cur={i === idx} aria-current={i === idx ? 'step' : undefined}>
      <span class="dot">{#if i < idx}<Icon name="check" size={14} />{/if}</span>
      <span class="lbl">{s.label}</span>
    </li>
  {/each}
</ol>

<style>
  .steps {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0;
  }
  li {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 6px;
    text-align: center;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  li:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 13px;
    inset-inline-start: calc(50% + 16px);
    width: calc(100% - 32px);
    height: 2px;
    background: var(--color-outline);
  }
  li.done:not(:last-child)::after {
    background: var(--color-accent);
  }
  .dot {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-card);
    border: 2px solid var(--color-outline);
    color: var(--color-on-accent);
  }
  .done .dot {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  .cur .dot {
    border-color: var(--color-primary);
    background: var(--color-accent-warm);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent-warm) 40%, transparent);
  }
  .cur {
    color: var(--color-primary);
    font-weight: 700;
  }
</style>
