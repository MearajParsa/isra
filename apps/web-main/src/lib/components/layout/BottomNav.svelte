<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/auth/auth.svelte';
  import { guestNav, memberNav } from '$lib/nav';
  import Icon from '$lib/components/ui/Icon.svelte';
  import UnreadBadge from '$lib/components/ui/UnreadBadge.svelte';

  const items = $derived(auth.status === 'member' ? memberNav : guestNav);
  const showLogin = $derived(auth.status === 'guest');
  const loginHref = $derived(`/auth/phone?next=${encodeURIComponent(page.url.pathname + page.url.search)}`);
</script>

<nav class="bottom" aria-label="ناوبری اصلی">
  {#each items as item (item.href)}
    {@const active = item.match(page.url.pathname)}
    <a href={item.href} class="tab" class:active aria-current={active ? 'page' : undefined}>
      <span class="ico">
        <Icon name={item.icon} size={24} />
        {#if item.badge === 'unread' && auth.unread > 0}
          <span class="dot"><UnreadBadge count={auth.unread} dotOnly /></span>
        {/if}
      </span>
      <span class="lbl">{item.label}</span>
    </a>
  {/each}
  {#if showLogin}
    <a href={loginHref} class="tab">
      <span class="ico"><Icon name="user" size={24} /></span>
      <span class="lbl">ورود</span>
    </a>
  {/if}
</nav>

<style>
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
    font-size: 0.72rem;
    font-weight: 700;
    -webkit-tap-highlight-color: transparent;
  }
  .ico {
    position: relative;
    display: grid;
    place-items: center;
    width: 56px;
    height: 30px;
    border-radius: var(--radius-pill);
    transition: background-color var(--dur) var(--ease);
  }
  .active {
    color: var(--color-primary);
  }
  .active .ico {
    background: var(--color-accent-warm);
  }
  .dot {
    position: absolute;
    top: 0;
    inset-inline-end: 12px;
  }
  @media (min-width: 900px) {
    .bottom {
      display: none;
    }
  }
</style>
