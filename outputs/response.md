# Повторная проверка PR BNP-154

## Issues/Notes

- Закрыто открытое блокирующее замечание о раскрытии статусов другим QR-гостям. В `apps/api/src/menu/menu.gateway.ts` вход в `order_<id>` разрешается только после проверки table session и принадлежности активного заказа столу этой сессии. Событие заказа отправляется в его комнату, а кухня получает его только в авторизованной комнате `tenant_<id>_kitchen`.
- E2E проверяет, что гость другого стола не может войти в комнату заказа и не получает его статус; заказчик и авторизованный клиент кухни событие получают.
- Других открытых inline review-тредов нет. Ветка содержит новую миграцию гостей; существующие миграции не изменялись.
- В подготовленном `input/BNP-154` отсутствуют `instruction.md`, `pr_files.txt`, CI-логи, `ticket.md`, `merge_conflicts.md` и связанные спецификации. Использованы имеющиеся описание запроса, обсуждения, сведения о PR и diff.

## Approach

- Сверил реализацию с открытым замечанием и требованиями тикета: создание административного заказа, активные заказы с агрегацией по позиции и цеху, статусная машина и доставка событий.
- Проверил blast radius схемы поиском по проекту для полей гостя, сессии стола и цеха; CodeGraph в доступном окружении отсутствует.
- `git diff --name-status origin/main...HEAD -- '*/migrations/*'` показывает только добавление `apps/api/prisma/migrations/20260926220000_admin_order_guests/migration.sql`. Изменённых ранее существовавших миграций нет.

## Files Modified

- `apps/api/prisma/schema.prisma` и `apps/api/prisma/migrations/20260926220000_admin_order_guests/migration.sql` — модель гостя, связь с заказом и tenant-изоляция.
- `apps/api/src/menu/menu.gateway.ts`, `apps/api/src/menu/menu.gateway.spec.ts` — авторизация комнаты заказа и адресная доставка статуса.
- `apps/api/src/orders/admin-orders.controller.ts`, `apps/api/src/orders/admin-orders.controller.spec.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/orders/kds-orders.service.spec.ts`, `apps/api/src/orders/orders.module.ts`, `apps/api/src/orders/phone-number.ts`, `apps/api/src/orders/phone-number.spec.ts`, `apps/api/src/tenant/tenant.module.ts` — административный API, создание заказа, агрегация KDS, нормализация телефона и зависимости модулей.
- `apps/api/test/admin-orders.e2e-spec.ts` — проверка создания заказа, агрегации и изоляции Socket.io-события.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — отчёт и ответ на открытый review-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- `npx prisma generate --schema apps/api/prisma/schema.prisma` — успешно.
- `npx eslint` по изменённым исходным и тестовым файлам API — успешно после генерации Prisma Client.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API — 61 suite / 542 теста; admin-web — 29 файлов / 80 тестов; guest-web — 3 файла / 11 тестов. Сборки и проверка design tokens также прошли.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 suite / 1 тест.
- `git diff --check origin/main...HEAD` — успешно. Для blast radius схемы просмотрены обращения к гостям, table session и цехам; для миграций проверено, что существующие файлы не менялись.
