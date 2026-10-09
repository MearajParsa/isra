<script lang="ts">
  import { onMount } from 'svelte';
  import type { Page, PublicSession } from '$lib/api/types';
  import { formatDateTime, formatNumber, scheduleLabel } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  let {
    sessions,
    sessionsError
  }: { sessions: Page<PublicSession> | null; sessionsError: string | null } = $props();

  type ScrollCraftApi = { destroy?: () => void };
  type ScrollCraftGlobal = { mount: (root: Element) => ScrollCraftApi };

  /** فصل‌ها به ترتیب صفحه؛ هر فصل که از وسط صفحه بگذرد، یک مهر حضور می‌گیرد */
  const chapters = [
    { id: 'c1', label: 'بی‌شنونده' },
    { id: 'c2', label: 'جلسه' },
    { id: 'c3', label: 'شنیده‌شدن' },
    { id: 'c4', label: 'نشان‌ها' },
    { id: 'c5', label: 'جلسه‌های باز' },
    { id: 'c6', label: 'آغاز' }
  ];
  const POINTS_PER_ATTENDANCE = 5;
  const FIRST_BADGE = 50;
  const SLOTS = FIRST_BADGE / POINTS_PER_ATTENDANCE;

  const ladder = [
    { value: 50, t: 0.135 },
    { value: 150, t: 0.305 },
    { value: 300, t: 0.56 },
    { value: 500, t: 0.9 }
  ];

  const steps = [
    { title: 'با شمارهٔ موبایل وارد شوید', text: 'فقط شمارهٔ شما و یک کد پیامکی؛ بدون فرم طولانی.' },
    { title: 'جلسهٔ مناسب را پیدا کنید', text: 'جلسه‌ها را مرور کنید و در جلسهٔ دلخواه عضو شوید.' },
    { title: 'بخوانید و پیشرفت کنید', text: 'در جلسه حاضر شوید، نوبت بگیرید و نتیجهٔ ارزیابی را ببینید.' }
  ];

  const criteria = [
    { word: 'صوت', gloss: 'صدای شما چقدر روشن و شنیدنی است.' },
    { word: 'لحن', gloss: 'آهنگ و حالتی که در قرائت دارید.' },
    { word: 'تجوید', gloss: 'رعایت قواعد قرائت، کلمه به کلمه.' }
  ];

  let rootEl: HTMLElement;
  let reached = $state<boolean[]>(chapters.map(() => false));
  let current = $state(-1);
  let pop = $state(0);
  let peakEl: HTMLElement;
  let counter = $state(0);

  const stamps = $derived(reached.filter(Boolean).length);
  const score = $derived(stamps * POINTS_PER_ATTENDANCE);
  const currentLabel = $derived(current >= 0 ? `فصل ${formatNumber(current + 1)} · ${chapters[current].label}` : '');

  function sessionWhen(s: PublicSession) {
    if (s.status === 'started') return 'اکنون در حال برگزاری است';
    if (s.nextStartsAt) return formatDateTime(s.nextStartsAt);
    if (s.status === 'ended') return 'پایان یافته';
    return scheduleLabel(s.schedule);
  }

  onMount(() => {
    let dead = false;
    let instance: ScrollCraftApi | undefined;
    let script: HTMLScriptElement | undefined;
    const w = window as unknown as { ScrollCraft?: ScrollCraftGlobal };

    const boot = () => {
      if (dead || !w.ScrollCraft) return;
      instance = w.ScrollCraft.mount(rootEl);
    };
    if (w.ScrollCraft) boot();
    else {
      script = document.createElement('script');
      script.src = '/scrollcraft/scrollcraft.js';
      script.async = true;
      script.onload = boot;
      document.head.appendChild(script);
    }

    // مهر حضور: فصلی که از خط میانهٔ صفحه رد شود «حاضر» حساب می‌شود
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = chapters.findIndex((c) => c.id === e.target.id);
          if (i < 0) continue;
          if (e.isIntersecting) {
            current = i;
            // حاضر بودن در فصل i یعنی از فصل‌های قبلی هم گذشته‌اید (حتی اگر اسکرول سریع باشد)
            for (let j = 0; j <= i; j++) {
              if (!reached[j]) {
                reached[j] = true;
                pop += 1;
              }
            }
          } else if (current === i) {
            current = -1;
          }
        }
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );
    for (const c of chapters) {
      const el = rootEl.querySelector(`#${c.id}`);
      if (el) io.observe(el);
    }

    // شمارندهٔ اوج: از پیشرفت اسکرول بخش پین‌شده، با ارقام فارسی
    let frame = 0;
    const tick = () => {
      frame = 0;
      const r = peakEl.getBoundingClientRect();
      const travel = Math.max(r.height - window.innerHeight, 1);
      const p = Math.min(Math.max(-r.top / travel, 0), 1);
      counter = Math.round(500 * Math.min(Math.max((p - 0.05) / 0.85, 0), 1));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    tick();

    return () => {
      dead = true;
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      io.disconnect();
      instance?.destroy?.();
      script?.remove();
    };
  });
