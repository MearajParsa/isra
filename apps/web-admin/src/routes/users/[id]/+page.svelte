<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { withBase } from '$lib/utils/paths';
  import { api, ApiError, type Grant, type Page, type SystemRoleKey, type SystemUserDetail, type UserDeviceSession } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { ROLE_TITLE } from '$lib/utils/audit';
  import { stepped, describeError } from '$lib/utils/adminCall';
  import { clientLabel, USER_STATUS, isDeletedPhone } from '$lib/utils/labels';
  import { formatDate, formatDateTime, formatNumber, formatRelative } from '$lib/utils/format';
  import { formatPhone } from '$lib/utils/phone';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import TypeConfirmDialog from '$lib/components/ui/TypeConfirmDialog.svelte';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import Menu, { type MenuItem } from '$lib/components/ui/Menu.svelte';
  import UserFormDialog from '$lib/components/features/UserFormDialog.svelte';
  import TempPasswordDialog from '$lib/components/features/TempPasswordDialog.svelte';
  import DevicesList from '$lib/components/features/DevicesList.svelte';

  const id = $derived(page.params.id as string);
  const user = new Resource<SystemUserDetail>();
  const devices = new Resource<Page<UserDeviceSession>>();
  const load = () => user.loadLatest((signal) => auth.withAuth((t) => api.system.user(t, id, { signal })));
  const loadDevices = () => devices.loadLatest((signal) => auth.withAuth((t) => api.system.userSessions(t, id, { signal })));
  $effect(() => {
    void id;
    void load();
    void loadDevices();
  });

  const canManage = $derived(system.can('system.users.manage'));
  const canAssign = $derived(system.can('system.role.assign'));
  const isSelf = $derived(user.data?.id === system.me?.user.id);
  const isDeleted = $derived(user.data?.status === 'deleted');
  const displayName = $derived(user.data?.name || 'کاربر حذف‌شده');

  // ───────── نقش و مجوز ─────────
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

  const rolesDirty = $derived(user.data ? [...selRoles].sort().join() !== [...user.data.roles].sort().join() : false);
  const grantDirty = $derived(user.data ? selGrant !== user.data.grants.includes('session.create') : false);
  const removing = $derived(user.data ? user.data.roles.filter((r) => !selRoles.includes(r)) : []);

  function toggleRole(r: SystemRoleKey) {
    selRoles = selRoles.includes(r) ? selRoles.filter((x) => x !== r) : [...selRoles, r];
    roleError = null;
  }
  function askRoles() {
    if (removing.length > 0) confirmRoles = true;
    else void saveRoles();
  }
  async function saveRoles() {
    if (!user.data) return;
    saving = 'roles';
    roleError = null;
    try {
      const res = await stepped((t, su) => api.system.setUserRoles(t, id, selRoles, su));
      if (res) {
        user.data = { ...user.data, ...res };
        toasts.success('نقش‌ها ذخیره شد و برای low و mid منتشر می‌شود.');
        if (isSelf) void system.load(true);
      }
    } catch (e) {
      roleError = describeError(e);
    } finally {
      saving = null;
    }
  }
  async function saveGrant() {
    if (!user.data) return;
    saving = 'grants';
    try {
      const grants: Grant[] = selGrant ? ['session.create'] : [];
      const res = await stepped((t, su) => api.system.setUserGrants(t, id, grants, su));
      if (res) {
        user.data = { ...user.data, ...res };
        toasts.success('مجوز کاربر ذخیره شد.');
      }
    } catch (e) {
      toasts.error(describeError(e));
    } finally {
      saving = null;
    }
  }

  // ───────── عملیات مدیریتی ─────────
  let editOpen = $state(false);
  let pwOpen = $state(false);
  let statusAsk = $state(false);
  let clearAsk = $state(false);
  let logoutAsk = $state(false);
  let deleteOpen = $state(false);
  let deleteError = $state<string | null>(null);
  let busyDevice = $state<string | null>(null);

  const menuItems = $derived.by<MenuItem[]>(() => {
    const u = user.data;
    if (!u) return [];
    const gone = u.status === 'deleted';
    const goneHint = gone ? 'کاربر حذف‌شده است.' : undefined;
    const selfHint = isSelf ? 'روی حساب خودتان مجاز نیست.' : undefined;
    return [
      { id: 'edit', label: 'ویرایش نام و شماره', icon: 'edit', disabled: gone, hint: goneHint },
      { id: 'status', label: u.status === 'active' ? 'غیرفعال‌کردن کاربر' : 'فعال‌کردن کاربر', icon: u.status === 'active' ? 'ban' : 'check', disabled: gone || (isSelf && u.status === 'active'), hint: goneHint ?? (u.status === 'active' ? selfHint : undefined), separator: true },
      { id: 'password', label: 'تعیین رمز موقت', icon: 'key', disabled: gone, hint: goneHint },
      { id: 'clear', label: 'حذف رمز (فقط ورود با کد)', icon: 'lock', disabled: gone || !u.hasPassword, hint: goneHint ?? (!u.hasPassword ? 'کاربر رمزی ندارد.' : undefined) },
      { id: 'logout', label: 'خروج از همهٔ دستگاه‌ها', icon: 'logout', disabled: gone, hint: goneHint },
      { id: 'delete', label: 'حذف کاربر', icon: 'trash', danger: true, separator: true, disabled: gone || isSelf, hint: goneHint ?? selfHint }
    ];
  });

  function onMenu(a: string) {
    if (a === 'edit') editOpen = true;
    else if (a === 'status') statusAsk = true;
    else if (a === 'password') pwOpen = true;
    else if (a === 'clear') clearAsk = true;
    else if (a === 'logout') logoutAsk = true;
    else if (a === 'delete') {
      deleteError = null;
      deleteOpen = true;
    }
  }

  async function toggleStatus() {
    const u = user.data;
    if (!u) return;
    const next = u.status === 'active' ? 'disabled' : 'active';
    try {
      const res = await stepped((t, su) => api.system.setUserStatus(t, id, next, su));
      if (res) {
        user.data = res;
        toasts.success(next === 'disabled' ? 'کاربر غیرفعال شد و از همهٔ دستگاه‌ها خارج شد.' : 'کاربر دوباره فعال شد.');
        void loadDevices();
      }
    } catch (e) {
      toasts.error(describeError(e));
    }
  }
  async function clearPassword() {
    try {
      const ok = await stepped((t, su) => api.system.setUserPassword(t, id, { action: 'clear' }, su).then(() => true));
      if (ok) {
        toasts.success('رمز کاربر حذف شد؛ از این پس فقط با کد پیامکی وارد می‌شود.');
        void load();
      }
    } catch (e) {
      toasts.error(describeError(e));
    }
  }
  async function logoutAll() {
    try {
      const ok = await stepped((t, su) => api.system.logoutUserEverywhere(t, id, su).then(() => true));
      if (ok) {
        toasts.success('کاربر از همهٔ دستگاه‌ها خارج شد.');
        void loadDevices();
        void load();
      }
    } catch (e) {
      toasts.error(describeError(e));
    }
  }
  async function revokeDevice(s: UserDeviceSession) {
    busyDevice = s.id;
    try {
      const ok = await stepped((t, su) => api.system.revokeUserSession(t, id, s.id, su).then(() => true));
      if (ok) {
        toasts.success('نشست پایان یافت.');
        void loadDevices();
        void load();
      }
    } catch (e) {
      toasts.error(describeError(e));
    } finally {
      busyDevice = null;
    }
  }
  async function deleteUser() {
    deleteError = null;
    try {
      const ok = await stepped((t, su) => api.system.deleteUser(t, id, su).then(() => true));
      if (ok) {
        deleteOpen = false;
        toasts.success('کاربر حذف و ناشناس شد.');
        await goto(withBase('/users'), { replaceState: true });
      }
    } catch (e) {
      deleteError = describeError(e);
    }
  }

  const statusTone = { active: 'success', disabled: 'warning', deleted: 'danger' } as const;
  const roleKeys: SystemRoleKey[] = ['developer', 'super_admin'];
  const clientRows = $derived(Object.entries(user.data?.sessionsByClient ?? {}).filter(([, n]) => n > 0));
