<script lang="ts">
  import type { Evaluation } from '$lib/api/mid-types';
  import { formatNumber, formatRelative } from '$lib/utils/format';
  import { weightShare } from '$lib/utils/evaluation';

  interface Props {
    evaluation: Evaluation;
    /** true: نمای کادر (نام قرآن‌آموز نمایش داده می‌شود) */
    staff?: boolean;
  }
  let { evaluation: e, staff = false }: Props = $props();

  /** snapshot معیارها در لحظهٔ ثبت (۱.۷.۰؛ تغییر بعدی معیار اثری ندارد) */
  const bars = $derived(e.criteria.map((c) => ({ id: c.criterionId, k: c.title, v: c.score, max: c.maxScore, w: weightShare(c.weight, e.criteria) })));
</script>

<article class="card">
  <div class="top">
    <div>
      <strong>{staff ? e.userName : 'ارزیابی قرائت شما'}</strong>
      <p class="muted small">توسط {e.evaluatorName} · {formatRelative(e.createdAt)}</p>
    </div>
    <div class="score" aria-label={`امتیاز ${formatNumber(e.score)} از ۱۰۰`}>
      <strong>{formatNumber(e.score)}</strong><small>از ۱۰۰</small>
    </div>
  </div>
  <ul class="bars">
    {#each bars as b (b.id)}
      <li>
        <span class="k">{b.k} <span class="muted">({formatNumber(b.w)}٪)</span></span>
        <span class="bar" aria-hidden="true"><span style:width="{b.max > 0 ? (b.v / b.max) * 100 : 0}%"></span></span>
        <span class="v" title={`از ${formatNumber(b.max)}`}>{formatNumber(b.v)}</span>
      </li>
    {/each}
  </ul>
  {#if e.note}<p class="note">«{e.note}»</p>{/if}
  <p class="muted small">+{formatNumber(e.points)} امتیاز</p>
</article>

<style>
  .card {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .top {
    display: flex;
    justify-content: space-between;
    gap: var(--space-md);
  }
  .small {
    font-size: var(--fs-sm);
  }
  .score {
    display: grid;
    place-items: center;
    min-width: 72px;
    padding: 4px 12px;
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--color-accent-warm);
  }
  .score strong {
    font-size: var(--fs-xl);
    line-height: 1.3;
  }
  .score small {
    color: var(--color-on-primary);
    font-size: var(--fs-xs);
  }
  .bars {
    display: grid;
    gap: 6px;
  }
  .bars li {
    display: grid;
    grid-template-columns: 7.5rem 1fr 2rem;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--fs-sm);
  }
  .bar {
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--color-neutral);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--color-accent);
    border-radius: inherit;
  }
  .v {
    text-align: end;
    font-weight: 700;
  }
  .note {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-warm-tint);
    font-size: var(--fs-sm);
  }
</style>
