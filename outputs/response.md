# Исправления PR #151

## Issues/Notes

- Оба открытых inline-замечания учтены: добавлен подключённый экран оформления заказа и серверный сценарий создания заказа; `qrToken` передаётся в JSON body и заголовке `X-QR-Token`.
- В `input/BNP-143` нет CI-логов, `pr_files.txt`, отдельного `ticket.md` или спецификации. Требования проверены по `request.md`, обсуждениям PR и `pr_discussions_raw.json`.
- Для typecheck и тестов сгенерирован Prisma Client по схеме ветки командой `npx prisma generate --schema apps/api/prisma/schema.prisma`.

## Approach

- Экран `/order/checkout` позволяет менять количество и удалять позиции, вводить комментарий до 255 символов, видеть сумму и подтверждать заказ. Корзина и комментарий сохраняются при навигации и очищаются только после успешного ответа API.
- API проверяет доступность блюд, выбранные и обязательные модификаторы, комментарий и режим обслуживания; цены рассчитываются по актуальному меню на сервере. Создание заказа и присвоение номера выполняются в транзакции, после чего событие `order:created` отправляется кухонной комнате.
- Ежедневный номер формируется по локальной дате tenant. Изменённые потребители `dailyOrderNumber` проверены поиском по `apps/` и `packages/`; CodeGraph недоступен.
- Проверка миграций показала только две новые миграции, существующие миграции не изменялись.

## Files Modified

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260927000000_daily_order_number_date/migration.sql`, `apps/api/prisma/migrations/20260927000001_backfill_daily_order_number_date/migration.sql` — хранение даты ежедневного счётчика и обратное заполнение.
- `apps/api/src/guest-session/guest-orders.controller.ts`, `guest-session.module.ts`, `guest-session.service.ts`, `apps/api/src/orders/daily-order-number.ts`, `daily-order-number.spec.ts`, `orders.service.ts`, `orders.service.spec.ts`, `apps/api/src/staff/shift.service.ts` — endpoint и атомарная нумерация.
- `apps/api/test/guest-orders.e2e-spec.ts` — интеграционные сценарии создания заказа.
- `apps/guest-web/src/App.tsx`, `App.test.tsx`, `CheckoutPage.tsx`, `guest-session.ts`, `guest-session.test.ts`, `apps/guest-web/src/orders/cart.store.ts`, `cart.store.test.ts` — маршрут checkout, отправка запроса и сохранение корзины.
- `outputs/review_replies.json`, `outputs/review_replies/thread_1.md`, `thread_2.md` — отдельные ответы на оба открытых inline-треда.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; перед обновлением этого отчёта рабочее дерево было чистым, сейчас изменён только `outputs/response.md`.
- `npx eslint` по изменённым TypeScript-файлам — успешно, ошибок нет; выданы два предупреждения `@typescript-eslint/no-unsafe-argument` в `guest-session.service.ts:36` и `orders.service.ts:240`.
- `npm run typecheck` — все четыре workspace прошли после генерации Prisma Client.
- `npm test` — успешно: API 60 наборов/538 тестов, admin-web 29 наборов/80 тестов, guest-web 5 наборов/16 тестов; сборка и проверка design tokens тоже прошли.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` — успешно применены 35 миграций к локальной тестовой базе. `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp npm run test:e2e --workspace @bonapp/api -- --runInBand test/guest-orders.e2e-spec.ts` — 5/5 сценариев пройдены; проверены HTTP 201, сумма с модификаторами, ежедневный номер, валидация и доставка `order:created`. Запуск без `DATABASE_URL` не прошёл из-за отсутствующей переменной окружения; успешный повтор выполнен с адресом локальной тестовой БД.
- `git diff --check origin/main...HEAD` — успешно. Blast-radius ежедневного счётчика проверен поиском всех потребителей в `apps/` и `packages/`; существующие миграции не менялись.
- `outputs/review_replies.json` сопоставлен с `pr_discussions_raw.json`: для каждого из двух открытых тредов указаны `threadId`, `inReplyToId` и путь к отдельному Markdown-ответу.
