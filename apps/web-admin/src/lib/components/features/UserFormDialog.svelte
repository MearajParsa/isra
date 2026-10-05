<script lang="ts">
  import { api, type Grant, type SystemRoleKey, type SystemUserDetail } from '$lib/api';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { stepped, describeError } from '$lib/utils/adminCall';
  import { fieldErrors } from '$lib/utils/errors';
  import { ApiError } from '$lib/api/types';
  import { normalizePhone } from '$lib/utils/phone';
  import { passwordError } from '$lib/utils/password';
  import { ROLE_TITLE } from '$lib/utils/audit';
  import { withBase } from '$lib/utils/paths';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import PhoneField from '$lib/components/ui/PhoneField.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import PasswordGenerator from './PasswordGenerator.svelte';
  import SecretReveal from './SecretReveal.svelte';

  interface Props {
    open?: boolean;
    /** edit: با کاربر موجود */
    user?: SystemUserDetail | null;
    onsaved?: (u: SystemUserDetail) => void;
  }
  let { open = $bindable(false), user = null, onsaved }: Props = $props();

  const editing = $derived(!!user);
  let firstName = $state('');
  let lastName = $state('');
  let phone = $state('');
  let withPassword = $state(false);
  let password = $state('');
  let roles = $state<SystemRoleKey[]>([]);
  let grantCreate = $state(false);
  let errors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);
  let busy = $state(false);
  let created = $state<{ user: SystemUserDetail; password: string | null } | null>(null);

  // هر بار باز شدن فرم را از نو مقداردهی می‌کنیم
  $effect(() => {
    if (!open) return;
    firstName = user?.firstName ?? '';
    lastName = user?.lastName ?? '';
    phone = user?.phone ?? '';
    withPassword = false;
    password = '';
    roles = [];
    grantCreate = false;
    errors = {};
    formError = null;
    created = null;
  });

  const canRoles = $derived(system.can('system.role.assign'));
  const phoneLocked = $derived(editing && !/^09\d{9}$/.test(user?.phone ?? ''));

  function toggleRole(r: SystemRoleKey) {
    roles = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    formError = null;
    const fn = firstName.trim();
    const ln = lastName.trim();
    const ph = phoneLocked ? null : normalizePhone(phone);
    if (fn.length < 2 || fn.length > 40) errors.firstName = 'نام باید ۲ تا ۴۰ نویسه باشد.';
    if (ln.length < 2 || ln.length > 40) errors.lastName = 'نام خانوادگی باید ۲ تا ۴۰ نویسه باشد.';
    if (!phoneLocked && !ph) errors.phone = 'شمارهٔ موبایل معتبر نیست؛ مثل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.';
    if (!editing && withPassword) {
      const pe = passwordError(password);
      if (pe) errors.password = pe;
    }
    if (Object.keys(errors).length) return;

    busy = true;
    try {
      if (user) {
        const body: { firstName?: string; lastName?: string; phone?: string } = {};
        if (fn !== user.firstName) body.firstName = fn;
        if (ln !== user.lastName) body.lastName = ln;
        if (ph && ph !== user.phone) body.phone = ph;
        if (Object.keys(body).length === 0) {
          open = false;
          return;
        }
        const res = await stepped((t, su) => api.system.updateUser(t, user.id, body, su));
        if (!res) return;
        toasts.success('اطلاعات کاربر ذخیره شد.');
        open = false;
        onsaved?.(res);
      } else {
        const grants: Grant[] = grantCreate ? ['session.create'] : [];
        const input = { phone: ph!, firstName: fn, lastName: ln, ...(withPassword ? { password } : {}), ...(canRoles && roles.length ? { roles } : {}), ...(canRoles && grants.length ? { grants } : {}) };
        const res = await stepped((t, su) => api.system.createUser(t, input, su));
        if (!res) return;
        toasts.success('کاربر ساخته شد.');
        onsaved?.(res);
        if (withPassword) created = { user: res, password };
        else open = false;
      }
    } catch (err) {
      const f = fieldErrors(err);
      if (err instanceof ApiError && err.code === 'CONFLICT' && err.reason === 'PHONE_TAKEN') errors.phone = describeError(err);
      else if (Object.keys(f).length) errors = f;
      else formError = describeError(err);
    } finally {
      busy = false;
    }
  }
