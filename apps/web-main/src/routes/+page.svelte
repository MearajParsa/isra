<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import type { InboxItem, PointsSummary } from '$lib/api/types';
  import { midApi } from '$lib/api';
  import type { MySessionItem } from '$lib/api/mid-types';
  import { auth } from '$lib/auth/auth.svelte';
  import { Resource } from '$lib/utils/resource.svelte';
  import { formatDate, formatNumber } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';
  import GuestLanding from '$lib/components/features/GuestLanding.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import SessionCard from '$lib/components/features/SessionCard.svelte';
  import SessionCardSkeleton from '$lib/components/features/SessionCardSkeleton.svelte';
  import PointsSummaryCard from '$lib/components/features/PointsSummaryCard.svelte';
  import InboxItemRow from '$lib/components/features/InboxItemRow.svelte';
  import PwaInstallBanner from '$lib/components/layout/PwaInstallBanner.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';

  let { data } = $props();

  const points = new Resource<PointsSummary>();
  const inbox = new Resource<InboxItem[]>();
  const mine = new Resource<MySessionItem[]>();

  $effect(() => {
    if (auth.status === 'member') {
      void points.load(() => auth.withAuth((t) => api.me.points(t)));
      void inbox.load(async () => (await auth.withAuth((t) => api.me.inbox(t, { pageSize: 3 }))).items);
      void mine.load(() => auth.withAuth((t) => midApi.me.sessions(t, 'all')));
    }
  });

  const isMember = $derived(auth.status === 'member');
  const liveNow = $derived((mine.data ?? []).filter((i) => i.session.status === 'started' && i.membership === 'approved'));
  const today = formatDate(new Date().toISOString());
</script>

<svelte:head>
  <title>اسراء — پلتفرم جلسات قرآن</title>
    <meta
      name="description"
      content="اسراء پلتفرم جلسات قرآن است: عضویت در جلسات، حضور، نوبت قرائت، ارزیابی صوت، لحن و تجوید، امتیاز و نشان."
    />
    <meta property="og:title" content="اسراء — پلتفرم جلسات قرآن" />
    <meta property="og:description" content="با هم بخوانیم، با هم پیش برویم." />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="fa_IR" />
</svelte:head>

