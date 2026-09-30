# اسراء (Isra)

پلتفرم جلسات قرآن. منبع حقیقت: `docs-v2/` (شروع از `docs-v2/README.md`).

## ساختار
| مسیر | توضیح |
|------|-------|
| `apps/android-low` `android-mid` `android-high` | Kotlin + Compose؛ `ir.isra.low` / `ir.isra.mid` / `ir.isra.high` |
| `apps/web-main` | SvelteKit 2 + Svelte 5 — `israapp.ir` |
| `apps/web-admin` | SvelteKit 2 + Svelte 5 — `admin.israapp.ir` |
| `services/api-low` `api-mid` `api-high` | NestJS + TypeORM + MySQL؛ `/c/v1` `/o/v1` `/s/v1` روی `api.israapp.ir` |
| `packages/` | `jwt-verify`، `api-types` (placeholder) |
| `design/` | دارایی طراحی مالک (فونت YekanBakh در `design/fonts`) |
| `media/` | فایل‌های media روی همان host (نه MinIO) |

Timezone: `Asia/Tehran` (هفته شنبه–جمعه). بدون Docker.

## دستورات
```
pnpm install
pnpm turbo lint typecheck test build
```
