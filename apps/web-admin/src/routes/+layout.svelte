<script lang="ts">
  import '$lib/styles/tokens.css';
  import '$lib/styles/base.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page, navigating } from '$app/state';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { net } from '$lib/stores/net.svelte';
  import { pwa } from '$lib/stores/pwa.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { safeNext } from '$lib/utils/nav';
  import AdminShell from '$lib/components/layout/AdminShell.svelte';
  import ToastHost from '$lib/components/ui/ToastHost.svelte';
  import StepUpSheet from '$lib/components/features/StepUpSheet.svelte';
  import LogoMark from '$lib/components/ui/LogoMark.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { appPath, withBase } from '$lib/utils/paths';

  let { children } = $props();

  const isLogin = $derived(appPath(page.url.pathname) === '/login');

  onMount(() => {
    const stops = [net.start(), pwa.start()];
    if ('serviceWorker' in navigator) {
      const had = Boolean(navigator.serviceWorker.controller);
      const onChange = () => {
        if (had) toasts.info('نسخهٔ جدید پنل آماده است؛ صفحه را دوباره بارگذاری کنید.');
      };
      navigator.serviceWorker.addEventListener('controllerchange', onChange);
      stops.push(() => navigator.serviceWorker.removeEventListener('controllerchange', onChange));
    }
    void auth.init();
    return () => stops.forEach((s) => s());
  });

  $effect(() => {
    if (auth.status === 'member' && system.status === 'idle') void system.load();
    if (auth.status === 'guest') system.reset();
  });

  $effect(() => {
    if (auth.status === 'guest' && !isLogin) {
      const next = appPath(page.url.pathname) + page.url.search;
      void goto(withBase(`/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`), { replaceState: true });
    } else if (auth.status === 'member' && isLogin && system.status === 'ready') {
      void goto(withBase(safeNext(page.url.searchParams.get('next'))), { replaceState: true });
    }
  });

  async function logout() {
    await auth.logout();
    system.reset();
    await goto(withBase('/login'), { replaceState: true });
  }
</script>

<a class="skip-link" href="#main">پرش به محتوای اصلی</a>

{#if navigating.to}
  <div class="progress" role="progressbar" aria-label="در حال بارگذاری صفحه"><span></span></div>
{/if}

{#if !net.online}
  <div class="offline" role="status"><Icon name="wifi-off" size={18} />اتصال اینترنت قطع است.</div>
{/if}

{#if isLogin}
  {@render children()}
{:else if auth.status === 'unknown' || (auth.status === 'member' && (system.status === 'idle' || system.status === 'loading'))}
  <div class="boot" aria-hidden="true">
    <LogoMark height={72} />
    <Skeleton w="12rem" h="12px" radius="999px" />
  </div>
  <span class="sr-only" role="status">در حال بارگذاری پنل…</span>
{:else if auth.status === 'member' && system.status === 'forbidden'}
  <div class="center">
    <LogoMark height={64} />
    <EmptyState icon="lock" title="به پنل مدیریت دسترسی ندارید" message="حساب شما نقش مدیریتی ندارد. اگر فکر می‌کنید اشتباهی رخ داده، با مدیر سیستم تماس بگیرید.">
      {#snippet action()}<Button variant="secondary" onclick={logout}><Icon name="logout" size={18} />خروج و ورود با حساب دیگر</Button>{/snippet}
    </EmptyState>
  </div>
{:else if auth.status === 'member' && system.status === 'error'}
  <div class="center">
    <LogoMark height={64} />
    <EmptyState icon="alert" tone="error" title="پنل بارگذاری نشد" message={system.error ?? ''}>
      {#snippet action()}
        <Button onclick={() => system.load()}><Icon name="refresh" size={18} />تلاش دوباره</Button>
        <Button variant="text" onclick={logout}>خروج</Button>
      {/snippet}
    </EmptyState>
  </div>
{:else if auth.status === 'member'}
  <AdminShell>{@render children()}</AdminShell>
{/if}

<ToastHost />
<StepUpSheet />

<style>
  .boot,
  .center {
    display: grid;
    place-items: center;
    align-content: center;
    gap: var(--space-lg);
    min-height: 100dvh;
    padding: var(--space-lg);
  }
  .offline {
    position: sticky;
    top: 0;
    z-index: 50;
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
  .progress {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 80;
    height: 3px;
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
