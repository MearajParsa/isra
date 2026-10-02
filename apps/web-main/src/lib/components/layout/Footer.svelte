<script lang="ts">
  import LogoMark from '$lib/components/ui/LogoMark.svelte';
  const year = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(new Date());
</script>

<footer class="foot">
  <div class="container inner">
    <div class="brand">
      <LogoMark height={64} tone="light" />
      <div>
        <p>پلتفرم جلسات قرآن؛ با هم بخوانیم، با هم پیش برویم.</p>
      </div>
    </div>
    <nav aria-label="پیوندهای پایین صفحه">
      <a href="/">صفحهٔ اول</a>
      <a href="/sessions">جلسات</a>
      <a href="/about">دربارهٔ اسراء</a>
      <a href="/privacy">حریم خصوصی</a>
      <a href="/terms">شرایط استفاده</a>
      <a href="/auth/phone">ورود / ثبت‌نام</a>
    </nav>
  </div>
  <div class="container copy">© {year} اسراء</div>
</footer>

<style>
  .foot {
    margin-top: var(--space-3xl);
    padding-block: var(--space-xl) var(--space-lg);
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
  .inner {
    display: grid;
    gap: var(--space-lg);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .brand p {
    color: color-mix(in srgb, var(--color-on-primary) 75%, transparent);
    font-size: var(--fs-sm);
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md) var(--space-lg);
  }
  nav a {
    color: var(--color-accent-warm);
    font-weight: 700;
    text-decoration: none;
  }
  nav a:hover {
    text-decoration: underline;
  }
  .copy {
    margin-top: var(--space-lg);
    padding-top: var(--space-md);
    border-top: 1px solid color-mix(in srgb, var(--color-on-primary) 18%, transparent);
    font-size: var(--fs-xs);
    color: color-mix(in srgb, var(--color-on-primary) 65%, transparent);
  }
  @media (min-width: 768px) {
    .inner {
      grid-template-columns: 1fr auto;
      align-items: center;
    }
  }
</style>
