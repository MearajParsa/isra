<script lang="ts">
  import type { Snippet } from 'svelte';
  import PageHeader from './PageHeader.svelte';

  interface Props {
    title: string;
    subtitle?: string;
    updated: string;
    children: Snippet;
  }
  let { title, subtitle, updated, children }: Props = $props();
</script>

<svelte:head>
  <title>{title} — اسراء</title>
  <meta name="description" content={subtitle ?? title} />
</svelte:head>

<div class="container doc">
  <PageHeader {title} {subtitle} backHref="/" />
  <p class="muted small">آخرین به‌روزرسانی: {updated}</p>
  <article class="prose">{@render children()}</article>
</div>

<style>
  .doc {
    max-width: 46rem;
    padding-block: var(--space-xl);
  }
  .prose :global(h2) {
    margin-top: var(--space-xl);
    font-size: var(--text-lg);
  }
  .prose :global(p),
  .prose :global(li) {
    line-height: 2;
  }
  .prose :global(ul) {
    padding-inline-start: 1.25rem;
  }
  .small {
    font-size: var(--text-sm);
  }
</style>
