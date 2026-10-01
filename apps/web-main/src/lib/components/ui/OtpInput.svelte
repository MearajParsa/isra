<script lang="ts">
  import { toLatinCode } from '$lib/utils/phone';

  interface Props {
    length?: number;
    value?: string;
    disabled?: boolean;
    invalid?: boolean;
    label?: string;
    oncomplete?: (code: string) => void;
    /** افزایش این شمارنده، ورودی را پاک و فوکوس می‌کند و حالت لرزش را اجرا می‌کند */
    resetSignal?: number;
  }

  let {
    length = 5,
    value = $bindable(''),
    disabled = false,
    invalid = false,
    label = 'کد تأیید',
    oncomplete,
    resetSignal = 0
  }: Props = $props();

  let cells: HTMLInputElement[] = $state([]);
  let shake = $state(false);

  const digits = $derived(Array.from({ length }, (_, i) => value[i] ?? ''));

  function setValue(next: string) {
    value = next.slice(0, length);
    if (value.length === length) oncomplete?.(value);
  }

  function onInput(i: number, e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const typed = toLatinCode(el.value);
    if (!typed) {
      el.value = digits[i];
      return;
    }
    if (typed.length > 1) {
      // paste / auto-fill
      const merged = (value.slice(0, i) + typed).slice(0, length);
      setValue(merged);
      cells[Math.min(merged.length, length - 1)]?.focus();
      return;
    }
    const arr = digits.slice();
    arr[i] = typed;
    setValue(arr.join('').slice(0, length));
    if (i < length - 1) cells[i + 1]?.focus();
  }

  function onKeydown(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) {
        setValue(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        setValue(value.slice(0, i - 1) + value.slice(i));
        cells[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i < length - 1) {
      cells[i + 1]?.focus();
    } else if (e.key === 'ArrowRight' && i > 0) {
      cells[i - 1]?.focus();
    }
  }

  let lastSignal = 0;
  $effect(() => {
    if (resetSignal !== lastSignal) {
      lastSignal = resetSignal;
      value = '';
      shake = true;
      cells[0]?.focus();
      const t = setTimeout(() => (shake = false), 450);
      return () => clearTimeout(t);
    }
  });
</script>

<div class="otp" class:shake class:invalid role="group" aria-label={label} dir="ltr">
  {#each digits as d, i (i)}
    <input
      bind:this={cells[i]}
      class="cell"
      type="text"
      inputmode="numeric"
      autocomplete={i === 0 ? 'one-time-code' : 'off'}
      maxlength={i === 0 ? length : 1}
      value={d}
      {disabled}
      aria-label={`رقم ${i + 1} از ${length}`}
      oninput={(e) => onInput(i, e)}
      onkeydown={(e) => onKeydown(i, e)}
      onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
    />
  {/each}
</div>

<style>
  .otp {
    display: flex;
    justify-content: center;
    gap: var(--space-sm);
  }
  .cell {
    width: 100%;
    max-width: 56px;
    min-height: 60px;
    padding: 0;
    text-align: center;
    font-size: var(--fs-xl);
    font-weight: 700;
    background: var(--color-card);
    border: 1.5px solid var(--color-outline);
    border-radius: var(--radius-md);
    transition:
      border-color var(--dur) var(--ease),
      box-shadow var(--dur) var(--ease);
  }
  .cell:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }
  .cell:disabled {
    background: var(--color-secondary);
    color: var(--color-muted);
  }
  .invalid .cell {
    border-color: var(--color-error);
  }
  .shake {
    animation: shake 0.4s var(--ease);
  }
  @keyframes shake {
    20% {
      transform: translateX(-6px);
    }
    40% {
      transform: translateX(6px);
    }
    60% {
      transform: translateX(-4px);
    }
    80% {
      transform: translateX(4px);
    }
  }
</style>
