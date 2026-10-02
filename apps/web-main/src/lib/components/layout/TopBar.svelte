<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/auth/auth.svelte';
  import { guestNav, memberDesktopNav } from '$lib/nav';
  import { caps } from '$lib/stores/caps.svelte';
  import LogoMark from '$lib/components/ui/LogoMark.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import UnreadBadge from '$lib/components/ui/UnreadBadge.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  const items = $derived(auth.status === 'member' ? memberDesktopNav(caps.canManage) : guestNav);
  const loginHref = $derived(
    page.url.pathname.startsWith('/auth')
      ? '/auth/phone'
      : `/auth/phone?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
  );
</script>

<header class="bar">
  <div class="container inner">
    <a class="brand" href="/" aria-label="اسراء — صفحهٔ اول">
      <LogoMark height={44} />
    </a>

    <nav class="desktop" aria-label="ناوبری اصلی">
      {#each items as item (item.href)}
        {@const active = item.match(page.url.pathname)}
        <a href={item.href} class="link" class:active aria-current={active ? 'page' : undefined}>
          {item.label}
          {#if item.badge === 'unread'}<UnreadBadge count={auth.unread} />{/if}
        </a>
      {/each}
    </nav>

    <div class="end">
      {#if auth.status === 'member'}
        <a class="me" href="/account" aria-label="حساب من">
          <Avatar name={auth.me?.profile.firstName ?? ''} size={36} />
          <span class="me-name">{auth.me?.profile.firstName || 'حساب من'}</span>
        </a>
      {:else if auth.status === 'guest'}
        <Button href={loginHref} size="sm"><Icon name="user" size={18} />ورود / ثبت‌نام</Button>
      {/if}
    </div>
  </div>
</header>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 30;
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--color-outline);
    padding-top: env(safe-area-inset-top);
  }
  .inner {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    min-height: var(--topbar-h);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--color-primary);
    text-decoration: none;
  }
  .desktop {
    display: none;
  }
  .end {
    margin-inline-start: auto;
  }
  .me {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 4px 4px 4px 12px;
    border-radius: var(--radius-pill);
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 700;
  }
  .me:hover {
    background: var(--color-secondary);
  }
  .me-name {
    display: none;
    font-size: var(--fs-sm);
  }

  @media (min-width: 900px) {
    .desktop {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
    }
    .link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: var(--radius-pill);
      color: var(--color-muted);
      font-weight: 700;
      text-decoration: none;
      transition: background-color var(--dur) var(--ease);
    }
    .link:hover {
      background: var(--color-secondary);
      color: var(--color-primary);
    }
    .link.active {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .me-name {
      display: inline;
    }
  }
</style>
