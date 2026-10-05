<script lang="ts">
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { NAV } from '$lib/nav';
  import { appPath, withBase } from '$lib/utils/paths';
  import { ROLE_TITLE } from '$lib/utils/audit';
  import LogoMark from '$lib/components/ui/LogoMark.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

  let { children }: { children: Snippet } = $props();

  const items = $derived(NAV.filter((n) => !n.perm || system.can(n.perm)));
  const name = $derived(system.me?.user.name ?? '');
  let confirmLogout = $state(false);

  async function logout() {
    await auth.logout();
    system.reset();
    toasts.info('از پنل خارج شدید.');
    await goto(withBase('/login'), { replaceState: true });
  }
</script>

<div class="shell">
  <aside class="side" aria-label="منوی مدیریت">
    <a class="brand" href={withBase('/')} aria-label="اسراء — نمای کلی"><LogoMark height={56} tone="light" /></a>
    <p class="tag">پنل مدیریت</p>

    <nav class="nav">
      {#each items as item (item.href)}
        {@const active = item.match(appPath(page.url.pathname))}
        <a href={withBase(item.href)} class="link" class:active aria-current={active ? 'page' : undefined}>
          <Icon name={item.icon} size={22} />{item.label}
        </a>
      {/each}
    </nav>

    <div class="me">
      <Avatar name={name} size={40} />
      <div class="who">
        <strong>{name}</strong>
        <span>{(system.me?.roles ?? []).map((r) => ROLE_TITLE[r]).join('، ')}</span>
      </div>
      <button type="button" class="out" onclick={() => (confirmLogout = true)} aria-label="خروج">
        <Icon name="logout" size={22} />
      </button>
    </div>
  </aside>

  <div class="content">
    <header class="mbar">
      <a href={withBase('/')} aria-label="نمای کلی"><LogoMark height={40} /></a>
      <button type="button" class="out dark" onclick={() => (confirmLogout = true)} aria-label="خروج">
        <Icon name="logout" size={22} />
      </button>
    </header>
    <main id="main">{@render children()}</main>
  </div>

  <nav class="bottom" aria-label="منوی مدیریت">
    {#each items as item (item.href)}
      {@const active = item.match(appPath(page.url.pathname))}
      <a href={withBase(item.href)} class="tab" class:active aria-current={active ? 'page' : undefined}>
        <span class="ico"><Icon name={item.icon} size={22} /></span>
        <span class="lbl">{item.label}</span>
      </a>
    {/each}
  </nav>
</div>

<ConfirmDialog
  bind:open={confirmLogout}
  title="خروج از پنل"
  message="از حساب مدیریت خود خارج می‌شوید."
  confirmLabel="خروج"
  destructive
  onconfirm={logout}
/>

<style>
  .shell {
    min-height: 100dvh;
  }
  .side {
    display: none;
  }
  .content {
    min-width: 0;
    padding-bottom: calc(var(--bottomnav-h) + env(safe-area-inset-bottom));
  }
  .mbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px var(--gutter);
    padding-top: calc(8px + env(safe-area-inset-top));
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--color-outline);
  }
  .out {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-accent-warm);
  }
  .out.dark {
    color: var(--color-primary);
  }
  .out:hover {
    background: color-mix(in srgb, var(--color-on-primary) 12%, transparent);
  }
  .out.dark:hover {
    background: var(--color-secondary);
  }
  main {
    padding: var(--space-lg) var(--gutter) var(--space-2xl);
    max-width: 72rem;
    margin-inline: auto;
  }

  .bottom {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 30;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    height: calc(var(--bottomnav-h) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--color-card);
    border-top: 1px solid var(--color-outline);
    box-shadow: 0 -4px 16px rgb(28 14 68 / 0.05);
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--color-muted);
    text-decoration: none;
    font-size: 0.68rem;
    font-weight: 700;
    text-align: center;
  }
  .ico {
    display: grid;
    place-items: center;
    width: 52px;
    height: 30px;
    border-radius: var(--radius-pill);
  }
  .tab.active {
    color: var(--color-primary);
  }
  .tab.active .ico {
    background: var(--color-accent-warm);
  }

  @media (min-width: 900px) {
    .shell {
      display: grid;
      grid-template-columns: 17rem 1fr;
    }
    .side {
      position: sticky;
      top: 0;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      padding: var(--space-lg) var(--space-md);
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .brand {
      align-self: center;
      margin-bottom: 2px;
    }
    .tag {
      align-self: center;
      margin-bottom: var(--space-lg);
      padding: 2px 14px;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-accent-warm) 20%, transparent);
      color: var(--color-accent-warm);
      font-size: var(--fs-sm);
      font-weight: 700;
    }
    .nav {
      display: grid;
      gap: 4px;
    }
    .link {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      min-height: 48px;
      padding: 0 var(--space-md);
      border-radius: var(--radius-md);
      color: color-mix(in srgb, var(--color-on-primary) 80%, transparent);
      font-weight: 700;
      text-decoration: none;
      transition: background-color var(--dur) var(--ease);
    }
    .link:hover {
      background: color-mix(in srgb, var(--color-on-primary) 10%, transparent);
      color: var(--color-on-primary);
    }
    .link.active {
      background: var(--color-accent-warm);
      color: var(--color-primary);
    }
    .me {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      margin-top: auto;
      padding: var(--space-sm);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-on-primary) 8%, transparent);
    }
    .who {
      display: grid;
      flex: 1;
      min-width: 0;
      line-height: 1.5;
    }
    .who strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .who span {
      font-size: var(--fs-xs);
      color: color-mix(in srgb, var(--color-on-primary) 70%, transparent);
    }
    .mbar,
    .bottom {
      display: none;
    }
    .content {
      padding-bottom: 0;
    }
    main {
      padding-top: var(--space-xl);
    }
  }
</style>
