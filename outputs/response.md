# Повторная проверка PR BNP-154

## Issues/Notes

- Закрыто блокирующее замечание об утечке статусов между QR-гостями. Гостевой сокет подключается к комнате `order_<id>` только после проверки QR-токена или активной сессии и принадлежности активного заказа столу.
- Статусы заказа отправляются в его комнату и в соответствующую комнату кухни/зала, доступную только персоналу с действительным access token.
- E2E-тест проверяет доступ гостя к своему заказу, отказ гостю другого стола и отсутствие у него события статуса.
- В `.dmtools/input/BNP-154/` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt` и `merge_conflicts.md`. Файл `rework_setup_failed.md` не найден. Инструкции проекта прочитаны из `CLAUDE.md`.

## Approach

- Проверены `joinOrderRoom`, `joinTenantRoom` и `emitOrderStatusChanged`.
- Поиск `rg` по `apps` и `packages` подтвердил места подключения и публикации Socket.io-комнат; CodeGraph недоступен.
- Проверены использования `guestId`/`guest_id`. Изменена только новая миграция добавления гостя, существующие миграции не редактировались.
- Сгенерирован Prisma Client по актуальной схеме: исходный клиент в окружении не содержал модели `Guest`.

## Files Modified

- `apps/api/src/menu/menu.gateway.ts` — авторизация гостя для комнаты конкретного заказа и адресная доставка статуса.
- `apps/api/src/menu/menu.gateway.spec.ts` и `apps/api/test/admin-orders.e2e-spec.ts` — проверки маршрутизации и изоляции гостевых событий.
- `apps/api/src/orders/` — административные маршруты, создание заказа, агрегация KDS и регрессионные тесты.
- `apps/api/src/tenant/tenant.module.ts` — регистрация зависимости gateway.
- `apps/api/prisma/schema.prisma` и `apps/api/prisma/migrations/20260926220000_admin_order_guests/migration.sql` — модель гостя и связь с заказом.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — отчёт и ответ на единственный открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` — проверен состав PR; `git status --short` перед обновлением отчёта показал чистое дерево.
- `npx prisma generate --schema apps/api/prisma/schema.prisma` — успешно.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts apps/api/src/orders/admin-orders.controller.spec.ts apps/api/src/orders/admin-orders.controller.ts apps/api/src/orders/kds-orders.service.spec.ts apps/api/src/orders/orders.module.ts apps/api/src/orders/orders.service.spec.ts apps/api/src/orders/orders.service.ts apps/api/src/orders/phone-number.spec.ts apps/api/src/orders/phone-number.ts apps/api/src/tenant/tenant.module.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- `npm run typecheck` — успешно для всех четырёх workspace.
- `npm test` — успешно: API 61 suite / 542 теста, admin-web 29 файлов / 80 тестов, guest-web 3 файла / 11 тестов; сборка и проверка design tokens также завершились успешно.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 suite / 1 тест.
- `git diff --check` — успешно.
- `git diff --name-status origin/main...HEAD -- '*/migrations/*'` — показал только новую миграцию. Потребители `guestId` проверены поиском `rg` по `apps/api/src` и `apps/api/test`.
