<script lang="ts">
  import { page } from '$app/state';
  import { api, ApiError, type Grant, type SystemRoleKey, type SystemUser } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { ROLE_TITLE } from '$lib/utils/audit';
  import { errorMessage } from '$lib/utils/errors';
  import { formatDate } from '$lib/utils/format';
  import { formatPhone } from '$lib/utils/phone';
  import { Resource } from '$lib/utils/resource.svelte';
  import { withStepUp } from '$lib/utils/stepup';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

  const id = $derived(page.params.id as string);
  const user = new Resource<SystemUser>();
  const load = () => user.load(() => auth.withAuth((t) => api.system.user(t, id)));
  $effect(() => {
    void load();
  });

  const canAssign = $derived(system.can('system.role.assign'));
  let selRoles = $state<SystemRoleKey[]>([]);
  let selGrant = $state(false);
  let saving = $state<'roles' | 'grants' | null>(null);
  let roleError = $state<string | null>(null);
  let confirmRoles = $state(false);

  $effect(() => {
    if (user.data) {
      selRoles = [...user.data.roles];
      selGrant = user.data.grants.includes('session.create');
    }
  });

  const rolesDirty = $derived(
    user.data ? [...selRoles].sort().join() !== [...user.data.roles].sort().join() : false
  );
  const grantDirty = $derived(user.data ? selGrant !== user.data.grants.includes('session.create') : false);
  const removing = $derived(user.data ? user.data.roles.filter((r) => !selRoles.includes(r)) : []);
  const isSelf = $derived(user.data?.id === system.me?.user.id);

  function toggleRole(r: SystemRoleKey) {
    selRoles = selRoles.includes(r) ? selRoles.filter((x) => x !== r) : [...selRoles, r];
    roleError = null;
  }

  function askRoles() {
    // برداشتن نقش مخرب است ⇒ تأیید جداگانه
    if (removing.length > 0) confirmRoles = true;
    else void saveRoles();
  }

  async function saveRoles() {
    if (!user.data) return;
    saving = 'roles';
    roleError = null;
    try {
      const res = await withStepUp((su) => auth.withAuth((t) => api.system.setUserRoles(t, id, selRoles, su)));
      if (res) {
        user.data = res;
        toasts.success('نقش‌ها ذخیره شد و برای low و mid منتشر می‌شود.');
        if (isSelf) void system.load();
      }
    } catch (e) {
      roleError = e instanceof ApiError && e.code === 'CONFLICT' && e.details.reason === 'LAST_HOLDER' ? e.message : errorMessage(e);
    } finally {
      saving = null;
    }
  }

  async function saveGrant() {
    if (!user.data) return;
    saving = 'grants';
    try {
      const grants: Grant[] = selGrant ? ['session.create'] : [];
      const res = await withStepUp((su) => auth.withAuth((t) => api.system.setUserGrants(t, id, grants, su)));
      if (res) {
        user.data = res;
        toasts.success('مجوز کاربر ذخیره شد.');
      }
    } catch (e) {
      toasts.error(errorMessage(e));
    } finally {
      saving = null;
    }
  }

  const roleKeys: SystemRoleKey[] = ['developer', 'super_admin'];
</script>

<svelte:head><title>{user.data ? `${user.data.name} — کاربران` : 'کاربر'} — مدیریت اسراء</title></svelte:head>

<PageHeader title={user.data?.name ?? 'کاربر'} backHref="/users" />

