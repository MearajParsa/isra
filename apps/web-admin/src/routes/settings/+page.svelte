<script lang="ts">
  import { api, ApiError, type FlagKey, type SystemSettings } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage, fieldErrors } from '$lib/utils/errors';
  import { formatDateTime, formatNumber } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import { withStepUp } from '$lib/utils/stepup';
  import { validateSettings } from '$lib/utils/settingsRules';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

  const res = new Resource<SystemSettings>();
  const load = () => res.load(() => auth.withAuth((t) => api.system.settings(t)));
  $effect(() => {
    void load();
  });

  const canEdit = $derived(system.can('system.settings.edit'));

  // ۱.۷.۰: evalWeights (⇒ معیارهای ارزیابی H-100..H-103) و badgeThresholds (⇒ نشان‌ها) از تنظیمات حذف شدند؛ فقط پرچم‌ها
  let flags = $state<Record<FlagKey, boolean>>({ maintenance_mode: false, registration_open: true });
  let errors = $state<Record<string, string>>({});
  let formError = $state<string | null>(null);
  let stale = $state(false);
  let saving = $state(false);
  let confirm = $state(false);

  function sync(s: SystemSettings) {
    flags = { ...s.flags };
    errors = {};
    formError = null;
    stale = false;
  }
  $effect(() => {
    if (res.data) sync(res.data);
  });

  const input = $derived({ version: res.data?.version ?? 0, flags });
  const liveErrors = $derived(res.data ? validateSettings(input) : {});

  const dirty = $derived(res.data ? JSON.stringify(flags) !== JSON.stringify(res.data.flags) : false);

  const changes = $derived.by(() => {
    const s = res.data;
    if (!s) return [] as string[];
    const out: string[] = [];
    if (flags.maintenance_mode !== s.flags.maintenance_mode) out.push(`حالت نگهداری: ${flags.maintenance_mode ? 'روشن' : 'خاموش'}`);
    if (flags.registration_open !== s.flags.registration_open) out.push(`ثبت‌نام کاربر جدید: ${flags.registration_open ? 'باز' : 'بسته'}`);
    return out;
  });

  function ask() {
    errors = liveErrors;
    formError = null;
    if (Object.keys(liveErrors).length) return;
    confirm = true;
  }

  async function save() {
    saving = true;
    try {
      const out = await withStepUp((su) => auth.withAuth((t) => api.system.updateSettings(t, input, su)));
      if (out) {
        res.data = out;
        toasts.success('تنظیمات ذخیره شد و برای mid و low منتشر می‌شود.');
      }
    } catch (e) {
      errors = fieldErrors(e);
      if (e instanceof ApiError && e.code === 'CONFLICT' && e.details.reason === 'VERSION_MISMATCH') {
        stale = true;
        formError = e.message;
      } else if (Object.keys(errors).length === 0) formError = errorMessage(e);
    } finally {
      saving = false;
    }
  }

  const flagInfo: { key: FlagKey; title: string; text: string; danger?: boolean }[] = [
    { key: 'registration_open', title: 'ثبت‌نام کاربر جدید', text: 'اگر بسته شود، شماره‌های جدید نمی‌توانند حساب بسازند (کاربران فعلی وارد می‌شوند).' },
    { key: 'maintenance_mode', title: 'حالت نگهداری', text: 'برنامه‌های کاربری پیام «در حال نگهداری» نشان می‌دهند. فقط در زمان نگهداری روشن کنید.', danger: true }
  ];
</script>

<svelte:head><title>تنظیمات — مدیریت اسراء</title></svelte:head>

<PageHeader title="تنظیمات سراسری" subtitle="پرچم‌های داخلی سامانه." />

{#if res.status === 'ready' && res.data}
  {#if !canEdit}<NoticeBanner tone="info">ویرایش تنظیمات برای نقش شما فعال نیست؛ فقط می‌توانید مقادیر را ببینید.</NoticeBanner>{/if}
  {#if stale}
    <NoticeBanner tone="warning" role="alert">
      {formError}
      {#snippet action()}<Button size="sm" variant="secondary" onclick={load}>بارگذاری مجدد</Button>{/snippet}
    </NoticeBanner>
  {/if}

  <div class="stack">
    <section class="card" aria-labelledby="f-h">
      <h2 id="f-h">پرچم‌های داخلی</h2>
      <ul class="flags">
        {#each flagInfo as f (f.key)}
          <li>
            <label class="flag" class:danger={f.danger && flags[f.key]}>
              <input type="checkbox" role="switch" bind:checked={flags[f.key]} disabled={!canEdit || saving} />
              <span class="tx"><strong>{f.title}</strong><span class="muted small">{f.text}</span></span>
            </label>
          </li>
        {/each}
      </ul>
    </section>

    {#if formError && !stale}<NoticeBanner tone="error" role="alert">{formError}</NoticeBanner>{/if}

    <div class="foot">
      <p class="muted small">
        نسخهٔ {formatNumber(res.data.version)} · آخرین تغییر {formatDateTime(res.data.updatedAt)} توسط {res.data.updatedBy}
      </p>
      {#if canEdit}
        <div class="acts">
          <Button loading={saving} disabled={!dirty} onclick={ask}>ذخیرهٔ تنظیمات</Button>
          {#if dirty}<Button variant="text" onclick={() => sync(res.data!)}>بازگرداندن</Button>{/if}
        </div>
      {/if}
    </div>
  </div>

  <ConfirmDialog
    bind:open={confirm}
    title="تأیید تغییر تنظیمات"
    message={`این تغییرات برای همهٔ کاربران اعمال می‌شود:\n• ${changes.join('\n• ')}\n\nسپس برای تأیید هویت کدی پیامک می‌شود.`}
    confirmLabel="ادامه و تأیید هویت"
    destructive={flags.maintenance_mode && !res.data.flags.maintenance_mode}
    onconfirm={save}
  />
{:else if res.status === 'error'}
  <EmptyState icon={res.offline ? 'wifi-off' : 'alert'} tone="error" title="تنظیمات بارگذاری نشد" message={res.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="stack" aria-hidden="true">
    <Skeleton h="220px" radius="var(--radius-lg)" />
    <Skeleton h="180px" radius="var(--radius-lg)" />
  </div>
{/if}

<style>
  .stack {
    display: grid;
    gap: var(--space-md);
  }
  .card {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .small {
    font-size: var(--fs-sm);
  }
  .flags {
    display: grid;
    gap: var(--space-sm);
  }
  .flag {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-md);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .flag.danger {
    border-color: var(--color-error);
    background: var(--color-error-tint);
  }
  .flag input {
    width: 22px;
    height: 22px;
    margin-top: 4px;
    accent-color: var(--color-accent);
  }
  .tx {
    display: grid;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
  }
</style>
