# Исправления PR BNP-154

## Issues/Notes

- Разрешены конфликты с `main` в пяти файлах; административные маршруты PR объединены с KDS-функциональностью основной ветки.
- История миграций сохранена append-only: добавлена миграция `20260926220000_admin_order_guests` после миграции основной ветки `20260926180000_kds_staff_departments`.
- В `input/BNP-154` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `ticket.md`, `pr_files.txt` и файлы родительского контекста. Использованы доступные `request.md`, ответы на вопросы и обсуждения PR.

## Approach

- События статуса отправляются в `tenant:<tenantId>` для QR-гостей и `tenant_kitchen:<tenantId>` для авторизованных клиентов кухни. Это те же комнаты, в которые gateway подключает эти роли.
- Активные заказы агрегируют позиции по `kitchenDepartment` и `itemId` в границах заказа; для совпавших позиций суммируется количество.
- Добавлен `POST /admin/orders`: запрос проверяет стол и телефон гостя, нормализует белорусский номер, ищет или создаёт гостя в текущем tenant и создаёт заказ в одной транзакции.
- Детали заказа включают позиции и платежи. Отправка изменений статуса выполняется после успешного завершения транзакции.
- Сохранены KDS-маршруты, события `order:created`/`order:updated` и `tenant:service_mode_changed` из `main`.

## Files Modified

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260926220000_admin_order_guests/migration.sql` — модель гостя, связь с заказом, уникальность телефона и RLS-изоляция в рамках tenant.
- `apps/api/src/menu/menu.gateway.ts`, `apps/api/src/menu/menu.gateway.spec.ts` — доставка события статуса в используемые комнаты и проверка маршрутизации.
- `apps/api/src/orders/admin-orders.controller.ts`, `apps/api/src/orders/admin-orders.controller.spec.ts` — административное создание заказа и валидация запроса.
- `apps/api/src/orders/orders.module.ts` — регистрация административного контроллера.
- `apps/api/src/orders/orders.service.ts` — агрегация заказов, привязка гостя и фиксация статуса с публикацией после транзакции.
- `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/orders/kds-orders.service.spec.ts`, `apps/api/src/orders/phone-number.ts`, `apps/api/src/orders/phone-number.spec.ts` — регрессионные проверки и нормализация телефона.
- `outputs/review_replies.json`, `outputs/review_replies/thread_1.md`, `outputs/review_replies/thread_2.md` — ответы на оба открытых inline-треда.

## Test Coverage

- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts apps/api/src/orders/admin-orders.controller.ts apps/api/src/orders/admin-orders.controller.spec.ts apps/api/src/orders/orders.module.ts apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts apps/api/src/orders/kds-orders.service.spec.ts apps/api/src/orders/phone-number.ts apps/api/src/orders/phone-number.spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API — 58 наборов / 531 тест; admin-web — 28 файлов / 76 тестов; guest-web — 1 файл / 3 теста. Сборка и проверка design tokens прошли.
- `git diff --check` и `git diff --cached --check` — успешно.
- Blast-radius: `emitOrderStatusChanged` и его потребители проверены поиском по API; существующие KDS-подключения и события основной ветки сохранены и покрыты полным набором тестов. Проверено, что миграция добавлена новой и её timestamp позже миграций основной ветки.
