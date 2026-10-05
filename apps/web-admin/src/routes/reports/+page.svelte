<script lang="ts">
  import { api, type LeaderboardItem, type OtpSeries, type RegistrationsSeries, type ReportOverview, type SessionsSeries } from '$lib/api';
  import { auth } from '$lib/auth/auth.svelte';
  import { system } from '$lib/auth/system.svelte';
  import { clientLabel } from '$lib/utils/labels';
  import { ROLE_TITLE } from '$lib/utils/audit';
  import { formatNumber, formatPercent } from '$lib/utils/format';
  import { Resource } from '$lib/utils/resource.svelte';
  import { UrlState } from '$lib/utils/urlState.svelte';
  import { type QuerySpec } from '$lib/utils/urlQuery';
  import { PRESET_LABEL, isValidIsoDate, presetRange, todayTehran, validateRange, type RangePreset } from '$lib/utils/dates';
  import { INTERVAL_LABEL, bucketLabel, bucketTitle, jalaliString, type Interval } from '$lib/utils/buckets';
  import { buildCsv, downloadCsv } from '$lib/utils/csv';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import JalaliDateField from '$lib/components/ui/JalaliDateField.svelte';
  import KpiTile from '$lib/components/ui/KpiTile.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import NoticeBanner from '$lib/components/ui/NoticeBanner.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
  import BarList from '$lib/components/charts/BarList.svelte';

  const spec = {
    preset: { def: '30d', allowed: ['7d', '30d', '90d', 'year', 'custom'] },
    from: { def: '', valid: isValidIsoDate },
    to: { def: '', valid: isValidIsoDate },
    interval: { def: 'day', allowed: ['day', 'week', 'month'] }
  } satisfies QuerySpec;
  const url = new UrlState(spec);

  const today = todayTehran();
  const presets: Exclude<RangePreset, 'custom'>[] = ['7d', '30d', '90d', 'year'];
  const preset = $derived(url.values.preset as RangePreset);
  const interval = $derived(url.values.interval as Interval);

  // بازهٔ سفارشی با دکمهٔ «اعمال» (تا هر انتخابِ ناقص درخواست نزند)
  let draftFrom = $state(url.values.from || presetRange('30d', today).from);
  let draftTo = $state(url.values.to || today);
  $effect(() => {
    if (url.values.from) draftFrom = url.values.from;
    if (url.values.to) draftTo = url.values.to;
  });
  const draftCheck = $derived(validateRange(draftFrom, draftTo));

  const range = $derived.by(() => {
    if (preset !== 'custom') return { ...presetRange(preset as Exclude<RangePreset, 'custom'>, today), error: null as string | null };
    const f = url.values.from || draftFrom;
    const t = url.values.to || draftTo;
    const c = validateRange(f, t);
    return { from: f, to: t, error: c.ok ? null : c.error };
  });

  const overview = new Resource<ReportOverview>();
  const regs = new Resource<RegistrationsSeries>();
  const sess = new Resource<SessionsSeries>();
  const otp = new Resource<OtpSeries>();
  const board = new Resource<LeaderboardItem[]>();
  const allowed = $derived(system.can('system.reports.view'));

  function loadOverview() {
    if (!allowed || range.error) return;
    const r = { from: range.from, to: range.to };
    void overview.loadLatest((signal) => auth.withAuth((t) => api.system.reportOverview(t, r, { signal })));
    void board.loadLatest((signal) => auth.withAuth((t) => api.system.reportLeaderboard(t, 20, { signal })));
  }
  function loadSeries() {
    if (!allowed || range.error) return;
    const r = { from: range.from, to: range.to, interval };
    void regs.loadLatest((signal) => auth.withAuth((t) => api.system.reportRegistrations(t, r, { signal })));
    void sess.loadLatest((signal) => auth.withAuth((t) => api.system.reportSessions(t, r, { signal })));
    void otp.loadLatest((signal) => auth.withAuth((t) => api.system.reportOtp(t, r, { signal })));
  }
  $effect(() => {
    void [allowed, range.from, range.to, range.error];
    loadOverview();
  });
  $effect(() => {
    void [allowed, range.from, range.to, range.error, interval];
    loadSeries();
  });

  function pickPreset(p: RangePreset) {
    if (p === 'custom') url.set({ preset: 'custom', from: draftFrom, to: draftTo });
    else url.set({ preset: p, from: '', to: '' });
  }
  const applyCustom = () => draftCheck.ok && url.set({ preset: 'custom', from: draftFrom, to: draftTo });

  // ───────── نمایش ─────────
  const ov = $derived(overview.data);
  const convert = $derived(ov?.messaging && ov.messaging.otpRequested > 0 ? (ov.messaging.otpVerified / ov.messaging.otpRequested) * 100 : null);
  const T = (s: { bucket: string }[]) => s.map((i) => bucketTitle(i.bucket, interval));
  const L = (s: { bucket: string }[]) => s.map((i) => bucketLabel(i.bucket, interval));

  // ───────── CSV ─────────
  const stamp = $derived(`${range.from}_${range.to}`);
  const exportSeries = (name: string, header: string[], rows: (string | number)[][]) => downloadCsv(`${name}-${stamp}`, buildCsv(header, rows));
  function exportOverview() {
    if (!ov) return;
    const rows: (string | number | null)[][] = [
      ['کاربران', 'کل', ov.users.total],
      ['کاربران', 'ثبت‌نام در بازه', ov.users.registered],
      ['کاربران', 'فعال', ov.users.byStatus.active],
      ['کاربران', 'غیرفعال', ov.users.byStatus.disabled],
      ['کاربران', 'حذف‌شده', ov.users.byStatus.deleted],
      ['کاربران', ROLE_TITLE.developer ?? '', ov.users.byRole.developer],
      ['کاربران', ROLE_TITLE.super_admin ?? '', ov.users.byRole.super_admin],
      ['کاربران', 'بدون نقش', ov.users.byRole.none],
      ['کاربران', 'دارای رمز', ov.users.withPassword],
      ['جلسه‌ها', 'کل', ov.sessions.total],
      ['جلسه‌ها', 'ساخته‌شده در بازه', ov.sessions.created],
      ['جلسه‌ها', 'پیش‌نویس', ov.sessions.byStatus.draft],
      ['جلسه‌ها', 'پیش‌رو', ov.sessions.byStatus.scheduled],
      ['جلسه‌ها', 'در حال برگزاری', ov.sessions.byStatus.started],
      ['جلسه‌ها', 'پایان‌یافته', ov.sessions.byStatus.ended],
      ['مشارکت', 'حضور', ov.participation.attendance],
      ['مشارکت', 'ارزیابی', ov.participation.evaluations],
      ['مشارکت', 'میانگین نمره', ov.participation.avgScore],
      ['مشارکت', 'امتیاز اعطاشده', ov.participation.pointsAwarded],
      ['پیامک', 'درخواست کد', ov.messaging?.otpRequested ?? null],
      ['پیامک', 'کد تأییدشده', ov.messaging?.otpVerified ?? null],
      ...ov.clients.map((c) => ['نشست فعال به تفکیک پنل', clientLabel(c.client), c.activeSessions])
    ];
    downloadCsv(`report-overview-${stamp}`, buildCsv(['بخش', 'شاخص', 'مقدار'], rows));
  }
