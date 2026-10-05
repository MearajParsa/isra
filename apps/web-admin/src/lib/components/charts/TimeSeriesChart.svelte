<script lang="ts" module>
  export interface ChartSeries {
    key: string;
    label: string;
    /** متغیر CSS رنگ، مثل `var(--chart-1)` */
    color: string;
    values: number[];
  }
</script>

<script lang="ts">
  import { formatNumber } from '$lib/utils/format';
  import { niceMax, tickIndexes } from '$lib/utils/buckets';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    /** نام نمودار (برای خوانندهٔ صفحه و جدول) */
    title: string;
    /** برچسب کوتاه محور */
    labels: string[];
    /** برچسب کامل هر نقطه (tooltip/جدول) */
    titles: string[];
    series: ChartSeries[];
    kind?: 'bar' | 'line';
    height?: number;
    onexport?: () => void;
  }
  let { title, labels, titles, series, kind = 'line', height = 240, onexport }: Props = $props();

  const uid = $props.id();
  let w = $state(640);
  let active = $state<number | null>(null);
  let table = $state(false);

  const M = { l: 44, r: 12, t: 12, b: 30 };
  const n = $derived(labels.length);
  const innerW = $derived(Math.max(10, w - M.l - M.r));
  const innerH = $derived(height - M.t - M.b);
  const max = $derived(niceMax(Math.max(0, ...series.flatMap((s) => s.values))));
  const hasData = $derived(series.some((s) => s.values.some((v) => v > 0)));
  const band = $derived(n > 0 ? innerW / n : innerW);
  const x = (i: number) => M.l + band * i + band / 2;
  const y = (v: number) => M.t + innerH - (v / max) * innerH;
  const ticks = $derived([0, 1, 2, 3, 4].map((i) => (max / 4) * i));
  const xTicks = $derived(tickIndexes(n, Math.max(2, Math.floor(innerW / 64))));
  const showDots = $derived(n <= 31);
  const barW = $derived(Math.max(2, Math.min(28, band * 0.62)));

  /** میله با گوشهٔ گرد فقط در سر (داده)، متصل به خط پایه */
  function barPath(cx: number, v: number): string {
    const h = innerH - (y(v) - M.t);
    if (h <= 0) return '';
    const r = Math.min(4, h, barW / 2);
    const x0 = cx - barW / 2;
    const x1 = cx + barW / 2;
    const yb = M.t + innerH;
    const yt = yb - h;
    return `M${x0},${yb}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x1 - r}Q${x1},${yt} ${x1},${yt + r}V${yb}Z`;
  }
  const linePath = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  function idxFromPointer(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    return Math.min(n - 1, Math.max(0, Math.floor((px - M.l) / band)));
  }
  function key(e: KeyboardEvent) {
    if (!n) return;
    const cur = active ?? -1;
    if (e.key === 'ArrowLeft') active = Math.min(n - 1, cur + 1 > n - 1 ? n - 1 : cur + 1);
    else if (e.key === 'ArrowRight') active = Math.max(0, cur - 1 < 0 ? 0 : cur - 1);
    else if (e.key === 'Home') active = 0;
    else if (e.key === 'End') active = n - 1;
    else if (e.key === 'Escape') active = null;
    else return;
    e.preventDefault();
  }

  const summary = $derived(active === null ? '' : `${titles[active]}: ${series.map((s) => `${s.label} ${formatNumber(s.values[active!] ?? 0)}`).join('، ')}`);
  // موقعیت tooltip (درصد عرض) با جلوگیری از بیرون‌زدن
  const tipLeft = $derived(active === null ? 0 : Math.min(Math.max(x(active), 80), Math.max(80, w - 80)));
</script>

