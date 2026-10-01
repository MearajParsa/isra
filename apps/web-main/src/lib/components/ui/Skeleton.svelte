<script lang="ts">
  interface Props {
    w?: string;
    h?: string;
    radius?: string;
  }
  let { w = '100%', h = '1rem', radius = 'var(--radius-sm)' }: Props = $props();
</script>

<span class="sk" style:width={w} style:height={h} style:border-radius={radius} aria-hidden="true"></span>

<style>
  .sk {
    display: block;
    background: linear-gradient(
      90deg,
      var(--color-secondary) 0%,
      color-mix(in srgb, var(--color-secondary) 55%, white) 50%,
      var(--color-secondary) 100%
    );
    background-size: 200% 100%;
    animation: sh 1.4s ease-in-out infinite;
  }
  @keyframes sh {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }
</style>
