<script lang="ts">
  import { pwa } from '$lib/stores/pwa.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import LogoMark from '$lib/components/ui/LogoMark.svelte';

  let iosOpen = $state(false);
</script>

{#if pwa.visible}
  <div class="install">
    <span class="tile"><LogoMark height={26} tone="light" /></span>
    <div class="txt">
      <strong>اسراء را روی گوشی نصب کنید</strong>
      <span class="muted">دسترسی سریع‌تر، بدون نیاز به مرورگر.</span>
    </div>
    <div class="acts">
      {#if pwa.canPrompt}
        <Button size="sm" onclick={() => pwa.install()}><Icon name="download" size={18} />نصب</Button>
      {:else}
        <Button size="sm" onclick={() => (iosOpen = true)}>راهنما</Button>
      {/if}
      <button type="button" class="x" onclick={() => pwa.dismiss()} aria-label="بستن">
        <Icon name="x" size={20} />
      </button>
    </div>
  </div>
{/if}

<Sheet bind:open={iosOpen} title="نصب روی آیفون و آیپد">
  <ol class="steps">
    <li>در Safari دکمهٔ <strong>اشتراک‌گذاری</strong> <Icon name="share" size={18} class="inl" /> را بزنید.</li>
    <li>گزینهٔ <strong>Add to Home Screen</strong> (افزودن به صفحهٔ اصلی) را انتخاب کنید.</li>
    <li>روی <strong>Add</strong> بزنید؛ آیکون اسراء روی صفحهٔ اصلی ساخته می‌شود.</li>
  </ol>
  {#snippet footer()}
    <Button full onclick={() => (iosOpen = false)}>متوجه شدم</Button>
  {/snippet}
</Sheet>

<style>
  .install {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--color-card);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-lg);
    box-shadow: var(--elev-1);
  }
  .tile {
    display: grid;
    place-items: center;
    flex: none;
    width: 52px;
    height: 52px;
    border-radius: var(--radius-md);
    background: var(--color-primary);
  }
  .txt {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.6;
  }
  .txt .muted {
    font-size: var(--fs-sm);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .x {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    background: transparent;
    color: var(--color-muted);
    border-radius: var(--radius-pill);
  }
  .x:hover {
    background: var(--color-secondary);
  }
  .steps {
    display: grid;
    gap: var(--space-md);
    padding-inline-start: 1.25rem;
    list-style: decimal;
  }
  :global(.inl) {
    display: inline-block;
    vertical-align: middle;
  }
  @media (max-width: 479px) {
    .install {
      flex-wrap: wrap;
    }
    .acts {
      margin-inline-start: auto;
    }
  }
</style>
