# Bonapp — SaaS-платформа для ресторанов (multi-tenant)

QR-меню для гостя, кухонный KDS-экран в реальном времени, касса/фискализация
и платежи для Республики Беларусь (Оплати, ЕРИП, bePaid).

## Монорепозиторий

Turborepo / pnpm workspaces:

- `apps/guest-web` — гостевой QR-клиент (мобильный PWA). Критичны холодный
  старт (<0.4с на 3G/LTE) и размер бандла (<150 КБ). React + Vite + Zustand.
- `apps/admin-web` — панель ресторатора: админка, KDS, настройки. Десктопный
  SPA — таблицы, канбан, звуковые уведомления, графики. React + Vite +
  TanStack Query + Zustand.
- `apps/api` — бэкенд, единая точка входа для обоих фронтов.
- `packages/shared-types` — общие TypeScript-интерфейсы: заказы, DTO,
  статусы. Импортируется всеми apps/*, не дублировать типы вручную.

## Frontend — стек

- **React + Vite** — сборка, обе апп (guest-web, admin-web).
- **Zustand** — локальный UI-стейт и корзина стола (не серверные данные).
- **TanStack Query** — все серверные данные (fetch/cache/invalidate), только
  в `admin-web`; в `guest-web` — по необходимости, приоритет всё равно на
  минимальный бандл.
- **Vitest** — юнит-тесты, co-located `*.spec.ts`/`*.test.tsx` рядом с кодом.
- **Playwright** — e2e-тесты.
- **Tailwind CSS** (v3.4/v4) — единственный CSS-слой. Не добавлять Emotion,
  styled-components, MUI, Ant Design, Mantine — тяжёлый рантайм и bundle
  size конфликтуют с бюджетом гостевого PWA.
- **shadcn/ui** — базовые примитивы (модалки, дропдауны, табы), копируются
  в проект и кастомизируются напрямую, не как closed-box зависимость.
- Шрифт: Plus Jakarta Sans / Inter (без засечек). Акцентный цвет `#e0533c`,
  фон `#faf8f5`, скругления `rounded-xl` — задать через `tailwind.config`
  theme tokens, не хардкодить hex в компонентах.

### Bundle budget (guest-web)

Гостевой клиент — приоритет №1 производительность. Перед добавлением любой
новой зависимости в `apps/guest-web` проверить влияние на размер бандла;
тяжёлые библиотеки (графики, rich-text, большие icon-sets) — только в
`admin-web`.

## Backend — стек

- **NestJS + TypeScript** — модульный монолит, Dependency Injection.
- **Jest** — тесты (юнит co-located `*.spec.ts`, e2e в `test/*.e2e-spec.ts`,
  стандартный Nest CLI layout).
- **PostgreSQL** — основное хранилище (tenants, users, orders, tables,
  fiscal payments). ORM — Prisma или Drizzle (зафиксировать один вариант при
  первой миграции, не смешивать).
- **Redis + BullMQ** — кэш меню, WebSocket rooms, очередь payment webhooks.
- **Socket.io** — real-time слой (KDS, статусы заказов).

### Multi-tenancy

Tenant isolation на уровне middleware/guard в API Gateway — каждый запрос
резолвит `tenantId` до бизнес-логики (RLS в Postgres или explicit tenantId
scoping в каждом запросе — зафиксировать подход при первой миграции).
Auth — JWT для персонала, Table Session для гостя (без аккаунта).

### Интеграции Республики Беларусь

- **Оплати™** — платёжный шлюз, QR & Deep-Link API.
- **ЕРИП E-POS** (bePaid / Webpay) — платёжный шлюз.
- **СКНО / «Титан-Плюс»** — программная касса, фискализация.
- **iiko Cloud API / r_keeper** — интеграция с внешними POS-системами
  (опционально, не для MVP).

Все платёжные webhooks идут через Redis/BullMQ очередь, не обрабатывать
синхронно в HTTP-хендлере.

## Тестирование — где что писать

| Слой | Юнит | E2E |
|---|---|---|
| `apps/api` | Jest, co-located `src/**/*.spec.ts` | Jest, `test/*.e2e-spec.ts` (supertest) |
| `apps/guest-web` | Vitest, co-located | Playwright |
| `apps/admin-web` | Vitest, co-located | Playwright |

## dmtools — Jira SM-пайплайн

В `.dmtools/` настроен автономный пайплайн (Story/Bug: intake → dev → PR →
test automation → done), работает через DMTools CLI + Claude Code как
Teammate-агент. Подробности, известные баги, статус настройки —
`.dmtools/README.md`. Диаграмма пайплайна — `.dmtools/PIPELINE.md`.

**Язык:** весь Jira/PR-контент (тикеты, комментарии, описания PR) агенты
пишут на русском (`.dmtools/agents/instructions/common/language.md`). Код,
комментарии в коде, commit-сообщения, branch/file names — на английском.

Jira-проект: `BNP` (kejno.atlassian.net). Repo: `kejno/bonapp`.

## Прочее

- Атрибуцию Claude (`Co-Authored-By`) в git-коммиты bonapp не добавлять.
- Коммиты — на английском (даже когда Jira/PR-контент на русском).
