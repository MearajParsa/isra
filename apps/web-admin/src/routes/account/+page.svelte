<script lang="ts">
  import { api, type Page, type UserDeviceSession } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { account } from '$lib/auth/account.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { stepped, describeError } from '$lib/utils/adminCall';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import { passwordError } from '$lib/utils/password';
  import { formatPhone } from '$lib/utils/phone';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import PasswordField from '$lib/components/ui/PasswordField.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import DevicesList from '$lib/components/features/DevicesList.svelte';

  const acct = $derived(account.data);
  $effect(() => {
    void account.load();
  });

  // ───────── پروفایل ─────────
  let firstName = $state('');
  let lastName = $state('');
  let profileErrors = $state<Record<string, string>>({});
  let profileError = $state<string | null>(null);
  let savingProfile = $state(false);
  let seeded = $state(false);
  $effect(() => {
    if (acct && !seeded) {
      firstName = acct.firstName;
      lastName = acct.lastName;
      seeded = true;
    }
  });
  const profileDirty = $derived(!!acct && (firstName.trim() !== acct.firstName || lastName.trim() !== acct.lastName));

  async function saveProfile(e: SubmitEvent) {
    e.preventDefault();
    profileErrors = {};
    profileError = null;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (fn.length < 2 || fn.length > 40) profileErrors.firstName = 'نام باید ۲ تا ۴۰ نویسه باشد.';
    if (ln.length < 2 || ln.length > 40) profileErrors.lastName = 'نام خانوادگی باید ۲ تا ۴۰ نویسه باشد.';
    if (Object.keys(profileErrors).length || !acct) return;
    const body: { firstName?: string; lastName?: string } = {};
    if (fn !== acct.firstName) body.firstName = fn;
    if (ln !== acct.lastName) body.lastName = ln;
    savingProfile = true;
    try {
      const r = await auth.withAuth((t) => api.system.updateProfile(t, body));
      account.set(r);
      void system.load(true);
      toasts.success('پروفایل ذخیره شد.');
    } catch (err) {
      profileErrors = fieldErrors(err);
      if (Object.keys(profileErrors).length === 0) profileError = errorMessage(err);
    } finally {
      savingProfile = false;
    }
  }

  // ───────── رمز ─────────
  let next = $state('');
  let confirm = $state('');
  let pwErrors = $state<Record<string, string>>({});
  let pwError = $state<string | null>(null);
  let savingPw = $state(false);

  async function savePassword(e: SubmitEvent) {
    e.preventDefault();
    pwErrors = {};
    pwError = null;
    const pe = passwordError(next);
    if (pe) pwErrors.newPassword = pe;
    if (confirm !== next) pwErrors.confirm = 'تکرار رمز با رمز جدید یکسان نیست.';
    if (Object.keys(pwErrors).length) return;
    savingPw = true;
    try {
      const ok = await stepped((t, su) => api.system.setMyPassword(t, { newPassword: next }, su).then(() => true));
      if (!ok) return;
      next = confirm = '';
      toasts.success('رمز عبور ذخیره شد. از دستگاه‌های دیگر خارج شدید.');
      void account.load();
      void loadDevices();
    } catch (err) {
      pwErrors = fieldErrors(err);
      if (Object.keys(pwErrors).length === 0) pwError = describeError(err);
    } finally {
      savingPw = false;
    }
  }

  // ───────── دستگاه‌ها ─────────
  const devices = new Resource<Page<UserDeviceSession>>();
  const loadDevices = () => devices.loadLatest((signal) => auth.withAuth((t) => api.system.mySessions(t, { signal })));
  $effect(() => {
    void loadDevices();
  });
  let busyId = $state<string | null>(null);
  let othersAsk = $state(false);
  const others = $derived((devices.data?.items ?? []).filter((s) => !s.revokedAt && !s.current).length);

  async function revoke(s: UserDeviceSession) {
    busyId = s.id;
    try {
      await auth.withAuth((t) => api.system.revokeMySession(t, s.id));
      toasts.success('نشست پایان یافت.');
      await loadDevices();
    } catch (e) {
      toasts.error(errorMessage(e));
    } finally {
      busyId = null;
    }
  }
  async function revokeOthers() {
    try {
      await auth.withAuth((t) => api.system.revokeOtherSessions(t));
      toasts.success('از همهٔ دستگاه‌های دیگر خارج شدید.');
      await loadDevices();
    } catch (e) {
      toasts.error(errorMessage(e));
    }
  }
