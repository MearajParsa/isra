<script lang="ts">
  /** تزئین هندسی هشت‌پر برای hero؛ با prefers-reduced-motion ثابت می‌ماند */
  let { size = 360 }: { size?: number } = $props();
  const rings = [1, 0.8, 0.6, 0.4];
</script>

<svg class="orn" width={size} height={size} viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
  {#each rings as r, i (i)}
    <g class="ring r{i}" fill="none" stroke="var(--color-accent-warm)" stroke-width={i === 0 ? 0.7 : 0.9} opacity={0.9 - i * 0.18}>
      <rect x={-60 * r} y={-60 * r} width={120 * r} height={120 * r} />
      <rect x={-60 * r} y={-60 * r} width={120 * r} height={120 * r} transform="rotate(45)" />
    </g>
  {/each}
  <circle r="14" fill="var(--color-accent-warm)" />
  <circle r="6" fill="var(--color-primary)" />
</svg>

<style>
  .orn {
    max-width: 100%;
    height: auto;
  }
  .ring {
    transform-origin: center;
    animation: turn 60s linear infinite;
  }
  .r1 {
    animation-duration: 80s;
    animation-direction: reverse;
  }
  .r2 {
    animation-duration: 100s;
  }
  .r3 {
    animation-duration: 120s;
    animation-direction: reverse;
  }
  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }
</style>
