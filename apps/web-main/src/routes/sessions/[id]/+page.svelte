<script lang="ts">
  import { auth } from '$lib/auth/auth.svelte';
  import { gate } from '$lib/stores/gate.svelte';
  import { formatDateTime } from '$lib/utils/format';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import StatusChip from '$lib/components/ui/StatusChip.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import ScheduleInfo from '$lib/components/features/ScheduleInfo.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';

  let { data } = $props();
  const s = $derived(data.session);
</script>

<svelte:head>
  <title>{s.title} — اسراء</title>
  <meta name="description" content={s.description} />
  <meta property="og:title" content={s.title} />
  <meta property="og:description" content={s.description} />
</svelte:head>

<div class="container wrap">
  <PageHeader title={s.title} backHref="/sessions">
    {#snippet actions()}<StatusChip status={s.status} />{/snippet}
  </PageHeader>

  <div class="layout">
    <article class="main">
      <h2>دربارهٔ این جلسه</h2>
      <p class="desc">{s.description}</p>
    </article>

    <aside class="side" aria-label="مشخصات جلسه">
      <div class="panel">
        <ScheduleInfo schedule={s.schedule} />
        {#if s.nextStartsAt}
          <p class="next"><Icon name="calendar" size={18} />شروع بعدی: <strong>{formatDateTime(s.nextStartsAt)}</strong></p>
        {/if}
        <p class="loc"><Icon name="pin" size={18} />{s.location.label}</p>
      </div>

      <div class="panel act">
        {#if s.status === 'ended'}
          <NoticeBanner tone="info">این جلسه پایان یافته است. از بخش «جلسات» سراغ جلسهٔ دیگری بروید.</NoticeBanner>
          <Button href="/sessions" variant="secondary" full>مشاهدهٔ جلسات دیگر</Button>
        {:else if auth.status === 'member'}
          <NoticeBanner tone="info">
            عضویت، حضور و نوبت قرائت در بخش جلسهٔ زنده انجام می‌شود؛ این بخش به‌زودی فعال می‌شود.
          </NoticeBanner>
        {:else}
          <p class="muted small">برای عضویت در این جلسه باید وارد حساب خود شوید.</p>
          <Button
            full
            onclick={() => gate.open('برای عضویت در این جلسه، وارد حساب خود شوید یا ثبت‌نام کنید.', `/sessions/${s.id}`)}
          >
            عضویت در جلسه
          </Button>
        {/if}
      </div>
    </aside>
  </div>
</div>

<Footer />

<style>
  .wrap {
    padding-top: var(--space-xl);
  }
  .layout {
    display: grid;
    gap: var(--space-xl);
    align-items: start;
  }
  .main h2 {
    margin-bottom: var(--space-sm);
  }
  .desc {
    max-width: 44rem;
    font-size: var(--fs-lg);
    line-height: 2;
  }
  .side {
    display: grid;
    gap: var(--space-md);
  }
  .panel {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
    box-shadow: var(--elev-1);
  }
  .next,
  .loc {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    font-size: var(--fs-sm);
  }
  .next :global(svg),
  .loc :global(svg) {
    margin-top: 5px;
    flex: none;
    color: var(--color-accent);
  }
  .small {
    font-size: var(--fs-sm);
  }
  @media (min-width: 900px) {
    .layout {
      grid-template-columns: 1.6fr 1fr;
    }
    .side {
      position: sticky;
      top: calc(var(--topbar-h) + var(--space-md));
    }
  }
</style>