</script>

<svelte:head><title>آمار و گزارش‌ها — مدیریت اسراء</title></svelte:head>

<PageHeader title="آمار و گزارش‌ها" subtitle="تحلیل کاربران، جلسه‌ها، مشارکت و پیامک در بازهٔ دلخواه (به وقت تهران؛ هفته از شنبه).">
  {#snippet actions()}
    <Button variant="secondary" size="sm" disabled={!ov} onclick={exportOverview}><Icon name="download" size={18} />CSV خلاصه</Button>
  {/snippet}
</PageHeader>

{#if !allowed}
  <EmptyState icon="lock" title="دسترسی به گزارش‌ها ندارید" message="مجوز «مشاهدهٔ گزارش‌های تحلیلی» برای نقش شما فعال نیست." />
{:else}
  <div class="controls card" role="group" aria-label="بازهٔ گزارش">
    <div class="pill-row" role="group" aria-label="بازهٔ زمانی">
      {#each presets as p (p)}
        <button type="button" class="chipbtn" class:active={preset === p} aria-pressed={preset === p} onclick={() => pickPreset(p)}>{PRESET_LABEL[p]}</button>
      {/each}
      <button type="button" class="chipbtn" class:active={preset === 'custom'} aria-pressed={preset === 'custom'} onclick={() => pickPreset('custom')}>{PRESET_LABEL.custom}</button>
    </div>
    {#if preset === 'custom'}
      <div class="custom">
        <JalaliDateField label="از تاریخ" value={draftFrom} onchange={(v) => (draftFrom = v)} />
        <JalaliDateField label="تا تاریخ" value={draftTo} onchange={(v) => (draftTo = v)} />
        <Button onclick={applyCustom} disabled={!draftCheck.ok}>اعمال بازه</Button>
      </div>
      {#if !draftCheck.ok}<NoticeBanner tone="warning" role="alert">{draftCheck.error}</NoticeBanner>{/if}
    {/if}
    <p class="muted fa-small" aria-live="polite">بازهٔ نمایش‌داده‌شده: {jalaliString(range.from)} تا {jalaliString(range.to)}</p>
    <div class="pill-row" role="group" aria-label="گام نمودارها">
      {#each ['day', 'week', 'month'] as iv (iv)}
        <button type="button" class="chipbtn" class:active={interval === iv} aria-pressed={interval === iv} onclick={() => url.set({ interval: iv })}>{INTERVAL_LABEL[iv as Interval]}</button>
      {/each}
    </div>
  </div>

  {#if range.error}
    <NoticeBanner tone="error" role="alert">{range.error}</NoticeBanner>
  {:else}
    <!-- ───────── خلاصه ───────── -->
    {#if overview.status === 'error'}
      <EmptyState icon="alert" tone="error" compact title="خلاصهٔ گزارش بارگذاری نشد" message={overview.error ?? ''}>
        {#snippet action()}<Button variant="secondary" onclick={loadOverview}>تلاش دوباره</Button>{/snippet}
      </EmptyState>
    {:else if !ov}
      <div class="kpis" aria-hidden="true">{#each [0, 1, 2, 3, 4, 5, 6, 7] as i (i)}<Skeleton h="88px" radius="var(--radius-md)" />{/each}</div>
      <span class="sr-only" role="status">در حال بارگذاری…</span>
    {:else}
      <section aria-labelledby="k-u" class="sec">
        <h2 id="k-u">کاربران</h2>
        <div class="kpis">
          <KpiTile label="کل کاربران" value={ov.users.total} />
          <KpiTile label="ثبت‌نام در بازه" value={ov.users.registered} />
          <KpiTile label="فعال" value={ov.users.byStatus.active} />
          <KpiTile label="غیرفعال" value={ov.users.byStatus.disabled} />
          <KpiTile label="حذف‌شده" value={ov.users.byStatus.deleted} />
          <KpiTile label="دارای رمز" value={ov.users.withPassword} hint={ov.users.withPassword !== null && ov.users.total > 0 ? formatPercent((ov.users.withPassword / ov.users.total) * 100) : undefined} />
          <KpiTile label="توسعه‌دهنده" value={ov.users.byRole.developer} />
          <KpiTile label="مدیر کل" value={ov.users.byRole.super_admin} />
        </div>
      </section>

      <section aria-labelledby="k-s" class="sec">
        <h2 id="k-s">جلسه‌ها و مشارکت</h2>
        <div class="kpis">
          <KpiTile label="کل جلسه‌ها" value={ov.sessions.total} />
          <KpiTile label="ساخته‌شده در بازه" value={ov.sessions.created} />
          <KpiTile label="در حال برگزاری" value={ov.sessions.byStatus.started} />
          <KpiTile label="پیش‌رو" value={ov.sessions.byStatus.scheduled} />
          <KpiTile label="پایان‌یافته" value={ov.sessions.byStatus.ended} />
          <KpiTile label="پیش‌نویس" value={ov.sessions.byStatus.draft} />
          <KpiTile label="حضور ثبت‌شده" value={ov.participation.attendance} />
          <KpiTile label="ارزیابی" value={ov.participation.evaluations} />
          <KpiTile label="میانگین نمره" value={ov.participation.avgScore === null ? null : formatNumber(Math.round(ov.participation.avgScore * 10) / 10)} unit="از ۱۰۰" />
          <KpiTile label="امتیاز اعطاشده" value={ov.participation.pointsAwarded} />
        </div>
      </section>

      <section aria-labelledby="k-m" class="sec">
        <h2 id="k-m">پیامک و پنل‌ها</h2>
        <div class="kpis">
          <KpiTile label="درخواست کد پیامکی" value={ov.messaging ? ov.messaging.otpRequested : null} />
          <KpiTile label="کد تأییدشده" value={ov.messaging ? ov.messaging.otpVerified : null} hint={convert !== null ? `نرخ تأیید ${formatPercent(convert)}` : undefined} />
        </div>
        {#if !ov.messaging}<NoticeBanner tone="warning">آمار پیامک موقتاً در دسترس نیست (سرویس مبدأ پاسخ نداد).</NoticeBanner>{/if}
        <BarList title="نشست‌های فعال به تفکیک پنل/اپ" items={ov.clients.map((c) => ({ label: clientLabel(c.client), value: c.activeSessions }))} color="var(--chart-3)" />
        {#if ov.clients.length === 0}<p class="muted fa-small">اطلاعات نشست‌های فعال در دسترس نیست.</p>{/if}
      </section>
    {/if}

    <!-- ───────── سری‌های زمانی ───────── -->
    <section aria-labelledby="c-h" class="sec">
      <h2 id="c-h">روند زمانی ({INTERVAL_LABEL[interval]})</h2>
      <div class="charts">
        {#if regs.data}
          <TimeSeriesChart
            title="ثبت‌نام کاربران"
            kind="bar"
            labels={L(regs.data.items)}
            titles={T(regs.data.items)}
            series={[{ key: 'count', label: 'ثبت‌نام', color: 'var(--chart-1)', values: regs.data.items.map((i) => i.count) }]}
            onexport={() => exportSeries('registrations', ['بازه (شروع)', 'بازه (شمسی)', 'ثبت‌نام'], regs.data!.items.map((i) => [i.bucket, bucketTitle(i.bucket, interval), i.count]))}
          />
        {:else if regs.status === 'error'}
          <EmptyState icon="alert" tone="error" compact title="روند ثبت‌نام بارگذاری نشد" message={regs.error ?? ''}>
            {#snippet action()}<Button variant="secondary" onclick={loadSeries}>تلاش دوباره</Button>{/snippet}
          </EmptyState>
        {:else}<Skeleton h="300px" radius="var(--radius-lg)" />{/if}

        {#if otp.data}
          <TimeSeriesChart
            title="پیامک کد ورود"
            labels={L(otp.data.items)}
            titles={T(otp.data.items)}
            series={[
              { key: 'requested', label: 'درخواست‌شده', color: 'var(--chart-1)', values: otp.data.items.map((i) => i.requested) },
              { key: 'verified', label: 'تأییدشده', color: 'var(--chart-2)', values: otp.data.items.map((i) => i.verified) }
            ]}
            onexport={() => exportSeries('otp', ['بازه (شروع)', 'بازه (شمسی)', 'درخواست‌شده', 'تأییدشده'], otp.data!.items.map((i) => [i.bucket, bucketTitle(i.bucket, interval), i.requested, i.verified]))}
          />
        {:else if otp.status === 'error'}
          <EmptyState icon="alert" tone="error" compact title="روند پیامک بارگذاری نشد" message={otp.error ?? ''}>
            {#snippet action()}<Button variant="secondary" onclick={loadSeries}>تلاش دوباره</Button>{/snippet}
          </EmptyState>
        {:else}<Skeleton h="300px" radius="var(--radius-lg)" />{/if}

        {#if sess.data}
          <TimeSeriesChart
            title="جلسه‌های ساخته‌شده و برگزارشده"
            labels={L(sess.data.items)}
            titles={T(sess.data.items)}
            series={[
              { key: 'created', label: 'ساخته‌شده', color: 'var(--chart-1)', values: sess.data.items.map((i) => i.created) },
              { key: 'held', label: 'برگزارشده', color: 'var(--chart-3)', values: sess.data.items.map((i) => i.held) }
            ]}
            onexport={() => exportSeries('sessions', ['بازه (شروع)', 'بازه (شمسی)', 'ساخته‌شده', 'برگزارشده', 'حضور'], sess.data!.items.map((i) => [i.bucket, bucketTitle(i.bucket, interval), i.created, i.held, i.attendance]))}
          />
          <TimeSeriesChart
            title="حضور در جلسه‌ها"
            kind="bar"
            labels={L(sess.data.items)}
            titles={T(sess.data.items)}
            series={[{ key: 'attendance', label: 'حضور', color: 'var(--chart-2)', values: sess.data.items.map((i) => i.attendance) }]}
          />
        {:else if sess.status === 'error'}
          <EmptyState icon="alert" tone="error" compact title="روند جلسه‌ها بارگذاری نشد" message={sess.error ?? ''}>
            {#snippet action()}<Button variant="secondary" onclick={loadSeries}>تلاش دوباره</Button>{/snippet}
          </EmptyState>
        {:else}<Skeleton h="300px" radius="var(--radius-lg)" />{/if}
      </div>
    </section>

    <!-- ───────── جدول برترین‌ها ───────── -->
    <section aria-labelledby="lb-h" class="sec">
      <div class="sec-head">
        <h2 id="lb-h">برترین کاربران (امتیاز)</h2>
        <Button variant="secondary" size="sm" disabled={!board.data?.length} onclick={() => exportSeries('leaderboard', ['رتبه', 'شناسه', 'نام', 'امتیاز', 'نشان'], board.data!.map((b, i) => [i + 1, b.userId, b.name, b.points, b.badges]))}><Icon name="download" size={18} />CSV</Button>
      </div>
      {#if board.status === 'error'}
        <EmptyState icon="alert" tone="error" compact title="جدول برترین‌ها بارگذاری نشد" message={board.error ?? ''}>
          {#snippet action()}<Button variant="secondary" onclick={loadOverview}>تلاش دوباره</Button>{/snippet}
        </EmptyState>
      {:else if !board.data}
        <Skeleton h="200px" radius="var(--radius-md)" />
      {:else if board.data.length === 0}
        <EmptyState icon="award" compact title="هنوز امتیازی ثبت نشده" />
      {:else}
        <div class="tblwrap">
          <table class="tbl">
            <caption class="sr-only">برترین کاربران بر اساس امتیاز</caption>
            <thead><tr><th scope="col">رتبه</th><th scope="col">نام</th><th scope="col" class="n">امتیاز</th><th scope="col" class="n">نشان</th></tr></thead>
            <tbody>
              {#each board.data as b, i (b.userId)}
                <tr><td class="num">{formatNumber(i + 1)}</td><th scope="row">{b.name || 'کاربر حذف‌شده'}</th><td class="n">{formatNumber(b.points)}</td><td class="n">{formatNumber(b.badges)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .controls {
    margin-bottom: var(--space-lg);
  }
  .custom {
    display: grid;
    gap: var(--space-md);
    align-items: end;
  }
  @media (min-width: 800px) {
    .custom {
      grid-template-columns: 1fr 1fr auto;
    }
  }
  .sec {
    display: grid;
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
  }
  .sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-sm);
  }
  @media (min-width: 720px) {
    .kpis {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .charts {
    display: grid;
    gap: var(--space-md);
  }
  @media (min-width: 1100px) {
    .charts {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