</script>

<Sheet bind:open title={created ? 'کاربر ساخته شد' : editing ? 'ویرایش کاربر' : 'کاربر جدید'} dismissible={!busy}>
  {#if created}
    <NoticeBanner tone="success">حساب «{created.user.name}» ساخته شد. رمز موقت را به کاربر برسانید؛ او باید در اولین ورود رمز را عوض کند.</NoticeBanner>
    <SecretReveal secret={created.password ?? ''} />
    <NoticeBanner tone="warning">این رمز فقط همین یک بار نمایش داده می‌شود و بعداً قابل مشاهده نیست.</NoticeBanner>
    <div class="acts">
      <Button href={withBase(`/users/${created.user.id}`)} onclick={() => (open = false)} full>مشاهدهٔ کاربر</Button>
      <Button variant="secondary" onclick={() => (open = false)} full>بستن</Button>
    </div>
  {:else}
    <form class="f" onsubmit={submit} novalidate>
      <div class="two">
        <TextField label="نام" bind:value={firstName} error={errors.firstName} disabled={busy} required maxlength={40} autocomplete="off" />
        <TextField label="نام خانوادگی" bind:value={lastName} error={errors.lastName} disabled={busy} required maxlength={40} autocomplete="off" />
      </div>
      <PhoneField bind:value={phone} error={errors.phone} disabled={busy || phoneLocked} />
      {#if editing}
        <NoticeBanner tone="info">تغییر شمارهٔ موبایل همهٔ نشست‌های کاربر را پایان نمی‌دهد؛ ورود بعدی او با شمارهٔ جدید خواهد بود.</NoticeBanner>
      {:else}
        <label class="chk">
          <input type="checkbox" bind:checked={withPassword} disabled={busy} />
          <span><strong>تعیین رمز موقت</strong><span class="muted fa-small">بدون رمز، کاربر فقط با کد پیامکی وارد می‌شود.</span></span>
        </label>
        {#if withPassword}<PasswordGenerator bind:value={password} error={errors.password} disabled={busy} />{/if}

        {#if canRoles}
          <fieldset class="roles">
            <legend>نقش و مجوز (اختیاری)</legend>
            {#each ['developer', 'super_admin'] as r (r)}
              {@const lock = r === 'developer' && !system.isDeveloper}
              <label class="chk" class:off={lock}>
                <input type="checkbox" checked={roles.includes(r as SystemRoleKey)} disabled={busy || lock} onchange={() => toggleRole(r as SystemRoleKey)} />
                <span><strong>{ROLE_TITLE[r]}</strong>{#if lock}<span class="muted fa-small">فقط توسعه‌دهنده می‌تواند این نقش را بدهد.</span>{/if}</span>
              </label>
            {/each}
            <label class="chk">
              <input type="checkbox" bind:checked={grantCreate} disabled={busy} />
              <span><strong>مجوز ساخت جلسه</strong></span>
            </label>
          </fieldset>
        {/if}
      {/if}

      {#if formError}<NoticeBanner tone="error" role="alert">{formError}</NoticeBanner>{/if}
      <p class="muted fa-small"><span>ذخیره نیازمند تأیید هویت با کد پیامکی است.</span></p>
      <div class="acts">
        <Button type="submit" loading={busy} full>{editing ? 'ذخیرهٔ تغییرات' : 'ساخت کاربر'}</Button>
        <Button variant="secondary" disabled={busy} onclick={() => (open = false)} full>انصراف</Button>
      </div>
    </form>
  {/if}
</Sheet>

<style>
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
  .chk {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .chk.off {
    background: var(--color-neutral);
    cursor: not-allowed;
  }
  .chk input {
    width: 22px;
    height: 22px;
    margin-top: 4px;
    accent-color: var(--color-accent);
  }
  .chk > span {
    display: grid;
  }
  .roles {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    padding: 0;
    margin-bottom: var(--space-sm);
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .acts {
    display: grid;
    gap: var(--space-sm);
  }
  @media (min-width: 640px) {
    .acts {
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
    }
  }
</style>
