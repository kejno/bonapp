# Исправления PR BNP-154

## Issues/Notes

- В единственном открытом inline-треде сообщалось об утечке статуса и ID заказа между QR-гостями. Исправление и сквозной регрессионный тест уже есть в ветке PR; в этой итерации исходный код не менялся.
- Подготовленные материалы не содержат `instruction.md`, `pr_files.txt`, `ci_failures.md`, `ci_failures_full.log`, `merge_conflicts.md`, `ticket.md` и файлов спецификаций. Инструкции репозитория прочитаны из `CLAUDE.md` и `.dmtools/agents/instructions/pr_rework/`.
- В `pr_discussions_raw.json` две старые сводные рецензии также помечены открытыми, но у них отсутствуют `threadId` и `rootCommentId`. Адресный ответ можно сформировать только для единственного открытого inline-треда; два предыдущих inline-треда уже закрыты.

## Approach

- Проверил, что QR-сокет не присоединяется к общей комнате tenant. Обработчик `join_order_room` проверяет действующую table session и активный заказ за тем же столом, затем добавляет гостя в `order_<id>`.
- Проверил доставку статуса: событие направляется в комнату заказа и авторизованную комнату кухни/зала согласно статусу.
- Сквозной тест создает два заказа за разными столами, подключает двух гостей к своим комнатам и проверяет, что статус первого заказа получает его гость и кухня, а второй гость события не получает.
- Проверил миграцию: добавлена новая `20260926220000_admin_order_guests/migration.sql`; последняя миграция в `origin/main` имеет метку `20260926180001`, существующие миграции не изменены.
- CodeGraph недоступен; влияние изменений проверено поиском `rg` по `apps/api/src` и `apps/api/test` для `guestId`, `guests` и `tableSession`.

## Files Modified

- `outputs/response.md` — отчёт о проверке этой итерации.
- `outputs/review_replies.json` и `outputs/review_replies/thread_1.md` — адресный ответ на открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены для проверки файлов PR и рабочей копии.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- `npm exec --workspace @bonapp/api prisma generate -- --schema prisma/schema.prisma` — успешно; обновлён сгенерированный клиент. Первая попытка typecheck до генерации показала устаревший Prisma Client.
- `npm run typecheck` — успешно во всех четырёх workspace после генерации клиента.
- `npm test` — успешно: API — 60 наборов / 538 тестов, admin-web — 29 файлов / 80 тестов, guest-web — 1 файл / 5 тестов. Сборки приложений и проверка design tokens также прошли.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 набор / 1 тест; проверены доставка статуса гостю заказа и кухне, а также отсутствие события у гостя другого стола.
- `git diff --check` — успешно. Проверка blast radius Socket.io выполнена поиском `rg`; проверка миграций подтвердила, что существующие миграции не изменены и новая миграция новее миграций базовой ветки.
