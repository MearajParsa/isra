<script lang="ts">
  interface Props {
    name?: string;
    src?: string | null;
    size?: number;
  }
  let { name = '', src = null, size = 40 }: Props = $props();
  const initial = $derived(name.trim().charAt(0) || '؟');
</script>

<span class="avatar" style:width="{size}px" style:height="{size}px" style:font-size="{size * 0.42}px">
  {#if src}
    <img {src} alt="" />
  {:else}
    <span aria-hidden="true">{initial}</span>
  {/if}
</span>

<style>
  .avatar {
    display: inline-grid;
    place-items: center;
    flex: none;
    border-radius: 50%;
    background: var(--color-secondary);
    color: var(--color-primary);
    font-weight: 700;
    overflow: hidden;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
