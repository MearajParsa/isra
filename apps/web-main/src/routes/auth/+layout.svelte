<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { auth } from '$lib/auth/auth.svelte';
  import { authFlow } from '$lib/auth/flow.svelte';
  import { safeNext } from '$lib/utils/nav';

  let { children } = $props();

  const isOnboarding = $derived(page.url.pathname === '/auth/onboarding');
  const profileComplete = $derived(Boolean(auth.me?.profile.firstName && auth.me?.profile.lastName));

  $effect(() => {
    if (auth.status !== 'member') {
      if (isOnboarding && auth.status === 'guest') void goto('/auth/phone', { replaceState: true });
      return;
    }
    // وسط جریان OTP، خود صفحهٔ OTP مقصد را تعیین می‌کند
    if (authFlow.phone) return;
    // عضو واردشده: صفحات ورود معنا ندارد
    if (!isOnboarding) {
      const target = profileComplete ? safeNext(page.url.searchParams.get('next')) : `/auth/onboarding${page.url.search}`;
      void goto(target, { replaceState: true });
    } else if (profileComplete) {
      void goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    }
  });
</script>

<div class="auth container">
  <div class="card">
    {@render children()}
  </div>
</div>

<style>
  .auth {
    display: grid;
    place-items: start center;
    padding-block: var(--space-xl) var(--space-3xl);
  }
  .card {
    width: min(100%, 28rem);
    display: grid;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
    box-shadow: var(--elev-1);
  }
  @media (min-width: 640px) {
    .card {
      padding: var(--space-xl);
    }
  }
</style>
