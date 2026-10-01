<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import type { InboxItem, PointsSummary } from '$lib/api/types';
  import { auth } from '$lib/auth/auth.svelte';
  import { Resource } from '$lib/utils/resource.svelte';
  import { formatDate, formatNumber } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';
  import StarOrnament from '$lib/components/ui/StarOrnament.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import SessionCard from '$lib/components/features/SessionCard.svelte';
  import SessionCardSkeleton from '$lib/components/features/SessionCardSkeleton.svelte';
  import PointsSummaryCard from '$lib/components/features/PointsSummaryCard.svelte';
  import InboxItemRow from '$lib/components/features/InboxItemRow.svelte';
  import PwaInstallBanner from '$lib/components/layout/PwaInstallBanner.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';

  let { data } = $props();

  const features: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'calendar',
      title: 'جلسات قرآن',
      text: 'جلسه‌های یک‌باره، هفتگی یا در یک بازهٔ مشخص؛ زمان و مکان هر جلسه از قبل روشن است.'
    },
    {
      icon: 'mic',
      title: 'حضور و نوبت قرائت',
      text: 'با ورود به جلسه حضور شما ثبت می‌شود و در صف نوبت قرائت قرار می‌گیرید.'
    },
    {
      icon: 'check',
      title: 'ارزیابی دقیق',
      text: 'معلم و پشتیبان جلسه، صوت، لحن و تجوید قرائت شما را ارزیابی می‌کنند.'
    },
    {
      icon: 'award',
      title: 'امتیاز و نشان',
      text: 'با هر حضور ۵ امتیاز بگیرید و نشان‌های ۵۰، ۱۵۰، ۳۰۰ و ۵۰۰ امتیاز را کسب کنید.'
    },
    {
      icon: 'bell',
      title: 'اینباکس درون‌برنامه',
      text: 'خبر عضویت، رسیدن نوبت و نتیجهٔ ارزیابی را همان‌جا در اینباکس ببینید.'
    }
  ];

  const steps = [
    { n: 1, title: 'با شمارهٔ موبایل وارد شوید', text: 'فقط شمارهٔ شما و یک کد پیامکی؛ بدون فرم طولانی.' },
    { n: 2, title: 'جلسهٔ مناسب را پیدا کنید', text: 'جلسات را مرور کنید و در جلسهٔ دلخواه عضو شوید.' },
    { n: 3, title: 'بخوانید و پیشرفت کنید', text: 'در جلسه حاضر شوید، نوبت بگیرید و نتیجهٔ ارزیابی را ببینید.' }
  ];

  const points = new Resource<PointsSummary>();
  const inbox = new Resource<InboxItem[]>();

  $effect(() => {
    if (auth.status === 'member') {
      void points.load(() => auth.withAuth((t) => api.me.points(t)));
      void inbox.load(async () => (await auth.withAuth((t) => api.me.inbox(t, { pageSize: 3 }))).items);
    }
  });

  const isMember = $derived(auth.status === 'member');
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
  <!-- ─── نسخهٔ guest: صفحهٔ معرفی (SSR) ─── -->
  <section class="hero">
    <div class="container hero-in">
      <div class="hero-text">
        <p class="eyebrow">پلتفرم جلسات قرآن</p>
        <h1>با هم بخوانیم،<br />با هم پیش برویم</h1>
        <p class="lead">
          در جلسات قرآن عضو شوید، نوبت قرائت بگیرید، از معلم بازخورد دریافت کنید و با امتیاز و نشان‌ها
          انگیزه‌تان را زنده نگه دارید.
        </p>
        <div class="cta">
          <Button href="/auth/phone" variant="warm">ورود / ثبت‌نام</Button>
          <Button href="/sessions" variant="light">مشاهدهٔ جلسات</Button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true"><StarOrnament size={380} /></div>
    </div>
  </section>

  <section class="section container" aria-labelledby="features-h">
    <div class="sec-head center">
      <h2 id="features-h">هر آنچه برای یک جلسهٔ قرآنی لازم است</h2>
      <p class="muted">از پیدا کردن جلسه تا دیدن نتیجهٔ ارزیابی، همه در یک‌جا.</p>
    </div>
    <ul class="features">
      {#each features as f (f.title)}
        <li class="feat">
          <span class="f-ico"><Icon name={f.icon} size={26} /></span>
          <h3>{f.title}</h3>
          <p class="muted">{f.text}</p>
        </li>
      {/each}
    </ul>
  </section>

  <section class="steps-sec">
    <div class="container section">
      <div class="sec-head center">
        <h2>چطور کار می‌کند؟</h2>
      </div>
      <ol class="steps">
        {#each steps as s (s.n)}
          <li class="step">
            <span class="n">{formatNumber(s.n)}</span>
            <h3>{s.title}</h3>
            <p class="muted">{s.text}</p>
          </li>
        {/each}
      </ol>
    </div>
  </section>

  {@render sessionsSection()}

  <section class="container final">
    <div class="final-card">
      <h2>امروز شروع کنید</h2>
      <p>ثبت‌نام فقط چند ثانیه طول می‌کشد؛ شمارهٔ موبایل و یک کد پیامکی.</p>
      <Button href="/auth/phone" variant="warm">ورود / ثبت‌نام</Button>
    </div>
    <div class="pwa"><PwaInstallBanner /></div>
  </section>
{/if}

<Footer />

<style>
  /* ─── hero ─── */
  .hero {
    background: var(--color-primary);
    color: var(--color-on-primary);
    overflow: hidden;
  }
  .hero-in {
    display: grid;
    gap: var(--space-xl);
    align-items: center;
    padding-block: var(--space-2xl) var(--space-xl);
  }
  .eyebrow {
    display: inline-block;
    padding: 4px 14px;
    margin-bottom: var(--space-md);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--color-accent-warm) 20%, transparent);
    color: var(--color-accent-warm);
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  .hero h1 {
    font-size: var(--fs-display);
    line-height: 1.35;
  }
  .lead {
    max-width: 34rem;
    margin-top: var(--space-md);
    font-size: var(--fs-lg);
    color: color-mix(in srgb, var(--color-on-primary) 82%, transparent);
  }
  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    margin-top: var(--space-xl);
  }
  .hero-art {
    display: none;
    justify-self: center;
  }
  @media (min-width: 900px) {
    .hero-in {
      grid-template-columns: 1.2fr 1fr;
      padding-block: var(--space-3xl);
    }
    .hero-art {
      display: block;
    }
  }

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
  .sec-head.center {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-xs);
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

  .features {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-md);
  }
  .feat {
    flex: 1 1 100%;
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .f-ico {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    margin-bottom: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-secondary);
    color: var(--color-primary);
  }
  .feat h3 {
    margin-bottom: 4px;
  }
  @media (min-width: 640px) {
    .feat {
      flex-basis: calc((100% - var(--space-md)) / 2);
      max-width: calc((100% - var(--space-md)) / 2);
    }
  }
  @media (min-width: 960px) {
    .feat {
      flex-basis: calc((100% - 2 * var(--space-md)) / 3);
      max-width: calc((100% - 2 * var(--space-md)) / 3);
    }
  }

  .steps-sec {
    margin-top: var(--space-2xl);
    background: var(--color-secondary);
    padding-bottom: var(--space-2xl);
  }
  .steps {
    display: grid;
    gap: var(--space-lg);
  }
  .step {
    position: relative;
    padding: var(--space-lg);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
  }
  .n {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-bottom: var(--space-md);
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-accent-warm);
    font-weight: 900;
  }
  @media (min-width: 768px) {
    .steps {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .final {
    padding-top: var(--space-2xl);
    display: grid;
    gap: var(--space-lg);
  }
  .final-card {
    display: grid;
    justify-items: center;
    gap: var(--space-md);
    padding: var(--space-2xl) var(--space-lg);
    text-align: center;
    background: var(--color-accent);
    color: var(--color-on-accent);
    border-radius: var(--radius-lg);
  }
  .final-card p {
    color: color-mix(in srgb, var(--color-on-accent) 85%, transparent);
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
