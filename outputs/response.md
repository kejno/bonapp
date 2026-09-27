# Проверка PR BNP-154

## Issues/Notes

- Единственный открытый inline-тред сообщал об утечке статуса и ID заказа гостям других столов. В HEAD доступ к `order_<id>` выдаётся только после проверки действующей table session и принадлежности активного заказа её столу. Статус гостю уходит только в комнату заказа; KDS получает событие в авторизованной комнате кухни.
- Регрессионный E2E в `apps/api/test/admin-orders.e2e-spec.ts` проверяет создание двух заказов, запрет гостю другого стола присоединиться к комнате заказа, доставку события владельцу заказа и кухне, отсутствие события у постороннего гостя, а также агрегацию позиций по цехам.
- В `pr_discussions_raw.json` найден один открытый inline-тред с `threadId` и `rootCommentId`; ответ на него подготовлен. Открытые сводные отзывы не содержат идентификаторов тредов и не являются inline-тредами. Другие inline-треды разрешены.
- В `input/BNP-154` отсутствуют `instruction.md`, `pr_files.txt`, CI-логи, `merge_conflicts.md` и `ticket.md`. Прочитаны доступные материалы PR, `CLAUDE.md` и инструкции `agents/instructions/pr_rework/`.
- Первая проверка ESLint выявила ошибки типов из-за устаревшего сгенерированного Prisma Client. После `npx prisma generate --schema apps/api/prisma/schema.prisma` ESLint прошёл без ошибок; файлы исходного кода для устранения этой локальной проблемы не менялись.

## Approach

- Проверил авторизацию гостей, комнаты Socket.io и вызовы публикации статуса в API. Гости не присоединяются к общей tenant-комнате; доступ в комнату заказа ограничен действующей table session и столом заказа.
- Проверил потребителей `guestId`, `guest_id`, `tableSession` и `kitchenDepartment` поиском `rg` в `apps/api/src`, Prisma-схеме и миграциях. CodeGraph недоступен.
- Проверил миграции: `git diff --name-status origin/main...HEAD -- '*/migrations/*'` показывает только новую `20260926220000_admin_order_guests/migration.sql`; существующие миграции не изменены.

## Files Modified

- `apps/api/test/admin-orders.e2e-spec.ts` — E2E-проверка доступа в комнату заказа и изоляции статусного события.
- `outputs/response.md` — результаты повторных проверок.
- `outputs/review_replies.json` и `outputs/review_replies/thread_1.md` — ответ на открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; проверены состав PR и чистота рабочей копии.
- `npx prisma generate --schema apps/api/prisma/schema.prisma` — успешно.
- `npx eslint apps/api/src/menu/menu.gateway.spec.ts apps/api/src/menu/menu.gateway.ts apps/api/src/orders/admin-orders.controller.spec.ts apps/api/src/orders/admin-orders.controller.ts apps/api/src/orders/kds-orders.service.spec.ts apps/api/src/orders/orders.module.ts apps/api/src/orders/orders.service.spec.ts apps/api/src/orders/orders.service.ts apps/api/src/orders/phone-number.spec.ts apps/api/src/orders/phone-number.ts apps/api/src/tenant/tenant.module.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно после генерации Prisma Client.
- `npm run typecheck` — успешно во всех 4 workspace.
- `npm test` — успешно: API — 60 наборов / 538 тестов; admin-web — 29 файлов / 80 тестов; guest-web — 1 файл / 5 тестов. Сборка приложений и проверка design tokens также прошли.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 набор / 1 тест.
- `git diff --check` — успешно. Проверка blast radius для схемы и миграции: просмотрены ссылки на гостя, сессии стола и цеха; добавлена только новая миграция, существующие миграции не изменены.