{#snippet sessionsSection()}
  <section class="section container" aria-labelledby="sessions-h">
    <div class="sec-head">
      <h2 id="sessions-h">جلسات در دسترس</h2>
      <a class="all" href="/sessions">مشاهدهٔ همهٔ جلسات<Icon name="chevron-left" size={18} /></a>
    </div>
    {#if data.sessions && data.sessions.items.length > 0}
      <div class="grid">
        {#each data.sessions.items as s (s.id)}
          <SessionCard session={s} />
        {/each}
      </div>
    {:else if data.sessionsError}
      <EmptyState icon="alert" tone="error" title="بارگذاری جلسات ممکن نشد" message={data.sessionsError} compact>
        {#snippet action()}
          <Button variant="secondary" onclick={() => invalidateAll()}><Icon name="refresh" size={18} />تلاش دوباره</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <EmptyState icon="calendar" title="هنوز جلسه‌ای ثبت نشده" message="به‌محض اعلام جلسهٔ جدید اینجا می‌بینید." compact />
    {/if}
  </section>
{/snippet}

{#if isMember}
  <!-- ─── نسخهٔ عضو: داشبورد ─── -->
  <div class="container dash">
    <div class="greet">
      <p class="muted">{today}</p>
      <h1>سلام{auth.me?.profile.firstName ? `، ${auth.me.profile.firstName}` : ''}</h1>
      <p class="muted">خوش آمدید؛ این هم خلاصهٔ امروز شما.</p>
    </div>

    {#if liveNow.length > 0}
      <ul class="livenow">
        {#each liveNow as i (i.session.id)}
          <li class="live-card">
            <span class="pulse" aria-hidden="true"></span>
            <div class="lt">
              <strong>{i.session.title}</strong>
              <span class="muted">اکنون در حال برگزاری است</span>
            </div>
            <Button size="sm" variant="warm" href={`/sessions/${i.session.id}/live`}>ورود به اتاق</Button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="cols">
      <div class="col">
        {#if points.status === 'ready' && points.data}
          <PointsSummaryCard points={points.data} href="/points" />
        {:else if points.status === 'error'}
          <EmptyState icon="alert" tone="error" title="امتیاز بارگذاری نشد" message={points.error ?? ''} compact>
            {#snippet action()}
              <Button variant="secondary" size="sm" onclick={() => points.load(() => auth.withAuth((t) => api.me.points(t)))}>تلاش دوباره</Button>
            {/snippet}
          </EmptyState>
        {:else}
          <div class="sk-card" aria-hidden="true">
            <Skeleton w="56px" h="56px" radius="50%" />
            <Skeleton w="50%" h="28px" />
            <Skeleton h="8px" radius="999px" />
          </div>
        {/if}
      </div>

      <div class="col">
        <div class="mini-head">
          <h2>اینباکس</h2>
          <a class="all" href="/inbox">
            {#if auth.unread > 0}{formatNumber(auth.unread)} پیام خوانده‌نشده{:else}مشاهدهٔ همه{/if}
            <Icon name="chevron-left" size={18} />
          </a>
        </div>
        {#if inbox.status === 'ready' && inbox.data}
          {#if inbox.data.length === 0}
            <EmptyState icon="bell" title="پیام جدیدی ندارید" message="اعلان‌های عضویت، نوبت و ارزیابی اینجا نشان داده می‌شود." compact />
          {:else}
            <ul class="inbox-list">
              {#each inbox.data as item (item.id)}
                <InboxItemRow {item} onopen={() => goto('/inbox')} />
              {/each}
            </ul>
          {/if}
        {:else if inbox.status === 'error'}
          <EmptyState icon="alert" tone="error" title="اینباکس بارگذاری نشد" message={inbox.error ?? ''} compact />
        {:else}
          <div class="sk-list" aria-hidden="true">
            {#each [0, 1, 2] as i (i)}<Skeleton h="72px" radius="var(--radius-md)" />{/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  {@render sessionsSection()}

  <div class="container pwa"><PwaInstallBanner /></div>
{:else}
  <!-- ─── نسخهٔ guest: صفحهٔ معرفی (SSR، scroll-craft) ─── -->
  <GuestLanding sessions={data.sessions} sessionsError={data.sessionsError} />
  <div class="container pwa"><PwaInstallBanner /></div>
{/if}

<Footer />

<style>
  /* ─── sections ─── */
  .section {
    padding-block: var(--space-2xl) 0;
  }
  .sec-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }
  .all {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-weight: 700;
    font-size: var(--fs-sm);
    white-space: nowrap;
  }
  .grid {
    display: grid;
    gap: var(--space-md);
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 960px) {
    .grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .pwa {
    margin-top: var(--space-lg);
  }

  /* ─── داشبورد عضو ─── */
  .dash {
    padding-top: var(--space-xl);
  }
  .greet {
    margin-bottom: var(--space-lg);
  }
  .livenow {
    display: grid;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }
  .live-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-radius: var(--radius-lg);
  }
  .live-card .muted {
    color: color-mix(in srgb, var(--color-on-primary) 70%, transparent);
    font-size: var(--fs-sm);
  }
  .lt {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .pulse {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-turquoise);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  .cols {
    display: grid;
    gap: var(--space-lg);
    align-items: start;
  }
  .mini-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }
  .inbox-list,
  .sk-list {
    display: grid;
    gap: var(--space-sm);
  }
  .sk-card {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  @media (min-width: 900px) {
    .cols {
      grid-template-columns: 1fr 1.3fr;
    }
  }
</style>
