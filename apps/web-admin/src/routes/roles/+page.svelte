<script lang="ts">
  import { api, type PermissionInfo, type PermissionKey, type SystemRole, type SystemRoleKey } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import { errorMessage } from '$lib/utils/errors';
  import { formatNumber } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import { withStepUp } from '$lib/utils/stepup';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';

  const data = new Resource<{ roles: SystemRole[]; perms: PermissionInfo[] }>();
  const load = () =>
    data.load(async () => {
      const [roles, perms] = await Promise.all([
        auth.withAuth((t) => api.system.roles(t)),
        auth.withAuth((t) => api.system.permissions(t))
      ]);
      return { roles, perms };
    });
  $effect(() => {
    void load();
  });

  /** ماتریس در حال ویرایش (فقط super_admin قابل ویرایش است) */
  let draft = $state<Record<SystemRoleKey, PermissionKey[]>>({ developer: [], super_admin: [] });
  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (data.data) for (const r of data.data.roles) draft[r.key] = [...r.permissions];
  });

  const canEdit = $derived(system.can('system.permission.edit'));
  const dirty = $derived(
    data.data
      ? data.data.roles.some((r) => r.key !== 'developer' && [...r.permissions].sort().join() !== [...draft[r.key]].sort().join())
      : false
  );

  function toggle(role: SystemRole, p: PermissionKey) {
    if (role.key === 'developer' || role.lockedPermissions.includes(p) || !canEdit) return;
    draft[role.key] = draft[role.key].includes(p) ? draft[role.key].filter((x) => x !== p) : [...draft[role.key], p];
    error = null;
  }

  async function save() {
    const sa = data.data?.roles.find((r) => r.key === 'super_admin');
    if (!sa) return;
    saving = true;
    error = null;
    try {
      const res = await withStepUp((su) => auth.withAuth((t) => api.system.setRolePermissions(t, 'super_admin', draft.super_admin, su)));
      if (res) {
        toasts.success('ماتریس مجوز ذخیره شد و برای low و mid منتشر می‌شود.');
        await Promise.all([load(), system.load(true)]);
      }
    } catch (e) {
      error = errorMessage(e);
    } finally {
      saving = false;
    }
  }

  const groups = $derived(
    data.data
      ? [
          { id: 'system', title: 'مجوزهای سیستم', items: data.data.perms.filter((p) => p.group === 'system') },
          { id: 'session', title: 'مجوز سطح کاربر', items: data.data.perms.filter((p) => p.group === 'session') }
        ]
      : []
  );

  // ماتریس نقش‌های جلسه (۱.۷.۰، docs-v2/31 §۲) — فقط نمایش؛ 'd' = فقط با مجوز واگذارشده از استاد
  const sessionRoles = ['استاد صاحب جلسه', 'پشتیبان', 'قرآن‌آموز'];
  const sessionMatrix: { action: string; v: (boolean | 'd')[] }[] = [
    { action: 'ویرایش و تغییر وضعیت جلسه', v: [true, 'd', false] },
    { action: 'تأیید عضویت', v: [true, 'd', false] },
    { action: 'افزودن/حذف عضو', v: [true, 'd', false] },
    { action: 'مدیریت صف', v: [true, 'd', false] },
    { action: 'ثبت ارزیابی', v: [true, 'd', false] },
    { action: 'تعیین پشتیبان', v: [true, false, false] },
    { action: 'حضور و پیوستن به صف', v: [false, false, true] }
  ];
</script>

<svelte:head><title>نقش‌ها و مجوزها — مدیریت اسراء</title></svelte:head>

<PageHeader title="نقش‌ها و مجوزها" subtitle="نقش‌های سیستم حذف‌شدنی نیستند؛ فقط مجوزهای قفل‌نشدهٔ «مدیر کل» قابل تغییرند." />

