# Исправления PR BNP-154

## Issues/Notes

- Исправлены оба открытых блокирующих замечания: статусные события теперь доходят до подключённых гостевых и кухонных клиентов, а активные заказы агрегируют одинаковые позиции по цеху и блюду.
- В `input/BNP-154` не предоставлены `ci_failures.md`, `ci_failures_full.log` и `merge_conflicts.md`; отдельных CI-ошибок и списка конфликтующих фрагментов в контексте нет.
- Первый запуск typecheck/lint обнаружил устаревший сгенерированный Prisma Client без модели `Guest`. После `npx prisma generate --schema prisma/schema.prisma` проверки прошли.

## Approach

- `MenuGateway` отправляет `order:status_changed` в комнаты QR-гостей `tenant:<tenantId>` и авторизованной кухни `tenant_kitchen:<tenantId>`. Оставлен один экземпляр gateway через `MenuModule`.
- `GET /admin/orders/active` группирует строки каждого заказа по `kitchenDepartment` и `itemId`, суммируя количество.
- Сквозной тест создаёт заказ через HTTP, проверяет агрегацию нескольких строк в двух цехах и подтверждает доставку события обоим подключённым Socket.io-клиентам.

## Files Modified

- `apps/api/src/menu/menu.gateway.ts`, `apps/api/test/admin-orders.e2e-spec.ts` — доставка статусов и интеграционное покрытие обоих открытых замечаний.
- `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/orders/kds-orders.service.spec.ts`, `apps/api/src/menu/menu.gateway.spec.ts`, `apps/api/src/tenant/tenant.module.ts` — API заказов, агрегация, проверка маршрутизации и единая регистрация gateway.
- `apps/api/src/orders/admin-orders.controller.ts`, `apps/api/src/orders/admin-orders.controller.spec.ts`, `apps/api/src/orders/phone-number.ts`, `apps/api/src/orders/phone-number.spec.ts`, `apps/api/src/orders/orders.module.ts` — административное создание заказа и проверка телефона.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260926220000_admin_order_guests/migration.sql` — модель гостя и tenant-scoped связь с заказом.
- `apps/api/package.json`, `package-lock.json` — клиент Socket.io для интеграционного теста.
- `outputs/review_replies.json`, `outputs/review_replies/thread_1.md`, `outputs/review_replies/thread_2.md` — ответы на оба открытых inline-треда.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` — проверен список файлов PR.
- `git status --short` — рабочее дерево было чистым до обновления этого отчёта.
- `npx prisma generate --schema prisma/schema.prisma` — успешно; обновлён локальный клиент для схемы проекта.
- `npx eslint` для всех изменённых TypeScript-файлов API — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API — 58 наборов / 531 тест; admin-web — 28 файлов / 76 тестов; guest-web — 1 файл / 3 теста. Сборка и проверка design tokens также прошли.
- `npm --workspace @bonapp/api run test:e2e -- --runInBand --detectOpenHandles --forceExit admin-orders.e2e-spec.ts` — успешно; проверены POST, агрегация и доставка события обоим подключённым клиентам.
- `git diff origin/main...HEAD --name-status -- '*/migrations/*'` — добавлена только новая миграция `20260926220000_admin_order_guests`; существующие миграции не изменены. Поиск по `apps/api/src` и `apps/api/test` проверил использования `Guest`/`guestId`.
- `git diff --check` и `git diff --cached --check` — успешно.