<figure class="fig" aria-labelledby={`t-${uid}`}>
  <figcaption id={`t-${uid}`} class="cap">
    <span class="ttl">{title}</span>
    {#if series.length > 1}
      <ul class="legend" aria-label="راهنمای نمودار">
        {#each series as s (s.key)}
          <li><span class="sw {kind}" style:background={s.color} aria-hidden="true"></span>{s.label}</li>
        {/each}
      </ul>
    {/if}
    <span class="tools">
      <button type="button" class="tbtn" aria-pressed={table} onclick={() => (table = !table)}>{table ? 'نمایش نمودار' : 'نمایش جدول'}</button>
      {#if onexport}<button type="button" class="tbtn" onclick={onexport}><Icon name="download" size={16} />CSV</button>{/if}
    </span>
  </figcaption>

  {#if !hasData}
    <p class="none muted">در این بازه داده‌ای ثبت نشده است.</p>
  {:else if table}
    <div class="tblwrap">
      <table class="tbl">
        <caption class="sr-only">{title}</caption>
        <thead>
          <tr><th scope="col">بازه</th>{#each series as s (s.key)}<th scope="col" class="n">{s.label}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each titles as t, i (i)}
            <tr><th scope="row">{t}</th>{#each series as s (s.key)}<td class="n">{formatNumber(s.values[i] ?? 0)}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="plot" bind:clientWidth={w}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <svg
        width={w}
        {height}
        viewBox={`0 0 ${w} ${height}`}
        role="group"
        tabindex="0"
        aria-label={`${title}. با کلیدهای جهت‌دار چپ و راست روی نقطه‌ها حرکت کنید یا گزینهٔ نمایش جدول را بزنید.`}
        onkeydown={key}
        onfocus={() => (active ??= n - 1)}
        onblur={() => (active = null)}
        onpointermove={(e) => (active = idxFromPointer(e))}
        onpointerleave={() => (active = null)}
      >
        {#each ticks as tk (tk)}
          <line x1={M.l} x2={w - M.r} y1={y(tk)} y2={y(tk)} stroke="var(--chart-grid)" stroke-width="1" />
          <text x={M.l - 8} y={y(tk) + 4} text-anchor="end" class="ax">{formatNumber(Math.round(tk))}</text>
        {/each}
        {#each xTicks as i (i)}
          <text x={x(i)} y={height - 8} text-anchor="middle" class="ax">{labels[i]}</text>
        {/each}

        {#if active !== null}
          <rect x={x(active) - band / 2} y={M.t} width={band} height={innerH} fill="var(--color-primary)" opacity="0.06" />
        {/if}

        {#if kind === 'bar'}
          {#each series[0]?.values ?? [] as v, i (i)}
            <path d={barPath(x(i), v)} fill={series[0]!.color} opacity={active === null || active === i ? 1 : 0.55} />
          {/each}
        {:else}
          {#each series as s (s.key)}
            <path d={linePath(s.values)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            {#if showDots}
              {#each s.values as v, i (i)}
                <circle cx={x(i)} cy={y(v)} r="4" fill={s.color} stroke="var(--color-card)" stroke-width="2" />
              {/each}
            {:else if active !== null}
              <circle cx={x(active)} cy={y(s.values[active] ?? 0)} r="5" fill={s.color} stroke="var(--color-card)" stroke-width="2" />
            {/if}
          {/each}
        {/if}
        <line x1={M.l} x2={w - M.r} y1={M.t + innerH} y2={M.t + innerH} stroke="var(--color-gray)" stroke-width="1" />
      </svg>

      {#if active !== null}
        <div class="tip" style:left="{tipLeft}px" aria-hidden="true">
          <strong>{titles[active]}</strong>
          {#each series as s (s.key)}
            <span class="row"><span class="sw dot" style:background={s.color}></span>{s.label}<b>{formatNumber(s.values[active] ?? 0)}</b></span>
          {/each}
        </div>
      {/if}
      <span class="sr-only" aria-live="polite">{summary}</span>
    </div>
  {/if}
</figure>

<style>
  .fig {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
    min-width: 0;
  }
  .cap {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm) var(--space-md);
  }
  .ttl {
    font-weight: 700;
    margin-inline-end: auto;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    font-size: var(--fs-sm);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    display: inline-block;
    flex: none;
  }
  .sw.line {
    width: 18px;
    height: 3px;
    border-radius: 2px;
  }
  .sw.bar,
  .sw.dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .tools {
    display: inline-flex;
    gap: var(--space-xs);
  }
  .tbtn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 36px;
    padding: 0 12px;
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-primary);
    font-size: var(--fs-xs);
    font-weight: 700;
  }
  .tbtn:hover {
    background: var(--color-primary-tint);
  }
  .plot {
    position: relative;
    direction: ltr;
    min-height: 240px;
  }
  svg {
    display: block;
    max-width: none;
    overflow: visible;
    border-radius: var(--radius-sm);
  }
  svg:focus-visible {
    outline: 3px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ax {
    font-size: 11px;
    fill: var(--color-muted);
    font-family: var(--font-ui);
  }
  .tip {
    position: absolute;
    top: 8px;
    transform: translateX(-50%);
    display: grid;
    gap: 2px;
    min-width: 8.5rem;
    padding: 8px 12px;
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-radius: var(--radius-sm);
    box-shadow: var(--elev-2);
    font-size: var(--fs-xs);
    direction: rtl;
    pointer-events: none;
    z-index: 5;
  }
  .tip strong {
    font-size: var(--fs-sm);
  }
  .tip .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tip .row b {
    margin-inline-start: auto;
    font-variant-numeric: tabular-nums;
  }
  .none {
    padding: var(--space-xl) 0;
    text-align: center;
    min-height: 240px;
    display: grid;
    place-items: center;
  }
</style>
