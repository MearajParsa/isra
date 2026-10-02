<script lang="ts">
  import '$lib/styles/tokens.css';
  import '$lib/styles/base.css';
  import { onMount } from 'svelte';
  import { page, navigating } from '$app/state';
  import { auth } from '$lib/auth/auth.svelte';
  import { net } from '$lib/stores/net.svelte';
  import { pwa } from '$lib/stores/pwa.svelte';
  import TopBar from '$lib/components/layout/TopBar.svelte';
  import BottomNav from '$lib/components/layout/BottomNav.svelte';
  import OfflineBanner from '$lib/components/layout/OfflineBanner.svelte';
  import ToastHost from '$lib/components/ui/ToastHost.svelte';
  import AuthGateSheet from '$lib/components/features/AuthGateSheet.svelte';
  import StepUpSheet from '$lib/components/features/StepUpSheet.svelte';
  import LogoMark from '$lib/components/ui/LogoMark.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { caps } from '$lib/stores/caps.svelte';

  let { children } = $props();

  const isAuthRoute = $derived(page.url.pathname.startsWith('/auth'));

  onMount(() => {
    const stops = [net.start(), pwa.start()];
    if ('serviceWorker' in navigator) {
      // نسخهٔ جدید service worker فعال شد (اعلان Q12)
      const hadController = Boolean(navigator.serviceWorker.controller);
      const onChange = () => {
        if (hadController) toasts.info('نسخهٔ جدید اسراء آماده است؛ صفحه را دوباره بارگذاری کنید.');
      };
      navigator.serviceWorker.addEventListener('controllerchange', onChange);
      stops.push(() => navigator.serviceWorker.removeEventListener('controllerchange', onChange));
    }
    void auth.init();
    return () => stops.forEach((s) => s());
  });

  $effect(() => {
    if (auth.status === 'member') void caps.load();
    else caps.reset();
  });

  // شمارندهٔ اینباکس: poll سبک وقتی tab دیده می‌شود
  $effect(() => {
    if (auth.status !== 'member') return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void auth.refreshUnread();
    }, 60_000);
    return () => clearInterval(id);
  });
</script>

<a class="skip-link" href="#main">پرش به محتوای اصلی</a>

{#if navigating.to}
  <div class="progress" role="progressbar" aria-label="در حال بارگذاری صفحه"><span></span></div>
{/if}

{#if isAuthRoute}
  <header class="auth-bar">
    <a class="brand" href="/" aria-label="اسراء — صفحهٔ اول">
      <LogoMark height={64} />
    </a>
  </header>
{:else}
  <TopBar />
{/if}

<OfflineBanner />

<main id="main" class:with-nav={!isAuthRoute}>
  {@render children()}
</main>

{#if !isAuthRoute}<BottomNav />{/if}

<ToastHost />
<AuthGateSheet />
<StepUpSheet />

<style>
  main {
    min-height: 60dvh;
  }
  main.with-nav {
    padding-bottom: calc(var(--bottomnav-h) + env(safe-area-inset-bottom));
  }
  @media (min-width: 900px) {
    main.with-nav {
      padding-bottom: 0;
    }
  }
  .auth-bar {
    display: flex;
    justify-content: center;
    padding: var(--space-lg) var(--gutter) 0;
    padding-top: calc(var(--space-lg) + env(safe-area-inset-top));
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--color-primary);
    text-decoration: none;
  }
  .progress {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 80;
    height: 3px;
    background: transparent;
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    width: 40%;
    background: var(--color-accent-warm);
    animation: slide 1s var(--ease) infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(120%);
    }
    to {
      transform: translateX(-260%);
    }
  }
</style>
