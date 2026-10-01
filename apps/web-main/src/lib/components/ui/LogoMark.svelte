<script lang="ts">
  interface Props {
    size?: number;
    /** رنگ ستاره روی زمینهٔ روشن/تیره */
    tone?: 'dark' | 'light';
  }
  let { size = 32, tone = 'dark' }: Props = $props();
  const fg = $derived(tone === 'dark' ? 'var(--color-primary)' : 'var(--color-accent-warm)');
  const bg = $derived(tone === 'dark' ? 'var(--color-accent-warm)' : 'var(--color-primary)');
</script>

<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <rect width="64" height="64" rx="14" fill={bg} />
  <g transform="translate(32 32)" fill={fg}>
    <rect x="-14" y="-14" width="28" height="28" />
    <rect x="-14" y="-14" width="28" height="28" transform="rotate(45)" />
  </g>
  <circle cx="32" cy="32" r="8" fill={bg} />
  <circle cx="32" cy="32" r="3" fill={fg} />
</svg>