</script>

<svelte:head>
  <link rel="stylesheet" href="/scrollcraft/scrollcraft.css" />
  {@html `<style>
    :root {
      --sc-canvas: #fff8f2;
      --sc-surface: #f2ece7;
      --sc-ink: #1c0e44;
      --sc-ink-soft: #5c5470;
      --sc-accent: #0d4a46;
      --sc-accent-ink: #ffffff;
      --sc-font-display: 'Yekan Bakh FaNum', system-ui, 'Segoe UI', Tahoma, sans-serif;
      --sc-font-text: 'Yekan Bakh FaNum', system-ui, 'Segoe UI', Tahoma, sans-serif;
      --sc-track-tight: 0;
      --sc-track-snug: 0;
      --sc-track-normal: 0;
      --sc-leading-none: 1.3;
      --sc-leading-tight: 1.4;
      --sc-leading-body: 1.9;
      --sc-shadow-color: 255 60% 12%;
    }
    body { font-size: var(--fs-md); }
  </style>`}
</svelte:head>

<div class="landing" bind:this={rootEl}>
  <span data-sc-progress aria-hidden="true"></span>

  <!-- ─── صفحهٔ عنوان: سه لایهٔ مستقل (پس‌زمینه، هشت‌پر، محراب‌ها) و متن بین آن‌ها ─── -->
  <section class="hero" data-sc-act="flow" aria-labelledby="hero-h">
    <div class="planes" aria-hidden="true">
      <div class="plane far" data-sc-parallax="-1.6">
        <svg viewBox="-100 -100 200 200" focusable="false">
          {#each [1, 0.84, 0.68, 0.52] as r, i (i)}
            <g fill="none" stroke="var(--color-accent-warm)" stroke-width="0.5" opacity={0.75 - i * 0.12}>
              <rect x={-60 * r} y={-60 * r} width={120 * r} height={120 * r} />
              <rect x={-60 * r} y={-60 * r} width={120 * r} height={120 * r} transform="rotate(45)" />
            </g>
          {/each}
        </svg>
      </div>
      <div class="plane mid" data-sc-parallax="-0.7">
        <svg viewBox="-100 -100 200 200" focusable="false">
          <g class="spin" fill="none" stroke="var(--color-primary)" stroke-width="1.1">
            <rect x="-48" y="-48" width="96" height="96" />
            <rect x="-48" y="-48" width="96" height="96" transform="rotate(45)" />
          </g>
          <g class="spin back" fill="none" stroke="var(--color-accent)" stroke-width="1">
            <rect x="-30" y="-30" width="60" height="60" />
            <rect x="-30" y="-30" width="60" height="60" transform="rotate(45)" />
          </g>
          <circle r="11" fill="var(--color-accent-warm)" />
          <circle r="4.5" fill="var(--color-primary)" />
        </svg>
      </div>
      <div class="plane near" data-sc-parallax="1.1">
        <svg viewBox="0 0 1200 260" preserveAspectRatio="xMidYMax slice" focusable="false">
          <path
            fill="var(--color-primary)"
            d="M0 260V150Q0 60 130 24Q260 60 260 150V260ZM260 260V120Q260 40 400 0Q540 40 540 120V260ZM540 260V150Q540 70 670 36Q800 70 800 150V260ZM800 260V110Q800 30 940 -4Q1080 30 1080 110V260ZM1080 260V150Q1080 70 1200 40V260Z"
          />
          <path
            fill="none"
            stroke="var(--color-turquoise)"
            stroke-width="1.5"
            opacity="0.8"
            d="M290 260V132Q290 62 400 28Q510 62 510 132V260M830 260V122Q830 52 940 18Q1050 52 1050 122V260"
          />
        </svg>
      </div>
    </div>

    <div class="hero-copy">
      <h1 id="hero-h" class="sc-display">با هم بخوانیم،<br />با هم پیش برویم</h1>
      <p class="lead">اسراء جلسه‌های قرآن را یک‌جا جمع می‌کند: عضویت، حضور، نوبت قرائت، ارزیابی و نشان.</p>
      <div class="cta">
        <Button href="/auth/phone">ورود / ثبت‌نام</Button>
        <a class="ghost" href="/sessions">مشاهدهٔ جلسات</a>
      </div>
    </div>
  </section>

  <!-- ─── فصل ۱: تنهایی (سکوت نوشته‌شده) ─── -->
  <section id="c1" class="ch dark silence" data-sc-act="flow" aria-labelledby="c1-h">
    <div class="wrap">
      <h2 id="c1-h" class="sc-display huge" data-sc-cue="0.2 0.82 0.2 0.14">
        تنها می‌خوانی،<br />و هیچ‌کس نمی‌شنود<br />که درست خوانده‌ای یا نه.
      </h2>
    </div>
  </section>

  <!-- ─── فصل ۲: جلسه، خطی که خودش را می‌کشد ─── -->
  <section id="c2" class="ch paper session" data-sc-act="flow" aria-labelledby="c2-h">
    <div class="wrap two">
      <div class="head" data-sc-in data-sc-stagger="70">
        <p class="kicker">فصل ۲</p>
        <h2 id="c2-h" class="sc-display big">یک جلسه، یک جای مشخص</h2>
        <p class="body">
          جلسه‌ها یک‌باره، هفتگی یا در یک بازهٔ مشخص برگزار می‌شوند؛ زمان و مکان هر جلسه از قبل روشن است. شما فقط
          می‌آیید و می‌خوانید.
        </p>
      </div>

      <div class="route">
        <svg class="route-line" viewBox="0 0 12 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M6 0V100" pathLength="1" />
        </svg>
        <ol>
          {#each steps as s, i (s.title)}
            <li style={`--at:${0.2 + i * 0.2}`}>
              <span class="dot" aria-hidden="true">{formatNumber(i + 1)}</span>
              <h3>{s.title}</h3>
              <p class="muted">{s.text}</p>
            </li>
          {/each}
        </ol>
      </div>
    </div>
  </section>

  <!-- ─── فصل ۳: شنیده‌شدن ─── -->
  <section id="c3" class="ch warm heard" data-sc-act="flow" aria-labelledby="c3-h">
    <div class="wrap">
      <div class="head" data-sc-in data-sc-stagger="70">
        <h2 id="c3-h" class="sc-display big">بالاخره کسی می‌شنود</h2>
        <p class="body">
          با ورود به جلسه حضور شما ثبت می‌شود و در صف نوبت قرائت قرار می‌گیرید. استاد و پشتیبان جلسه قرائت شما را
          ارزیابی می‌کنند و نتیجه به اینباکس شما می‌رسد.
        </p>
      </div>

      <div class="plate" data-sc-reveal="right" data-sc-reveal-at="0.12 0.5">
        <ul class="words">
          {#each criteria as c, i (c.word)}
            <li data-sc-parallax={i === 1 ? '0.5' : i === 2 ? '-0.5' : '0'}>
              <span class="w">{c.word}</span>
              <span class="g">{c.gloss}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </section>

  <!-- ─── فصل ۴: اوج، پلهٔ نشان‌ها ─── -->
  <section id="c4" class="peak" bind:this={peakEl} data-sc-act="pin" data-sc-span="3.8" aria-labelledby="c4-h">
    <div data-sc-stage class="peak-stage">
      <div class="peak-art" aria-hidden="true">
        <svg viewBox="-100 -100 200 200" focusable="false">
          {#each [1, 0.8, 0.6, 0.4, 0.2] as r, i (i)}
            <g class="lit" style={`--k:${i}`} fill="none" stroke={i % 2 === 0 ? 'var(--color-accent-warm)' : 'var(--color-turquoise)'} stroke-width="0.9">
              <rect x={-62 * r} y={-62 * r} width={124 * r} height={124 * r} />
              <rect x={-62 * r} y={-62 * r} width={124 * r} height={124 * r} transform="rotate(45)" />
            </g>
          {/each}
        </svg>
      </div>
      <p class="counter" aria-hidden="true">{formatNumber(counter)}</p>

      <div class="peak-copy">
        <h2 id="c4-h" class="sr-only">امتیاز و نشان</h2>
        <div class="cues">
          <p class="cue" data-sc-cue="0 0.3 0 0.4">هر حضور در جلسه،<br />۵ امتیاز.</p>
          <p class="cue" data-sc-cue="0.28 0.6">با ۵۰ امتیاز،<br />نشان اول مال شماست.</p>
          <p class="cue" data-sc-cue="0.58 0.99">بعد ۱۵۰، ۳۰۰ و ۵۰۰:<br />هر پله یک نشان تازه.</p>
        </div>
        <ul class="ladder" aria-label="پلهٔ نشان‌ها">
          {#each ladder as l (l.value)}
            <li style={`--t:${l.t}`}>
              <Icon name="award" size={20} />
              <span>{formatNumber(l.value)}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </section>

  <!-- ─── فصل ۵: جلسه‌های باز ─── -->
  <section id="c5" class="ch paper open" aria-labelledby="c5-h">
    <div class="wrap">
      <div class="head" data-sc-in data-sc-stagger="70">
        <h2 id="c5-h" class="sc-display big">جلسه‌های باز</h2>
        <a class="all" href="/sessions">مشاهدهٔ همهٔ جلسه‌ها<Icon name="chevron-left" size={18} /></a>
      </div>

      {#if sessions && sessions.items.length > 0}
        <ul class="rows" data-sc-in data-sc-stagger="80">
          {#each sessions.items as s (s.id)}
            <li>
              <a class="row" href={`/sessions/${s.id}`}>
                <span class="r-main">
                  <strong>{s.title}</strong>
                  <span class="muted">{s.description}</span>
                </span>
                <span class="r-meta">
                  <span class="when" class:live={s.status === 'started'}>{sessionWhen(s)}</span>
                  <span class="muted">{s.location.label}</span>
                </span>
                <Icon name="chevron-left" size={20} />
              </a>
            </li>
          {/each}
        </ul>
      {:else if sessionsError}
        <p class="note" data-sc-in>بارگذاری جلسه‌ها ممکن نشد. صفحه را دوباره باز کنید.</p>
      {:else}
        <p class="note" data-sc-in>هنوز جلسه‌ای ثبت نشده. به‌محض اعلام جلسهٔ جدید اینجا می‌بینید.</p>
      {/if}
    </div>
  </section>

  <!-- ─── فصل ۶: آغاز (چاپ کوچک، یک پیوند) ─── -->
  <section id="c6" class="ch colophon" aria-labelledby="c6-h">
    <div class="wrap narrow" data-sc-in data-sc-stagger="70">
      <h2 id="c6-h" class="small-title">امروز شروع کنید</h2>
      <p class="body">ثبت‌نام فقط شمارهٔ موبایل و یک کد پیامکی است.</p>
      <a class="join" href="/auth/phone">ورود / ثبت‌نام<Icon name="chevron-left" size={22} /></a>
      <p class="ledger">
        {#if stamps > 0}
          در همین صفحه {formatNumber(stamps)} مهر حضور گرفتید ({formatNumber(score)} از {formatNumber(FIRST_BADGE)} امتیاز نمونه
          تا نشان اول). در جلسهٔ واقعی ادامه بدهید.
        {:else}
          هر حضور در جلسه ۵ امتیاز دارد و نشان اول ۵۰ امتیاز است.
        {/if}
      </p>
    </div>
  </section>

  <!-- کارت حضور: امضای این صفحه. هر فصل یک مهر، مثل حضور واقعی در جلسه. -->
  <aside class="card" class:on={current >= 0} aria-hidden="true">
    <div class="card-top">
      <span class="card-title">کارت حضور (نمونه)</span>
      <span class="card-score" data-pop={pop}>{formatNumber(score)}</span>
    </div>
    <span class="card-chap">{currentLabel}</span>
    <span class="slots">
      {#each Array(SLOTS) as _, i (i)}
        <span class="slot" class:filled={i < stamps}></span>
      {/each}
    </span>
  </aside>
</div>

<style>
  .landing {
    margin-bottom: calc(var(--space-3xl) * -1);
    --ink: var(--color-primary);
    --paper: var(--color-surface);
    position: relative;
    overflow-x: clip;
    font-family: var(--font-ui);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .landing :global(.sc-display) {
    font-weight: 700;
  }

  /* ─── گرید و ریتم ─── */
  .wrap {
    width: 100%;
    max-width: 72rem;
    margin-inline: auto;
    padding-inline: clamp(1.25rem, 5vw, 3rem);
  }
  .wrap.narrow {
    max-width: 40rem;
  }
  .ch {
    padding-block: clamp(4.5rem, 10vw, 9rem);
  }
  .paper {
    background: var(--color-surface);
    color: var(--color-primary);
  }
  .warm {
    background: var(--color-secondary);
    color: var(--color-primary);
    --sc-ink-soft: #5c5470;
  }
  .dark {
    background: var(--color-primary);
    color: #fff8f2;
  }
  .body {
    max-width: 38rem;
    font-size: var(--fs-lg);
    color: var(--color-muted);
    text-wrap: pretty;
  }
  .muted {
    color: var(--color-muted);
  }
  .kicker {
    font-weight: 700;
    font-size: var(--fs-sm);
    color: var(--color-accent);
  }
  .big {
    font-size: clamp(2.1rem, 1.4rem + 3.4vw, 4rem);
    text-wrap: balance;
  }
  .head {
    display: grid;
    gap: var(--space-md);
    margin-bottom: clamp(2.5rem, 6vw, 4.5rem);
  }

  /* ─── صفحهٔ عنوان ─── */
  .hero {
    position: relative;
    isolation: isolate;
    min-height: min(46rem, calc(100svh - var(--topbar-h)));
    display: grid;
    align-items: start;
    padding-top: clamp(2.5rem, 9vh, 6rem);
    background: var(--color-surface);
    color: var(--color-primary);
    overflow: clip;
  }
  .planes {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
  .plane {
    position: absolute;
  }
  .plane :global(svg) {
    width: 100%;
    height: auto;
  }
  .far {
    inset-inline-start: -14%;
    top: -12%;
    width: min(70rem, 140vw);
    opacity: 0.55;
  }
  .mid {
    inset-inline-start: clamp(-4rem, 2vw, 4rem);
    top: clamp(3rem, 10vh, 7rem);
    width: min(34rem, 82vw);
    z-index: 1;
  }
  .spin {
    transform-box: fill-box;
    transform-origin: center;
    animation: turn 90s linear infinite;
  }
  .spin.back {
    animation-direction: reverse;
    animation-duration: 70s;
  }
  .near {
    inset-inline: 0;
    bottom: -1px;
    z-index: 3;
    aspect-ratio: 1200 / 260;
  }
  .near :global(svg) {
    height: 100%;
    width: 100%;
  }
  .hero-copy {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 72rem;
    margin-inline: auto;
    padding-inline: clamp(1.25rem, 5vw, 3rem);
    padding-bottom: clamp(5rem, 24vw, 22rem);
    display: grid;
    gap: var(--space-lg);
    justify-items: start;
  }
  .hero-copy h1 {
    font-size: clamp(2.5rem, 1.4rem + 5vw, 5.4rem);
    line-height: 1.3;
    max-width: 14ch;
    animation: rise 900ms var(--ease) both;
  }
  .lead {
    max-width: 30rem;
    font-size: var(--fs-lg);
    color: var(--color-muted);
    animation: rise 900ms 120ms var(--ease) both;
  }
  .cta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-lg);
    animation: rise 900ms 240ms var(--ease) both;
  }
  .ghost {
    font-weight: 700;
    color: var(--color-primary);
    text-decoration-line: underline;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 6px;
    padding-block: 12px;
  }
  .ghost:hover {
    text-decoration-thickness: 3px;
  }
  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate3d(0, 18px, 0);
    }
  }
  @media (min-width: 900px) {
    .mid {
      inset-inline-start: auto;
      inset-inline-end: auto;
      left: clamp(2rem, 6vw, 7rem);
      top: clamp(2rem, 8vh, 6rem);
      width: min(38rem, 44vw);
    }
    .far {
      inset-inline-start: auto;
      left: -10%;
    }
  }
  @media (max-width: 899px) {
    .mid {
      opacity: 0.35;
      top: auto;
      bottom: 6rem;
      left: 50%;
      translate: -50% 0;
    }
  }

  /* ─── فصل ۱ ─── */
  .silence {
    display: grid;
    align-items: center;
    min-height: 100svh;
  }
  .silence :global(.huge) {
    font-size: clamp(2.2rem, 1.2rem + 4.6vw, 5.2rem);
    line-height: 1.45;
    max-width: 18ch;
  }

  /* ─── فصل ۲: مسیر ─── */
  .two {
    display: grid;
    gap: clamp(2.5rem, 6vw, 5rem);
    align-items: start;
  }
  .session .head {
    margin-bottom: 0;
  }
  .route {
    position: relative;
    padding-inline-start: 3.25rem;
  }
  .route-line {
    position: absolute;
    inset-block: 1.4rem 1.4rem;
    inset-inline-start: 1.1rem;
    width: 0.75rem;
    height: calc(100% - 2.8rem);
    overflow: visible;
  }
  .route-line path {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 1;
    stroke-dashoffset: calc(1 - clamp(0, (var(--sc-p, 0.5) - 0.28) * 2.6, 1));
  }
  .route ol {
    display: grid;
    gap: clamp(2.5rem, 7vw, 4.5rem);
  }
  .route li {
    position: relative;
    display: grid;
    gap: 4px;
    --lit: clamp(0, (var(--sc-p, 0.5) - var(--at, 0.3)) * 6, 1);
    opacity: calc(0.45 + 0.55 * var(--lit));
  }
  .dot {
    position: absolute;
    inset-inline-start: -3.25rem;
    top: 0.1rem;
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    border: 1.5px solid var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) calc(var(--lit) * 100%), var(--color-surface));
    color: color-mix(in srgb, var(--color-accent-warm) calc(var(--lit) * 100%), var(--color-primary));
    font-weight: 700;
  }
  @media (min-width: 900px) {
    .two {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* ─── فصل ۳ ─── */
  .heard .head {
    margin-bottom: clamp(2rem, 5vw, 3.5rem);
  }
  .plate {
    background: var(--color-primary);
    color: #fff8f2;
    border-radius: var(--radius-lg);
    padding: clamp(1.75rem, 5vw, 4rem);
  }
  .words {
    display: grid;
    gap: clamp(1.5rem, 4vw, 2.75rem);
  }
  .words li {
    display: grid;
    gap: 2px;
    will-change: transform;
  }
  .words li:nth-child(2) {
    justify-self: end;
    text-align: end;
  }
  .words .w {
    font-size: clamp(3.6rem, 2rem + 9vw, 9rem);
    line-height: 1.15;
    font-weight: 700;
    color: var(--color-accent-warm);
  }
  .words .g {
    max-width: 24rem;
    font-size: var(--fs-md);
    color: #e9e0f2;
  }

  /* ─── فصل ۴: اوج ─── */
  .peak {
    background: var(--color-accent);
    color: #fff8f2;
  }
  .peak-stage {
    display: grid;
    align-content: center;
    gap: var(--space-lg);
    padding: calc(var(--topbar-h) + 0.5rem) clamp(1.25rem, 5vw, 3rem) 1rem;
    max-width: 72rem;
    margin-inline: auto;
  }
  .peak-art {
    width: min(100%, min(44vh, 30rem));
    margin-inline: auto;
    aspect-ratio: 1;
    transform: scale(calc(0.86 + 0.14 * var(--sc-p, 0)));
  }
  .peak-art :global(svg) {
    width: 100%;
    height: 100%;
  }
  .lit {
    transform-box: fill-box;
    transform-origin: center;
    opacity: calc(0.12 + 0.88 * clamp(0, (var(--sc-p, 0) - 0.06 - var(--k) * 0.17) * 7, 1));
  }
  .counter {
    text-align: center;
    font-size: clamp(2.6rem, 1.4rem + 4vw, 4.6rem);
    font-weight: 700;
    line-height: 1.1;
    color: var(--color-accent-warm);
  }
  .peak-copy {
    display: grid;
    gap: var(--space-lg);
    justify-items: center;
    text-align: center;
  }
  .cues {
    display: grid;
    width: 100%;
  }
  .cue {
    grid-area: 1 / 1;
    font-size: clamp(1.5rem, 1.1rem + 2vw, 2.6rem);
    font-weight: 700;
    line-height: 1.5;
    text-wrap: balance;
  }
  .ladder {
    display: flex;
    gap: clamp(0.75rem, 3vw, 2rem);
    flex-wrap: wrap;
    justify-content: center;
  }
  .ladder li {
    --lit: clamp(0, (var(--sc-p, 0) - var(--t)) * 30, 1);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--radius-pill);
    border: 1.5px solid color-mix(in srgb, var(--color-accent-warm) 55%, transparent);
    background: color-mix(in srgb, var(--color-accent-warm) calc(var(--lit) * 100%), transparent);
    color: color-mix(in srgb, var(--color-primary) calc(var(--lit) * 100%), #fff8f2);
    font-weight: 700;
  }
  @media (min-width: 900px) {
    .peak-stage {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto;
      align-content: center;
      column-gap: var(--space-2xl);
      row-gap: var(--space-md);
    }
    .peak-art {
      grid-column: 2;
      grid-row: 1;
    }
    .counter {
      grid-column: 2;
      grid-row: 2;
    }
    .peak-copy {
      grid-column: 1;
      grid-row: 1 / span 2;
      align-self: center;
      justify-items: start;
      text-align: start;
    }
  }

  /* ─── فصل ۵ ─── */
  .open .head {
    grid-auto-flow: column;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
  }
  .all {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-weight: 700;
    color: var(--color-primary);
    white-space: nowrap;
  }
  .rows {
    border-top: 1px solid var(--color-outline);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: var(--space-lg);
    padding-block: var(--space-lg);
    border-bottom: 1px solid var(--color-outline);
    color: var(--color-primary);
    text-decoration: none;
    transition: background-color 160ms var(--sc-ease-out), padding 160ms var(--sc-ease-out);
  }
  .r-main {
    display: grid;
    min-width: 0;
  }
  .r-main strong {
    font-size: var(--fs-xl);
  }
  .r-main .muted {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .r-meta {
    display: grid;
    justify-items: end;
    text-align: end;
    font-size: var(--fs-sm);
  }
  .when {
    font-weight: 700;
  }
  .when.live {
    color: var(--color-accent);
  }
  .row:hover,
  .row:focus-visible {
    background: var(--color-primary-tint);
    padding-inline: var(--space-md);
  }
  .note {
    padding: var(--space-xl) 0;
    color: var(--color-muted);
  }
  @media (max-width: 640px) {
    .row {
      grid-template-columns: 1fr auto;
    }
    .r-meta {
      grid-column: 1;
      justify-items: start;
      text-align: start;
    }
    .row :global(svg) {
      grid-row: 1;
      grid-column: 2;
    }
  }

  /* ─── فصل ۶ ─── */
  .colophon {
    background: var(--color-neutral);
    color: var(--color-primary);
    padding-bottom: clamp(7rem, 14vw, 9rem);
  }
  .colophon .wrap {
    display: grid;
    gap: var(--space-md);
    justify-items: start;
  }
  .small-title {
    font-size: var(--fs-xxl);
  }
  .join {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: var(--space-sm);
    font-size: var(--fs-xxl);
    font-weight: 700;
    color: var(--color-primary);
    text-decoration-line: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 8px;
    padding-block: 8px;
  }
  .join:hover {
    text-decoration-thickness: 4px;
  }
  .ledger {
    margin-top: var(--space-lg);
    font-size: var(--fs-sm);
    color: var(--color-muted);
    max-width: 32rem;
  }

  /* ─── کارت حضور ─── */
  .card {
    position: fixed;
    inset-inline-start: 12px;
    bottom: calc(var(--bottomnav-h) + 12px + env(safe-area-inset-bottom));
    z-index: 25;
    display: grid;
    gap: 4px;
    min-width: 11.5rem;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: #fff8f2;
    box-shadow: var(--sc-e3);
    opacity: 0;
    transform: translate3d(0, 16px, 0);
    pointer-events: none;
    transition:
      opacity 240ms var(--sc-ease-out),
      transform 240ms var(--sc-ease-out);
  }
  .card.on {
    opacity: 1;
    transform: none;
  }
  .card-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-md);
  }
  .card-title {
    font-size: var(--fs-xs);
    color: #d8cfe8;
  }
  .card-score {
    font-weight: 700;
    font-size: var(--fs-lg);
    color: var(--color-accent-warm);
  }
  .card-chap {
    min-height: 1.4em;
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .slots {
    display: flex;
    gap: 4px;
  }
  .slot {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, #fff8f2 22%, transparent);
    transition: background-color 240ms var(--sc-ease-out);
  }
  .slot.filled {
    background: var(--color-accent-warm);
  }
  @media (max-width: 899px) {
    .card {
      min-width: 0;
      padding: 8px 12px;
    }
    .card-chap {
      display: none;
    }
    .peak-stage {
      padding-bottom: calc(var(--bottomnav-h) + 4.5rem);
    }
    .peak-art {
      width: min(100%, 34vh);
    }
  }
  @media (min-width: 900px) {
    .card {
      bottom: 20px;
      inset-inline-start: 20px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin,
    .hero-copy h1,
    .lead,
    .cta {
      animation: none;
    }
    .card {
      transition: opacity 240ms linear;
      transform: none;
    }
  }
</style>
