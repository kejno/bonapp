# Исправления PR BNP-154

## Issues/Notes

- Разрешены конфликты с `main` в пяти файлах; административные маршруты PR объединены с KDS-функциональностью основной ветки.
- История миграций сохранена append-only: добавлена миграция `20260926220000_admin_order_guests` после миграции основной ветки `20260926180000_kds_staff_departments`.
- В `input/BNP-154` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `ticket.md`, `pr_files.txt` и файлы родительского контекста. Использованы доступные `request.md`, ответы на вопросы и обсуждения PR.
- `MenuGateway` ранее создавался в двух Nest-модулях и дважды подключался к одному HTTP-серверу. Оставлен один экземпляр, а закрытие Socket.io-сервера привязано к завершению модуля.
- Для завершения e2e-процесса потребовался флаг Jest `--forceExit`: после успешных assertions тестовый процесс оставлял открытый асинхронный дескриптор.

## Approach

- События статуса отправляются в `tenant:<tenantId>` для QR-гостей и `tenant_kitchen:<tenantId>` для авторизованных клиентов кухни. `MenuGateway` предоставляется одним экземпляром через `MenuModule`.
- Активные заказы агрегируют позиции по `kitchenDepartment` и `itemId` в границах заказа; для совпавших позиций суммируется количество.
- Добавлен `POST /admin/orders`: запрос проверяет стол и телефон гостя, нормализует белорусский номер, ищет или создаёт гостя в текущем tenant и создаёт заказ в одной транзакции.
- Детали заказа включают позиции и платежи. Отправка изменений статуса выполняется после успешного завершения транзакции.
- Сохранены KDS-маршруты, события `order:created`/`order:updated` и `tenant:service_mode_changed` из `main`.

## Files Modified

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260926220000_admin_order_guests/migration.sql` — модель гостя, связь с заказом, уникальность телефона и RLS-изоляция в рамках tenant.
- `apps/api/src/menu/menu.gateway.ts`, `apps/api/src/menu/menu.gateway.spec.ts` — доставка события статуса в используемые комнаты и проверка маршрутизации.
- `apps/api/src/tenant/tenant.module.ts` — импорт `MenuModule` вместо повторной регистрации gateway.
- `apps/api/src/orders/admin-orders.controller.ts`, `apps/api/src/orders/admin-orders.controller.spec.ts` — административное создание заказа и валидация запроса.
- `apps/api/src/orders/orders.module.ts` — регистрация административного контроллера.
- `apps/api/src/orders/orders.service.ts` — агрегация заказов, привязка гостя и фиксация статуса с публикацией после транзакции.
- `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/orders/kds-orders.service.spec.ts`, `apps/api/src/orders/phone-number.ts`, `apps/api/src/orders/phone-number.spec.ts` — регрессионные проверки и нормализация телефона.
- `apps/api/test/admin-orders.e2e-spec.ts` — сквозная проверка создания заказа, агрегации KDS и доставки события подключённому гостю и кухне через реальный Socket.io.
- `apps/api/package.json`, `package-lock.json` — `socket.io-client` объявлен как зависимость e2e-тестов API.
- `outputs/review_replies.json`, `outputs/review_replies/thread_1.md`, `outputs/review_replies/thread_2.md` — ответы на оба открытых inline-треда.

## Test Coverage

- `npx prisma generate --schema apps/api/prisma/schema.prisma` — успешно; обновлён локальный Prisma Client для текущей схемы.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts apps/api/src/tenant/tenant.module.ts apps/api/src/orders/admin-orders.controller.ts apps/api/src/orders/admin-orders.controller.spec.ts apps/api/src/orders/orders.module.ts apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts apps/api/src/orders/kds-orders.service.spec.ts apps/api/src/orders/phone-number.ts apps/api/src/orders/phone-number.spec.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API — 58 наборов / 531 тест; admin-web — 28 файлов / 76 тестов; guest-web — 1 файл / 3 теста. Сборка и проверка design tokens прошли.
- `npm --workspace @bonapp/api run test:e2e -- --runInBand --detectOpenHandles --forceExit admin-orders.e2e-spec.ts` — успешно: 1 e2e-тест проверил POST, KDS-агрегацию и доставку `order:status_changed` подключённым QR-гостю и авторизованной кухне.
- `git diff --check` и `git diff --cached --check` — успешно.
- Blast-radius: поиском проверены все регистрации и потребители `MenuGateway`; интеграционный тест проверил подключение обеих ролей и доставку события после PATCH. Миграция добавлена append-only с timestamp позже миграций основной ветки.