{#if data.status === 'ready' && data.data}
  <ul class="roles">
    {#each data.data.roles as r (r.key)}
      <li class="role">
        <div class="rh">
          <h2>{r.title}</h2>
          <span class="badge"><Icon name="lock" size={14} />حذف‌ناپذیر</span>
        </div>
        <p class="muted">{r.description}</p>
        <p class="muted small">{formatNumber(r.holders)} دارنده · {formatNumber(r.permissions.length)} مجوز</p>
      </li>
    {/each}
  </ul>

  <section class="matrix" aria-labelledby="m-h">
    <h2 id="m-h">ماتریس مجوز نقش‌های سیستم</h2>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">مجوز</th>
            {#each data.data.roles as r (r.key)}<th scope="col" class="c">{r.title}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each groups as g (g.id)}
            <tr class="grp"><th colspan={1 + data.data.roles.length} scope="colgroup">{g.title}</th></tr>
            {#each g.items as p (p.key)}
              <tr>
                <th scope="row">
                  <span>{p.title}</span>
                  <code dir="ltr">{p.key}</code>
                </th>
                {#each data.data.roles as r (r.key)}
                  {@const locked = r.key === 'developer' || r.lockedPermissions.includes(p.key)}
                  <td class="c">
                    <label class="chk" class:locked>
                      <input
                        type="checkbox"
                        checked={draft[r.key].includes(p.key)}
                        disabled={locked || !canEdit || saving}
                        aria-label={`${p.title} برای ${r.title}`}
                        onchange={() => toggle(r, p.key)}
                      />
                      {#if locked}<Icon name="lock" size={14} class="lk" />{/if}
                    </label>
                  </td>
                {/each}
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
    </div>
    <p class="muted small"><Icon name="lock" size={14} /> مجوزهای قفل‌شده برداشته نمی‌شوند؛ ماتریس «توسعه‌دهنده» ثابت است.</p>

    {#if error}<NoticeBanner tone="error" role="alert">{error}</NoticeBanner>{/if}
    {#if canEdit}
      <div class="acts">
        <Button loading={saving} disabled={!dirty} onclick={save}>ذخیرهٔ ماتریس</Button>
        {#if dirty}<Button variant="text" onclick={load}>بازگرداندن</Button>{/if}
      </div>
      <p class="muted small"><Icon name="shield" size={14} /> ذخیره نیازمند تأیید هویت با کد پیامکی است.</p>
    {:else}
      <NoticeBanner tone="info">ویرایش ماتریس برای نقش شما فعال نیست.</NoticeBanner>
    {/if}
  </section>

  <section class="matrix" aria-labelledby="s-h">
    <h2 id="s-h">نقش‌های درون جلسه (فقط نمایش)</h2>
    <p class="muted small">این مجوزها از نقش جلسه می‌آید و در این پنل تغییر نمی‌کند. استاد صاحب جلسه همهٔ مجوزها را دارد؛ پشتیبان فقط مجوزهایی که استاد (یا ادمین) به او واگذار کرده است.</p>
    <div class="scroll">
      <table>
        <thead>
          <tr><th scope="col">اقدام</th>{#each sessionRoles as r (r)}<th scope="col" class="c">{r}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each sessionMatrix as row (row.action)}
            <tr>
              <th scope="row">{row.action}</th>
              {#each row.v as v, i (i)}
                <td class="c">{#if v === 'd'}<span class="muted small">با مجوز</span>{:else if v}<Icon name="check" size={18} class="yes" /><span class="sr-only">دارد</span>{:else}<span class="no" aria-hidden="true">—</span><span class="sr-only">ندارد</span>{/if}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{:else if data.status === 'error'}
  <EmptyState icon={data.offline ? 'wifi-off' : 'alert'} tone="error" title="نقش‌ها بارگذاری نشد" message={data.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="sk" aria-hidden="true">
    <Skeleton h="110px" radius="var(--radius-lg)" />
    <Skeleton h="320px" radius="var(--radius-lg)" />
  </div>
{/if}

<style>
  .roles {
    display: grid;
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
  }
  @media (min-width: 720px) {
    .roles {
      grid-template-columns: 1fr 1fr;
    }
  }
  .role {
    display: grid;
    gap: 4px;
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .rh {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 10px;
    border-radius: var(--radius-pill);
    background: var(--color-neutral);
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-weight: 700;
  }
  .small {
    font-size: var(--fs-sm);
  }
  .matrix {
    display: grid;
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 28rem;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 10px var(--space-sm);
    border-bottom: 1px solid var(--color-outline);
    text-align: start;
    vertical-align: middle;
  }
  thead th {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  tbody th[scope='row'] {
    font-weight: 400;
  }
  tbody th[scope='row'] span {
    display: block;
    font-weight: 700;
  }
  code {
    display: block;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-align: right;
  }
  .c {
    text-align: center;
    width: 7rem;
  }
  .grp th {
    padding-top: var(--space-md);
    font-size: var(--fs-sm);
    color: var(--color-accent);
    border-bottom: 2px solid var(--color-accent-tint);
  }
  .chk {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-content: center;
  }
  .chk input {
    width: 22px;
    height: 22px;
    accent-color: var(--color-accent);
  }
  .chk.locked input {
    cursor: not-allowed;
  }
  :global(.lk) {
    color: var(--color-gray);
  }
  :global(.yes) {
    color: var(--color-accent);
  }
  .no {
    color: var(--color-gray);
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
  }
  .sk {
    display: grid;
    gap: var(--space-md);
  }
</style>
