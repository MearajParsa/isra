<script lang="ts">
  import type { ActiveCriterion, EvaluationInput } from '$lib/api/mid-types';
  import { formatNumber } from '$lib/utils/format';
  import { evaluationScore, weightShare } from '$lib/utils/evaluation';
  import Button from '$lib/components/ui/Button.svelte';
  import ScoreSlider from '$lib/components/ui/ScoreSlider.svelte';

  interface Props {
    name: string;
    /** M-45: معیارهای فعال (پویا؛ docs-v2/31 §۳) */
    criteria: ActiveCriterion[];
    busy?: boolean;
    errors?: Record<string, string>;
    onsubmit: (input: Omit<EvaluationInput, 'queueItemId'>) => void;
    oncancel: () => void;
  }
  let { name, criteria, busy = false, errors = {}, onsubmit, oncancel }: Props = $props();

  const sorted = $derived([...criteria].sort((a, b) => a.sortOrder - b.sortOrder));
  /** نمرهٔ هر معیار (پیش‌فرض: نیمهٔ سقف) */
  let values = $state<Record<string, number>>({});
  let note = $state('');

  $effect(() => {
    for (const c of sorted) if (values[c.id] === undefined) values[c.id] = Math.round(c.maxScore / 2);
  });

  const score = $derived(evaluationScore(sorted.map((c) => ({ weight: c.weight, maxScore: c.maxScore, score: values[c.id] ?? 0 }))));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    onsubmit({ scores: sorted.map((c) => ({ criterionId: c.id, score: values[c.id] ?? 0 })), note: note.trim() || undefined });
  }
</script>

<form class="form" onsubmit={submit}>
  <h3>ارزیابی قرائت «{name}»</h3>
  {#each sorted as c, i (c.id)}
    <ScoreSlider
      label={c.title}
      weight={weightShare(c.weight, sorted)}
      max={c.maxScore}
      bind:value={() => values[c.id] ?? 0, (v) => (values[c.id] = v)}
      error={errors[`scores.${i}.score`] ?? errors[`scores.${i}`] ?? null}
      disabled={busy}
    />
  {/each}
  {#if errors.scores}<p class="err" role="alert">{errors.scores}</p>{/if}

  <div class="total" aria-live="polite">
    <span>امتیاز کل (وزن‌دار)</span>
    <strong>{formatNumber(score)}<small>از ۱۰۰</small></strong>
  </div>

  <div class="field">
    <label for="ev-note">یادداشت (اختیاری)</label>
    <textarea id="ev-note" rows="3" maxlength="300" bind:value={note} disabled={busy} placeholder="بازخورد کوتاه برای قرآن‌آموز"></textarea>
    {#if errors.note}<p class="err" role="alert">{errors.note}</p>{/if}
  </div>

  <div class="acts">
    <Button type="submit" loading={busy}>ثبت ارزیابی</Button>
    <Button variant="text" disabled={busy} onclick={oncancel}>انصراف</Button>
  </div>
</form>

<style>
  .form {
    display: grid;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
  }
  .total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
  .total strong {
    font-size: var(--fs-xxl);
    color: var(--color-accent-warm);
  }
  .total small {
    font-size: var(--fs-sm);
    margin-inline-start: 2px;
    color: var(--color-on-primary);
  }
  .field {
    display: grid;
    gap: 6px;
  }
  label {
    font-weight: 700;
    font-size: var(--fs-sm);
  }
  textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    resize: vertical;
  }
  textarea:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  .err {
    color: var(--color-error);
    font-size: var(--fs-sm);
  }
  .acts {
    display: flex;
    gap: var(--space-sm);
  }
</style>
