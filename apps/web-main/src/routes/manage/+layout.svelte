<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { auth } from '$lib/auth/auth.svelte';
  import { caps } from '$lib/stores/caps.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';

  let { children } = $props();

  $effect(() => {
    if (auth.status === 'guest') void goto(`/auth/phone?next=${encodeURIComponent(page.url.pathname)}`, { replaceState: true });
  });
</script>

<div class="container wrap">
  {#if auth.status === 'member' && caps.loaded}
    {#if caps.canManage}
      {@render children()}
    {:else}
      <EmptyState icon="lock" title="به بخش مدیریت دسترسی ندارید" message="این بخش فقط برای استاد و پشتیبان جلسه‌هاست.">
        {#snippet action()}<Button href="/my-sessions">جلسه‌های من</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="sk" aria-hidden="true">
      <Skeleton w="40%" h="32px" />
      <Skeleton h="140px" radius="var(--radius-lg)" />
      <Skeleton h="140px" radius="var(--radius-lg)" />
    </div>
    <span class="sr-only" role="status">در حال بارگذاری…</span>
  {/if}
</div>

<style>
  .wrap {
    max-width: 56rem;
    padding-top: var(--space-xl);
    padding-bottom: var(--space-2xl);
  }
  .sk {
    display: grid;
    gap: var(--space-md);
  }
</style>
