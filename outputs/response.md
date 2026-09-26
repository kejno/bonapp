# Исправления PR BNP-154

## Issues/Notes

- Исправлена утечка `orderId` и статуса между QR-гостями одного tenant: гостевой клиент должен подтвердить действующую сессию стола и принадлежность заказа этому столу, прежде чем войти в комнату заказа.
- В подготовленных материалах отсутствуют `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt`, `ticket.md` и `instruction.md` в корне репозитория; CI-ошибки отдельно не описаны.
- Разрешены все конфликтные файлы. Сохранены изменения основной ветки по сессиям столов и изменения PR по API заказов.

## Approach

- Статус отправляется только в комнату конкретного заказа для гостя и в подходящую комнату авторизованного персонала для KDS/зала. Общая tenant-комната для QR-гостей не используется.
- E2E-тест подключает гостей двух столов с разными сессиями и проверяет получение события только владельцем заказа, а также доставку в KDS.
- Исправлена циклическая инъекция `OrdersService`/`MenuGateway`; сохранена поддержка `accessToken` в handshake клиента персонала.

## Files Modified

- `apps/api/src/menu/menu.gateway.ts`, `apps/api/src/menu/menu.gateway.spec.ts`, `apps/api/test/admin-orders.e2e-spec.ts` — авторизация комнат и регрессионная проверка изоляции гостевых событий.
- `apps/api/src/orders/orders.module.ts`, `apps/api/src/orders/orders.service.ts` — доступность сервиса через циклический импорт.
- `apps/api/src/orders/*`, `apps/api/src/guest-session/guest-session.service.ts`, `apps/api/src/prisma/*`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260926180001_add_table_sessions/migration.sql` — административное создание/чтение заказов, гостевые сессии, снимки и агрегация KDS из текущей реализации PR.
- `apps/api/package.json`, `package-lock.json` — клиент Socket.io для интеграционной проверки.
- `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — ответ на единственный открытый inline-тред; ответы на уже закрытые треды удалены.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены для проверки файлов PR и состояния рабочего дерева.
- `npx eslint` по всем изменённым TypeScript-файлам — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API — 58 наборов / 531 тест; admin-web — 28 файлов / 76 тестов; guest-web — 1 файл / 3 теста. Сборка и проверка design tokens также завершились успешно.
- `npm --workspace @bonapp/api run test:e2e -- --runInBand --detectOpenHandles --forceExit admin-orders.e2e-spec.ts` — успешно; проверены создание заказов, агрегация позиций, доставка в KDS и изоляция гостей двух столов.
- Blast-radius для схемы и миграций проверен командами `git diff --name-status origin/main...HEAD -- '*/migrations/*'`, `git diff --cached origin/main --name-status -- '*/migrations/*'` и поиском `rg` по `tableSession`, `table_sessions`, `guestId` в `apps/api/src` и `apps/api/test`. Добавлена только миграция `20260926220000_admin_order_guests`; её timestamp позже последней миграции `origin/main` (`20260926180001_add_table_sessions`). Существующие миграции не изменялись. CodeGraph недоступен, потребители проверены поиском по исходникам.
- `git diff --check` и `git diff --cached --check` — успешно.