</script>

<svelte:head><title>{user.data ? `${displayName} — کاربران` : 'کاربر'} — مدیریت اسراء</title></svelte:head>

<PageHeader title={user.data ? displayName : 'کاربر'} backHref={withBase('/users')}>
  {#snippet actions()}
    {#if canManage && user.data}<Menu items={menuItems} label="عملیات مدیریتی کاربر" onselect={onMenu} />{/if}
  {/snippet}
</PageHeader>

{#if user.status === 'ready' && user.data}
  {@const u = user.data}
  <section class="card who" aria-label="پروفایل">
    <Avatar name={u.name} size={64} />
    <div class="meta">
      <h2>{displayName} <StatusChip tone={statusTone[u.status]}>{USER_STATUS[u.status]}</StatusChip></h2>
      <p class="muted num" dir="ltr">{isDeletedPhone(u.phone) ? 'شماره ناشناس شده' : formatPhone(u.phone)}</p>
      <dl class="facts">
        <div><dt>عضویت</dt><dd>{formatDate(u.createdAt)}</dd></div>
        <div><dt>آخرین فعالیت</dt><dd>{u.lastActiveAt ? formatRelative(u.lastActiveAt) : 'ثبت نشده'}</dd></div>
        <div>
          <dt>رمز عبور</dt>
          <dd>
            {#if u.mustChangePassword}<StatusChip tone="warning">رمز موقت</StatusChip>
            {:else if u.hasPassword}دارد{:else}ندارد (فقط کد پیامکی){/if}
          </dd>
        </div>
      </dl>
    </div>
  </section>

  {#if u.status === 'disabled'}<NoticeBanner tone="warning">این کاربر غیرفعال است؛ نمی‌تواند وارد شود و نشست فعالی ندارد.</NoticeBanner>{/if}
  {#if isDeleted}<NoticeBanner tone="error">این کاربر حذف (و ناشناس) شده است. تاریخچهٔ جلسه، حضور و امتیاز او با عنوان «کاربر حذف‌شده» می‌ماند.</NoticeBanner>{/if}

  <section class="stats" aria-label="خلاصهٔ فعالیت">
    <div class="stat"><span class="n">{formatNumber(u.points.total)}</span><span class="l">امتیاز</span></div>
    <div class="stat"><span class="n">{formatNumber(u.points.badges)}</span><span class="l">نشان</span></div>
    <div class="stat"><span class="n">{formatNumber(u.sessions.created)}</span><span class="l">جلسهٔ ساخته‌شده</span></div>
    <div class="stat"><span class="n">{formatNumber(u.sessions.memberships)}</span><span class="l">عضویت در جلسه</span></div>
    <div class="stat"><span class="n">{formatNumber(u.sessions.attended)}</span><span class="l">حضور ثبت‌شده</span></div>
  </section>

  <section class="card" aria-labelledby="dv-h">
    <div class="sec-head">
      <h2 id="dv-h">دستگاه‌ها و نشست‌ها <span class="muted fa-small">({formatNumber(u.activeSessions)} فعال)</span></h2>
      {#if canManage && !isDeleted && u.activeSessions > 0}<Button variant="secondary" size="sm" onclick={() => (logoutAsk = true)}><Icon name="logout" size={18} />خروج از همه</Button>{/if}
    </div>
    {#if clientRows.length}
      <p class="pill-row" aria-label="نشست‌های فعال به تفکیک پنل">
        {#each clientRows as [c, n] (c)}<StatusChip tone="info">{clientLabel(c)}: {formatNumber(n)}</StatusChip>{/each}
      </p>
    {/if}
    {#if devices.status === 'ready' && devices.data}
      <DevicesList sessions={devices.data.items} busyId={busyDevice} canRevoke={canManage && !isDeleted} onrevoke={revokeDevice} />
    {:else if devices.status === 'error'}
      <NoticeBanner tone="error" role="alert">
        {devices.error}
        {#snippet action()}<Button variant="text" size="sm" onclick={loadDevices}>تلاش دوباره</Button>{/snippet}
      </NoticeBanner>
    {:else}
      <Skeleton h="64px" radius="var(--radius-md)" />
    {/if}
  </section>

  <section class="card" aria-labelledby="r-h">
    <h2 id="r-h">نقش‌های سیستم</h2>
    <p class="muted fa-small">نقش‌های سیستم حذف‌شدنی نیستند و هر کدام همیشه دست‌کم یک دارنده دارد.</p>
    <ul class="opts">
      {#each roleKeys as r (r)}
        {@const lockDev = r === 'developer' && !system.isDeveloper}
        <li>
          <label class="opt" class:off={!canAssign || lockDev || isDeleted}>
            <input type="checkbox" checked={selRoles.includes(r)} disabled={!canAssign || lockDev || isDeleted || saving !== null} onchange={() => toggleRole(r)} />
            <span>
              <strong>{ROLE_TITLE[r]}</strong>
              <span class="muted fa-small">
                {r === 'developer' ? 'دسترسی کامل فنی و سیستمی' : 'مدیریت سیستم، نقش‌ها و تنظیمات'}
                {#if lockDev}· فقط توسعه‌دهنده می‌تواند این نقش را تغییر دهد{/if}
              </span>
            </span>
          </label>
        </li>
      {/each}
    </ul>
    {#if roleError}<NoticeBanner tone="error" role="alert">{roleError}</NoticeBanner>{/if}
    {#if canAssign && !isDeleted}
      <div class="acts">
        <Button loading={saving === 'roles'} disabled={!rolesDirty} onclick={askRoles}>ذخیرهٔ نقش‌ها</Button>
        {#if rolesDirty}<Button variant="text" onclick={() => ((selRoles = [...u.roles]), (roleError = null))}>بازگرداندن</Button>{/if}
      </div>
      <p class="muted fa-small"><Icon name="shield" size={16} /> ذخیره نیازمند تأیید هویت با کد پیامکی است.</p>
    {/if}
  </section>

  <section class="card" aria-labelledby="g-h">
    <h2 id="g-h">مجوز مستقیم کاربر</h2>
    <label class="opt" class:off={!canAssign || isDeleted}>
      <input type="checkbox" bind:checked={selGrant} disabled={!canAssign || isDeleted || saving !== null} />
      <span>
        <strong>ساخت جلسه</strong>
        <span class="muted fa-small">کاربر می‌تواند جلسه بسازد و مدیر آن شود. (از ماتریس نقش جدا و مستقیماً به کاربر داده می‌شود.)</span>
      </span>
    </label>
    {#if canAssign && !isDeleted}
      <div class="acts"><Button loading={saving === 'grants'} disabled={!grantDirty} onclick={saveGrant}>ذخیرهٔ مجوز</Button></div>
    {/if}
  </section>

  <NoticeBanner tone="info">تغییر نقش و مجوز با outbox به low و mid منتشر می‌شود. کاربر آن را از نشست بعدی (حداکثر ۱۵ دقیقه، با تمدید توکن) می‌بیند.</NoticeBanner>

  <ConfirmDialog
    bind:open={confirmRoles}
    title="برداشتن نقش"
    message={`نقش «${removing.map((r) => ROLE_TITLE[r]).join('، ')}» از ${displayName} برداشته می‌شود${isSelf ? ' — این نقش خودِ شماست و ممکن است دسترسی خود را از دست بدهید' : ''}.`}
    confirmLabel="برداشتن و ذخیره"
    destructive
    onconfirm={saveRoles}
  />
  <ConfirmDialog
    bind:open={statusAsk}
    title={u.status === 'active' ? 'غیرفعال‌کردن کاربر' : 'فعال‌کردن کاربر'}
    message={u.status === 'active' ? `«${displayName}» از همهٔ دستگاه‌ها خارج می‌شود و تا فعال‌سازی دوباره نمی‌تواند وارد شود.` : `«${displayName}» دوباره می‌تواند وارد شود.`}
    confirmLabel={u.status === 'active' ? 'غیرفعال‌کردن' : 'فعال‌کردن'}
    destructive={u.status === 'active'}
    onconfirm={toggleStatus}
  />
  <ConfirmDialog bind:open={clearAsk} title="حذف رمز کاربر" message={`رمز «${displayName}» حذف می‌شود و از این پس فقط با کد پیامکی وارد می‌شود.`} confirmLabel="حذف رمز" destructive onconfirm={clearPassword} />
  <ConfirmDialog bind:open={logoutAsk} title="خروج از همهٔ دستگاه‌ها" message={`همهٔ نشست‌های «${displayName}» در وب و اندروید پایان می‌یابد.`} confirmLabel="خروج از همه" destructive onconfirm={logoutAll} />

  <TypeConfirmDialog bind:open={deleteOpen} title="حذف کاربر" phrase={u.name || 'حذف'} confirmLabel="حذف دائمی کاربر" onconfirm={deleteUser} error={deleteError}>
    حذف «{displayName}» <strong>برگشت‌ناپذیر</strong> است: نام، شماره و رمز او پاک و ناشناس می‌شود، همهٔ نشست‌ها پایان می‌یابد و نقش‌ها و مجوزها برداشته می‌شود. تاریخچهٔ جلسه، حضور و امتیاز با عنوان «کاربر حذف‌شده» می‌ماند. شمارهٔ او می‌تواند دوباره به‌عنوان کاربر تازه ثبت‌نام کند.
  </TypeConfirmDialog>

  <UserFormDialog bind:open={editOpen} user={u} onsaved={(r) => (user.data = r)} />
  <TempPasswordDialog bind:open={pwOpen} userId={u.id} userName={displayName} ondone={() => void load()} />
{:else if user.status === 'error'}
  <EmptyState icon={user.offline ? 'wifi-off' : 'alert'} tone="error" title="کاربر بارگذاری نشد" message={user.error ?? ''}>
    {#snippet action()}
      <Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>
      <Button variant="text" href={withBase('/users')}>بازگشت</Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="stack" aria-hidden="true">
    <Skeleton h="130px" radius="var(--radius-lg)" />
    <Skeleton h="90px" radius="var(--radius-lg)" />
    <Skeleton h="220px" radius="var(--radius-lg)" />
  </div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{/if}

<style>
  .stack {
    display: grid;
    gap: var(--space-md);
  }
  .card {
    margin-bottom: var(--space-md);
  }
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .meta {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .meta h2 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }
  .num {
    text-align: right;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-lg);
    margin: 0;
    font-size: var(--fs-sm);
  }
  .facts div {
    display: flex;
    gap: 6px;
  }
  dt {
    color: var(--color-muted);
  }
  dd {
    margin: 0;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-sm);
    margin: var(--space-md) 0;
  }
  @media (min-width: 720px) {
    .stats {
      grid-template-columns: repeat(5, 1fr);
    }
  }
  .stat {
    display: grid;
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  .stat .n {
    font-size: var(--fs-xl);
    font-weight: 700;
  }
  .stat .l {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .sec-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
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