</script>

<svelte:head><title>حساب من — مدیریت اسراء</title></svelte:head>

<PageHeader title="حساب من" subtitle="نام، رمز عبور و دستگاه‌های وارد‌شدهٔ شما." />

{#if account.status === 'error' && !acct}
  <EmptyState icon="alert" tone="error" title="حساب بارگذاری نشد" message="ارتباط با سرور برقرار نشد.">
    {#snippet action()}<Button variant="secondary" onclick={() => account.load()}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else if !acct}
  <div class="stack" aria-hidden="true"><Skeleton h="220px" radius="var(--radius-lg)" /><Skeleton h="220px" radius="var(--radius-lg)" /></div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{:else}
  <section class="card" aria-labelledby="p-h">
    <h2 id="p-h">اطلاعات شخصی</h2>
    <form class="f" onsubmit={saveProfile} novalidate>
      <div class="two">
        <TextField label="نام" bind:value={firstName} error={profileErrors.firstName} disabled={savingProfile} required maxlength={40} autocomplete="given-name" />
        <TextField label="نام خانوادگی" bind:value={lastName} error={profileErrors.lastName} disabled={savingProfile} required maxlength={40} autocomplete="family-name" />
      </div>
      <TextField label="شمارهٔ موبایل" value={formatPhone(acct.phone)} disabled ltr hint="شمارهٔ موبایل را فقط مدیر سیستم (توسعه‌دهنده یا مدیر کاربران) می‌تواند تغییر دهد." />
      {#if profileError}<NoticeBanner tone="error" role="alert">{profileError}</NoticeBanner>{/if}
      <div><Button type="submit" loading={savingProfile} disabled={!profileDirty}>ذخیرهٔ پروفایل</Button></div>
    </form>
  </section>

  <section class="card" aria-labelledby="pw-h">
    <h2 id="pw-h">{acct.hasPassword ? 'تغییر رمز عبور' : 'تعیین رمز عبور'}</h2>
    <p class="muted fa-small">برای امنیت، پیش از ذخیره کد تأیید پیامکی می‌گیرید و با ذخیرهٔ رمز از بقیهٔ دستگاه‌ها خارج می‌شوید.</p>
    <form class="f" onsubmit={savePassword} novalidate>
      <PasswordField label="رمز جدید" bind:value={next} autocomplete="new-password" error={pwErrors.newPassword} hint="دست‌کم ۸ نویسه." disabled={savingPw} />
      <PasswordField label="تکرار رمز جدید" bind:value={confirm} autocomplete="new-password" error={pwErrors.confirm} disabled={savingPw} />
      {#if pwError}<NoticeBanner tone="error" role="alert">{pwError}</NoticeBanner>{/if}
      <div><Button type="submit" loading={savingPw}>ذخیرهٔ رمز</Button></div>
    </form>
  </section>

  <section class="card" aria-labelledby="dv-h">
    <div class="sec-head">
      <h2 id="dv-h">دستگاه‌های من</h2>
      {#if others > 0}<Button variant="secondary" size="sm" onclick={() => (othersAsk = true)}><Icon name="logout" size={18} />خروج از دستگاه‌های دیگر</Button>{/if}
    </div>
    {#if devices.status === 'ready' && devices.data}
      <DevicesList sessions={devices.data.items} showCurrent {busyId} onrevoke={revoke} />
    {:else if devices.status === 'error'}
      <NoticeBanner tone="error" role="alert">
        {devices.error}
        {#snippet action()}<Button variant="text" size="sm" onclick={loadDevices}>تلاش دوباره</Button>{/snippet}
      </NoticeBanner>
    {:else}
      <Skeleton h="64px" radius="var(--radius-md)" />
    {/if}
  </section>

  <ConfirmDialog bind:open={othersAsk} title="خروج از دستگاه‌های دیگر" message="همهٔ نشست‌های شما به‌جز همین دستگاه پایان می‌یابد." confirmLabel="خروج از بقیه" destructive onconfirm={revokeOthers} />
{/if}

<style>
  .stack {
    display: grid;
    gap: var(--space-md);
  }
  .card {
    margin-bottom: var(--space-md);
    max-width: 44rem;
  }
  .f {
    display: grid;
    gap: var(--space-md);
  }
  .two {
    display: grid;
    gap: var(--space-md);
  }
  @media (min-width: 640px) {
    .two {
      grid-template-columns: 1fr 1fr;
    }
  }
  .sec-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }
</style>
