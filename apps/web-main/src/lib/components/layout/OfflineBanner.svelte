<script lang="ts">
  import { net } from '$lib/stores/net.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
</script>

{#if !net.online}
  <div class="offline" role="status">
    <Icon name="wifi-off" size={18} />
    <span>اتصال اینترنت قطع است. برخی بخش‌ها کار نمی‌کنند.</span>
  </div>
{/if}

<style>
  .offline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: 8px var(--space-md);
    background: var(--color-accent-warm);
    color: var(--color-primary);
    font-size: var(--fs-sm);
    font-weight: 700;
  }
</style>
