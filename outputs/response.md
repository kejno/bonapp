# Исправления PR BNP-154

## Issues/Notes

- Открытый inline-тред указывал на утечку статуса заказа и его ID гостям других столов. В текущем diff PR уже есть проверка гостевой сессии и принадлежности активного заказа тому же столу; отдельные изменения исходного кода в этой итерации не потребовались.
- `instruction.md`, `pr_files.txt`, файлы CI, сведения о конфликтах и `ticket.md` в `input/BNP-154` отсутствуют. Прочитаны проектный `CLAUDE.md` и инструкции `.dmtools/agents/instructions/pr_rework/`.
- В `pr_discussions_raw.json` только один открытый inline-тред имеет `threadId` и `rootCommentId`; на него подготовлен адресный ответ. Старые сводные отзывы лишены этих идентификаторов, а два предыдущих inline-треда уже закрыты.

## Approach

- Проверил обработчик `join_order_room`: он проверяет действующую table session и наличие незавершённого заказа за тем же столом, после чего подключает гостя к `order_<id>`. Сокет гостя не добавляется в общую комнату tenant.
- Статус заказа отправляется в комнату заказа, а персонал кухни/зала получает его только в соответствующей авторизованной комнате.
- E2E сценарий создает заказы на двух столах, подключает двух гостей к своим комнатам и проверяет, что статус заказа получает его гость и кухня, а гость второго стола события не получает.
- Проверка blast radius выполнена поиском `rg` по использованию `tableSession`, `guestId`, комнат Socket.io и вызовам отправки статуса в `apps/api/src` и `apps/api/test`. CodeGraph недоступен.
- Проверка миграций показала только новую миграцию `20260926220000_admin_order_guests/migration.sql`; существующие миграции не изменены.

## Files Modified

- `outputs/response.md` — отчет о проверке этой итерации.
- `outputs/review_replies.json` и `outputs/review_replies/thread_1.md` — адресный ответ на открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; рабочее дерево было чистым.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- Первая попытка `npm run typecheck` обнаружила неактуальный сгенерированный Prisma Client (`TransactionClient` не содержал поле `guest`). Выполнил `npm exec --workspace @bonapp/api prisma generate -- --schema prisma/schema.prisma`, затем повторный `npm run typecheck` прошел во всех четырех workspace.
- `npm test` — успешно: API — 60 наборов / 538 тестов, admin-web — 29 файлов / 80 тестов, guest-web — 1 файл / 5 тестов; также прошли сборки и проверка design tokens.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 набор / 1 тест. Проверены доставка статуса гостю заказа и кухне, а также изоляция от гостя другого стола.
- Проверка миграций: `git diff --name-status origin/main...HEAD -- '*/migrations/*'` — только новая миграция. Существующие миграции не редактировались.
