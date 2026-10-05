<script lang="ts">
  import { formatNumber } from '$lib/utils/format';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    page: number;
    pageSize: number;
    total: number;
    onpage: (p: number) => void;
  }
  let { page, pageSize, total, onpage }: Props = $props();
  const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
</script>

{#if pages > 1}
  <nav class="pager" aria-label="صفحه‌بندی">
    <Button variant="secondary" size="sm" disabled={page <= 1} onclick={() => onpage(page - 1)}><Icon name="chevron-right" size={18} />قبلی</Button>
    <span class="muted" aria-live="polite">صفحهٔ {formatNumber(page)} از {formatNumber(pages)}</span>
    <Button variant="secondary" size="sm" disabled={page >= pages} onclick={() => onpage(page + 1)}>بعدی<Icon name="chevron-left" size={18} /></Button>
  </nav>
{/if}

<style>
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    margin-top: var(--space-xl);
  }
</style>