{#if user.status === 'ready' && user.data}
  <section class="card who">
    <Avatar name={user.data.name} size={64} />
    <div>
      <h2>{user.data.name}</h2>
      <p class="muted num" dir="ltr">{formatPhone(user.data.phone)}</p>
      <p class="muted small">عضویت از {formatDate(user.data.createdAt)}</p>
    </div>
  </section>

  <section class="card" aria-labelledby="r-h">
    <h2 id="r-h">نقش‌های سیستم</h2>
    <p class="muted small">نقش‌های سیستم حذف‌شدنی نیستند و هر کدام همیشه دست‌کم یک دارنده دارد.</p>
    <ul class="opts">
      {#each roleKeys as r (r)}
        {@const lockDev = r === 'developer' && !system.isDeveloper}
        <li>
          <label class="opt" class:off={!canAssign || lockDev}>
            <input type="checkbox" checked={selRoles.includes(r)} disabled={!canAssign || lockDev || saving !== null} onchange={() => toggleRole(r)} />
            <span>
              <strong>{ROLE_TITLE[r]}</strong>
              <span class="muted small">
                {r === 'developer' ? 'دسترسی کامل فنی و سیستمی' : 'مدیریت سیستم، نقش‌ها و تنظیمات'}
                {#if lockDev}· فقط توسعه‌دهنده می‌تواند این نقش را تغییر دهد{/if}
              </span>
            </span>
          </label>
        </li>
      {/each}
    </ul>
    {#if roleError}<NoticeBanner tone="error" role="alert">{roleError}</NoticeBanner>{/if}
    {#if canAssign}
      <div class="acts">
        <Button loading={saving === 'roles'} disabled={!rolesDirty} onclick={askRoles}>ذخیرهٔ نقش‌ها</Button>
        {#if rolesDirty}<Button variant="text" onclick={() => ((selRoles = [...user.data!.roles]), (roleError = null))}>بازگرداندن</Button>{/if}
      </div>
      <p class="muted small"><Icon name="shield" size={16} /> ذخیره نیازمند تأیید هویت با کد پیامکی است.</p>
    {/if}
  </section>

  <section class="card" aria-labelledby="g-h">
    <h2 id="g-h">مجوز مستقیم کاربر</h2>
    <label class="opt" class:off={!canAssign}>
      <input type="checkbox" bind:checked={selGrant} disabled={!canAssign || saving !== null} />
      <span>
        <strong>ساخت جلسه</strong>
        <span class="muted small">کاربر می‌تواند جلسه بسازد و مدیر آن شود. (از ماتریس نقش جدا و مستقیماً به کاربر داده می‌شود.)</span>
      </span>
    </label>
    {#if canAssign}
      <div class="acts"><Button loading={saving === 'grants'} disabled={!grantDirty} onclick={saveGrant}>ذخیرهٔ مجوز</Button></div>
    {/if}
  </section>

  <NoticeBanner tone="info">
    تغییر نقش و مجوز با outbox به low و mid منتشر می‌شود. کاربر آن را از نشست بعدی (حداکثر ۱۵ دقیقه، با تمدید توکن) می‌بیند.
  </NoticeBanner>

  <ConfirmDialog
    bind:open={confirmRoles}
    title="برداشتن نقش"
    message={`نقش «${removing.map((r) => ROLE_TITLE[r]).join('، ')}» از ${user.data.name} برداشته می‌شود${isSelf ? ' — این نقش خودِ شماست و ممکن است دسترسی خود را از دست بدهید' : ''}.`}
    confirmLabel="برداشتن و ذخیره"
    destructive
    onconfirm={saveRoles}
  />
{:else if user.status === 'error'}
  <EmptyState icon={user.offline ? 'wifi-off' : 'alert'} tone="error" title="کاربر بارگذاری نشد" message={user.error ?? ''}>
    {#snippet action()}
      <Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>
      <Button variant="text" href="/users">بازگشت</Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="stack" aria-hidden="true">
    <Skeleton h="110px" radius="var(--radius-lg)" />
    <Skeleton h="220px" radius="var(--radius-lg)" />
  </div>
{/if}

<style>
  .stack,
  :global(main) > :global(section) {
    display: grid;
    gap: var(--space-md);
  }
  .card {
    display: grid;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .num {
    text-align: right;
  }
  .small {
    font-size: var(--fs-sm);
  }
  .opts {
    display: grid;
    gap: var(--space-sm);
  }
  .opt {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-md);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .opt.off {
    background: var(--color-neutral);
    cursor: not-allowed;
  }
  .opt input {
    width: 22px;
    height: 22px;
    margin-top: 4px;
    accent-color: var(--color-accent);
  }
  .opt > span {
    display: grid;
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
  }
</style>
