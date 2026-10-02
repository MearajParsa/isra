<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { auth } from '$lib/auth/auth.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';

  let { children } = $props();

  const complete = $derived(Boolean(auth.me?.profile.firstName && auth.me?.profile.lastName));

  $effect(() => {
    if (auth.status === 'guest') {
      void goto(`/auth/phone?next=${encodeURIComponent(page.url.pathname)}`, { replaceState: true });
    } else if (auth.status === 'member' && !complete) {
      void goto(`/auth/onboarding?next=${encodeURIComponent(page.url.pathname)}`, { replaceState: true });
    }
  });
</script>

<div class="container wrap">
  {#if auth.status === 'member' && complete}
    {@render children()}
  {:else}
    <div class="sk" aria-hidden="true">
      <Skeleton w="40%" h="32px" />
      <Skeleton h="72px" radius="var(--radius-md)" />
      <Skeleton h="72px" radius="var(--radius-md)" />
      <Skeleton h="72px" radius="var(--radius-md)" />
    </div>
    <span class="sr-only" role="status">در حال بارگذاری حساب…</span>
  {/if}
</div>

<style>
  .wrap {
    max-width: 44rem;
    padding-top: var(--space-xl);
    padding-bottom: var(--space-2xl);
  }
  .sk {
    display: grid;
    gap: var(--space-md);
  }
</style>
