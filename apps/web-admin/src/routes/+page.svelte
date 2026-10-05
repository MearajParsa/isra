<script lang="ts">
  import { withBase } from '$lib/utils/paths';
  import { api } from '$lib/api';
  import type { Overview } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { auditLabel } from '$lib/utils/audit';
  import { formatNumber, formatRelative } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';

  const ov = new Resource<Overview>();
  const load = () => ov.load(() => auth.withAuth((t) => api.system.overview(t)));
  $effect(() => {
    void load();
  });

  const cards = $derived<{ icon: IconName; label: string; value: number; hint?: string; href?: string; hot?: boolean }[]>(
    ov.data
      ? [
          { icon: 'users', label: 'کاربران', value: ov.data.users.total, href: system.can('system.users.view') ? withBase('/users') : undefined },
          { icon: 'shield', label: 'دارندگان نقش سیستم', value: ov.data.users.admins, href: system.can('system.users.view') ? withBase('/users') : undefined },
          { icon: 'mic', label: 'جلسهٔ در حال برگزاری', value: ov.data.sessions.started, hot: ov.data.sessions.started > 0 },
          { icon: 'calendar', label: 'جلسهٔ پیش‌رو', value: ov.data.sessions.scheduled },
          { icon: 'clock', label: 'جلسهٔ پایان‌یافته', value: ov.data.sessions.ended },
          { icon: 'info', label: 'پیش‌نویس', value: ov.data.sessions.draft }
        ]
      : []
  );
</script>

<svelte:head><title>نمای کلی — مدیریت اسراء</title></svelte:head>

<PageHeader title={`سلام${system.me ? `، ${system.me.user.name.split(' ')[0]}` : ''}`} subtitle="خلاصهٔ وضعیت سیستم و آخرین اقدام‌های مدیریتی." />

{#if ov.status === 'ready' && ov.data}
  <ul class="cards">
    {#each cards as c (c.label)}
      <li>
        <svelte:element this={c.href ? 'a' : 'div'} class="card" class:hot={c.hot} href={c.href}>
          <span class="ico"><Icon name={c.icon} size={24} /></span>
          <span class="num">{formatNumber(c.value)}</span>
          <span class="lbl">{c.label}</span>
        </svelte:element>
      </li>
    {/each}
  </ul>

  <section class="audit" aria-labelledby="la-h">
    <div class="sec-head">
      <h2 id="la-h">آخرین اقدام‌ها</h2>
      {#if system.can('system.audit.view')}<a class="all" href={withBase('/audit')}>همهٔ گزارش‌ها<Icon name="chevron-left" size={18} /></a>{/if}
    </div>
    {#if ov.data.lastAudit.length === 0}
      <EmptyState icon="list" compact title="اقدامی ثبت نشده" message={system.can('system.audit.view') ? 'اقدام‌های مدیریتی اینجا نمایش داده می‌شود.' : 'دسترسی به گزارش‌ها برای نقش شما فعال نیست.'} />
    {:else}
      <ul class="list">
        {#each ov.data.lastAudit as a (a.id)}
          <li class="row">
            <span class="tag">{auditLabel(a.action)}</span>
            <span class="txt">{a.summary}</span>
            <span class="muted meta">{a.actor.name} · {formatRelative(a.at)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else if ov.status === 'error'}
  <EmptyState icon={ov.offline ? 'wifi-off' : 'alert'} tone="error" title="نمای کلی بارگذاری نشد" message={ov.error ?? ''}>
    {#snippet action()}<Button variant="secondary" onclick={load}><Icon name="refresh" size={18} />تلاش دوباره</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="cards" aria-hidden="true">
    {#each [0, 1, 2, 3, 4, 5] as i (i)}<Skeleton h="120px" radius="var(--radius-lg)" />{/each}
  </div>
  <span class="sr-only" role="status">در حال بارگذاری…</span>
{/if}

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-md);
  }
  @media (min-width: 900px) {
    .cards {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .card {
    display: grid;
    gap: 2px;
    height: 100%;
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
    color: inherit;
    text-decoration: none;
    box-shadow: var(--elev-1);
  }
  a.card:hover {
    border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-outline));
    transform: translateY(-1px);
  }
  .card.hot {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-bottom: var(--space-sm);
    border-radius: var(--radius-md);
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .hot .ico {
    background: var(--color-turquoise);
  }
  .num {
    font-size: var(--fs-xxl);
    font-weight: 700;
    line-height: 1.3;
  }
  .lbl {
    font-size: var(--fs-sm);
    opacity: 0.85;
  }
  .audit {
    margin-top: var(--space-2xl);
  }
  .sec-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }
  .all {
    display: inline-flex;
    align-items: center;
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .list {
    display: grid;
    gap: var(--space-sm);
  }
  .row {
    display: grid;
    gap: 4px var(--space-md);
    grid-template-columns: auto 1fr;
    align-items: center;
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
  }
  .tag {
    padding: 1px 10px;
    border-radius: var(--radius-pill);
    background: var(--color-primary-tint);
    color: var(--color-primary);
    font-size: var(--fs-xs);
    font-weight: 700;
    white-space: nowrap;
  }
  .meta {
    grid-column: 1 / -1;
    font-size: var(--fs-xs);
  }
  @media (min-width: 720px) {
    .row {
      grid-template-columns: 11rem 1fr auto;
    }
    .meta {
      grid-column: auto;
    }
  }
</style>
