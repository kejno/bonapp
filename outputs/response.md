# Повторная проверка PR BNP-154

## Issues/Notes

- Закрыто блокирующее замечание об утечке статусов заказов между QR-гостями. QR-сокет не подключается к общей комнате tenant; доступ в `order_<id>` выдаётся только после проверки QR-токена или активной сессии и принадлежности активного заказа столу.
- E2E-проверка подтверждает, что заказ видят его гость и KDS, а гость другого стола не может подключиться к комнате и не получает событие.
- В `input/BNP-154/` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt` и `merge_conflicts.md`. `rework_setup_failed.md` не найден. Инструкции проекта прочитаны из корневого `CLAUDE.md`.

## Approach

- Проверены `joinOrderRoom`, `joinTenantRoom` и `emitOrderStatusChanged`: гостевые комнаты привязаны к заказу, а комнаты кухни и зала доступны после проверки staff access token.
- Проверены подключения и публикации Socket.io-комнат поиском `rg` по `apps` и `packages`; CodeGraph недоступен.
- Проверены обращения к `guestId`/`guest_id` в `apps/api/src` и `apps/api/test`. Миграция добавлена новой; существующие миграции не изменялись.

## Files Modified

- `apps/api/src/menu/menu.gateway.ts` — изолированное подключение гостя к комнате заказа и доставка статуса в комнаты заказа и кухни.
- `apps/api/src/menu/menu.gateway.spec.ts` — проверки маршрутизации событий.
- `apps/api/test/admin-orders.e2e-spec.ts` — сквозная проверка доступа своего и чужого гостя, доставки статуса гостю и KDS.
- `apps/api/src/orders/` — административные маршруты, создание заказов, снимки/агрегация KDS и связанные регрессионные тесты.
- `apps/api/src/tenant/tenant.module.ts` — регистрация зависимости gateway.
- `apps/api/prisma/schema.prisma` и `apps/api/prisma/migrations/20260926220000_admin_order_guests/migration.sql` — модель гостя и связь с заказом.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — отчёт и ответ на открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — проверены; незакоммичен только обновлённый `outputs/response.md`.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace после `npx prisma generate --schema apps/api/prisma/schema.prisma`. До генерации клиент был устаревшим и не содержал `TransactionClient.guest`.
- `npm test` — успешно: API — 61 suite / 542 теста, admin-web — 29 файлов / 80 тестов, guest-web — 3 файла / 11 тестов; также прошли сборка и проверка design tokens.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 suite / 1 тест.
- `git diff --check` — успешно.
- `git diff --name-status origin/main...HEAD -- '*/migrations/*'` — успешно: присутствует только новая миграция; потребители `guestId` проверены поиском `rg`.
