<script lang="ts">
  import { formatPlain } from '$lib/utils/format';

  interface Props {
    label: string;
    /** `HH:mm` (۲۴ ساعته) */
    value: string;
    disabled?: boolean;
    onchange: (value: string) => void;
  }
  let { label, value, disabled = false, onchange }: Props = $props();

  const hh = $derived(/^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) : 0);
  const mm = $derived(/^\d{2}:\d{2}$/.test(value) ? Number(value.slice(3, 5)) : 0);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  // گام ۵ دقیقه؛ اگر مقدار فعلی روی گام نباشد حفظ می‌شود
  const minutes = $derived([...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), mm])].sort((a, b) => a - b));
  const p2 = (n: number) => String(n).padStart(2, '0');
  const fa2 = (n: number) => `${formatPlain(Math.floor(n / 10))}${formatPlain(n % 10)}`;
</script>

<div class="time" role="group" aria-label={label} dir="ltr">
  <select aria-label={`${label} — دقیقه`} {disabled} value={mm} onchange={(e) => onchange(`${p2(hh)}:${p2(Number(e.currentTarget.value))}`)}>
    {#each minutes as m (m)}<option value={m}>{fa2(m)}</option>{/each}
  </select>
  <span aria-hidden="true">:</span>
  <select aria-label={`${label} — ساعت`} {disabled} value={hh} onchange={(e) => onchange(`${p2(Number(e.currentTarget.value))}:${p2(mm)}`)}>
    {#each hours as h (h)}<option value={h}>{fa2(h)}</option>{/each}
  </select>
</div>

<style>
  .time {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-xs);
  }
  select {
    width: 100%;
    min-height: var(--control-h);
    padding: 0 var(--space-sm);
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    font-size: var(--fs-md);
    font-family: inherit;
    text-align: center;
  }
  select:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  span {
    font-weight: 700;
  }
</style>
