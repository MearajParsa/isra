<script lang="ts">
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
</script>

<div class="card" aria-hidden="true">
  <Skeleton w="72px" h="22px" radius="var(--radius-pill)" />
  <Skeleton w="70%" h="24px" />
  <Skeleton h="14px" />
  <Skeleton w="85%" h="14px" />
  <div class="gap"></div>
  <Skeleton w="60%" h="14px" />
  <Skeleton w="45%" h="14px" />
</div>

<style>
  .card {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .gap {
    height: var(--space-sm);
  }
</style>
