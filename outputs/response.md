# Исправления PR #151

## Issues/Notes

- Закрыты замечания о незавершённом сценарии оформления заказа и отсутствии `qrToken` в JSON body. Подготовлены ответы для обоих открытых inline-тредов в `outputs/review_replies/`.
- В `input/BNP-143` отсутствуют CI-отчёты, `pr_files.txt`, `ticket.md` и отдельные спецификации; требования сверены с `request.md` и обсуждениями. Корневой `instruction.md` отсутствует; прочитаны `CLAUDE.md` и инструкции `.dmtools/agents/instructions/pr_rework/`.

## Approach

- Подключён checkout: гость редактирует сохраняемую корзину и комментарий, отправляет заказ через API; корзина очищается и открывается страница статуса только после успешного ответа.
- Запрос передаёт `qrToken` в JSON body и сохраняет заголовок `X-QR-Token`. API проверяет корзину, доступность блюд и модификаторов, рассчитывает цены по актуальному меню и публикует `order:created` в кухонную комнату.
- Ежедневная нумерация использует локальную дату tenant и транзакционную блокировку. Поиск по `apps/` и `packages/` подтвердил синхронизацию обоих production-вызовов `order.create`; CodeGraph недоступен.
- Миграции только добавлены; существующие не изменялись. Их timestamps идут после миграций базовой ветки.

## Files Modified

- `apps/guest-web/src/App.tsx`, `CheckoutPage.tsx`, `orders/cart.store.ts` и связанные тесты — маршрут оформления, редактирование и сохранение корзины.
- `apps/guest-web/src/guest-session.ts` и тест — `qrToken` в теле POST-запроса.
- `apps/api/src/guest-session/`, `apps/api/test/guest-orders.e2e-spec.ts` — endpoint, проверки заказа, расчёт суммы и событие кухни.
- `apps/api/src/orders/`, `apps/api/src/staff/shift.service.ts` и связанные тесты — ежедневная нумерация заказов.
- `apps/api/prisma/schema.prisma` и две новые миграции — хранение даты счётчика и заполнение существующих значений.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md`, `outputs/review_replies/thread_2.md` — сводка и ответы на замечания.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — проверены; перед обновлением этого отчёта рабочее дерево было чистым. `git diff --check` — успешно.
- `npx eslint` по 16 изменённым TypeScript-файлам — успешно, ошибок и предупреждений нет. Проверка lint была повторена после генерации Prisma Client.
- Первый `npm run typecheck` обнаружил устаревший локальный Prisma Client. После `npx prisma generate --schema apps/api/prisma/schema.prisma` `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API 60 наборов/538 тестов, admin-web 29 наборов/80 тестов, guest-web 5 наборов/16 тестов; сборка и проверка design tokens также прошли.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` — успешно. `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp npm run test:e2e --workspace @bonapp/api -- --runInBand test/guest-orders.e2e-spec.ts` — успешно, 5 сценариев: HTTP 201, серверная сумма, ежедневный номер, проверки модификаторов и стоп-листа, пустая корзина, длина комментария и событие `order:created`.
- Blast-radius для нового поля проверен поиском по `apps/` и `packages/`: два production-вызова создания заказа обновляют счётчик транзакционно. `git diff --name-status origin/main...HEAD -- '*/migrations/*'` показывает только две добавленные миграции.
- Структура `outputs/review_replies.json` сверена с двумя открытыми тредами из `pr_discussions_raw.json`; для каждого указаны `threadId`, `inReplyToId` и путь к отдельному Markdown-ответу.
