<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    subtitle?: string;
    backHref?: string;
    actions?: Snippet;
  }
  let { title, subtitle, backHref, actions }: Props = $props();
</script>

<div class="head">
  <div class="titles">
    {#if backHref}
      <a class="back" href={backHref} aria-label="بازگشت"><Icon name="arrow-left" size={22} /></a>
    {/if}
    <div>
      <h1>{title}</h1>
      {#if subtitle}<p class="muted sub">{subtitle}</p>{/if}
    </div>
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }
  .titles {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
  }
  h1 {
    font-size: var(--fs-xl);
  }
  .sub {
    font-size: var(--fs-sm);
  }
  .back {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin-inline-start: -8px;
    border-radius: var(--radius-pill);
    color: var(--color-primary);
    text-decoration: none;
  }
  .back:hover {
    background: var(--color-secondary);
  }
  .actions {
    flex: none;
  }
  @media (min-width: 768px) {
    h1 {
      font-size: var(--fs-xxl);
    }
  }
</style>
