<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { formatPhone } from '$lib/utils/phone';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import PwaInstallBanner from '$lib/components/layout/PwaInstallBanner.svelte';

  let confirmLogout = $state(false);

  const items = $derived<{ href: string; icon: IconName; title: string; text: string }[]>([
    { href: '/account/profile', icon: 'user', title: 'پروفایل', text: 'نام و نام خانوادگی' },
    {
      href: '/account/password',
      icon: 'lock',
      title: auth.me?.hasPassword ? 'تغییر رمز عبور' : 'تعیین رمز عبور',
      text: auth.me?.hasPassword ? 'رمز فعلی را عوض کنید' : 'برای ورود سریع‌تر بدون پیامک'
    },
    { href: '/account/sessions', icon: 'monitor', title: 'دستگاه‌ها و نشست‌ها', text: 'دستگاه‌هایی که وارد حساب شما شده‌اند' }
  ]);

  async function logout() {
    await auth.logout();
    toasts.info('از حساب خود خارج شدید.');
    await goto('/', { replaceState: true });
  }
</script>

<svelte:head>
  <title>حساب من — اسراء</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="who">
  <Avatar name={auth.me?.profile.firstName ?? ''} size={72} />
  <div>
    <h1>{auth.displayName}</h1>
    <p class="muted num" dir="ltr">{auth.me ? formatPhone(auth.me.phone) : ''}</p>
  </div>
</div>

<ul class="list">
  {#each items as it (it.href)}
    <li>
      <a class="item" href={it.href}>
        <span class="ico"><Icon name={it.icon} size={24} /></span>
        <span class="txt">
          <strong>{it.title}</strong>
          <span class="muted">{it.text}</span>
        </span>
        <Icon name="chevron-left" size={20} class="chev" />
      </a>
    </li>
  {/each}
  <li>
    <button class="item danger" type="button" onclick={() => (confirmLogout = true)}>
      <span class="ico"><Icon name="logout" size={24} /></span>
      <span class="txt"><strong>خروج از حساب</strong></span>
    </button>
  </li>
</ul>

<div class="pwa"><PwaInstallBanner /></div>

<ConfirmDialog
  bind:open={confirmLogout}
  title="خروج از حساب"
  message="از حساب کاربری خود در این دستگاه خارج می‌شوید. هر زمان بخواهید می‌توانید دوباره وارد شوید."
  confirmLabel="خروج"
  destructive
  onconfirm={logout}
/>

<style>
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
  }
  .num {
    text-align: right;
  }
  .list {
    display: grid;
    gap: var(--space-sm);
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    color: inherit;
    text-align: start;
    text-decoration: none;
    transition: background-color var(--dur) var(--ease);
  }
  .item:hover {
    background: var(--color-primary-tint);
  }
  .ico {
    display: grid;
    place-items: center;
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .txt {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .txt .muted {
    font-size: var(--fs-sm);
  }
  :global(.chev) {
    color: var(--color-muted);
  }
  .danger {
    color: var(--color-error);
  }
  .danger .ico {
    background: var(--color-error-tint);
    color: var(--color-error);
  }
  .pwa {
    margin-top: var(--space-xl);
  }
</style>
