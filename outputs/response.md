# Исправления PR BNP-154

## Issues/Notes

- Ветка уже содержит исправление открытого блокирующего замечания: QR-гости не присоединяются к общей комнате tenant. Подключение к комнате заказа проходит только после проверки действующей table session и принадлежности активного заказа этому столу.
- Открытый тред проверен сквозным тестом: статус получает гость своего заказа и подключённая кухня, а гость другого стола не получает событие.
- `outputs/review_replies.json` содержит ответ для единственного открытого inline-треда `PRRT_kwDOUUbUMs6mUrZr` с корректным `inReplyToId`. В остальных открытых сводках из `pr_discussions_raw.json` отсутствуют `threadId` и `rootCommentId`, поэтому их нельзя адресовать как ответы в review-тредах.
- В `input/BNP-154` отсутствуют `pr_files.txt`, `ci_failures.md`, `ci_failures_full.log`, `ticket.md`, `merge_conflicts.md` и корневой `instruction.md`. Инструкции проекта прочитаны из `CLAUDE.md`; данных о сбоях CI и конфликтах среди подготовленных материалов нет.

## Approach

- Проверил маршрутизацию Socket.io в `MenuGateway`: событие гостю отправляется в `order_<id>`, а персоналу — в tenant-комнату кухни или зала. Доступ к tenant-комнатам требует действительный access token персонала.
- Интеграционный сценарий проходит создание заказа, подключение двух гостей с разных столов, агрегацию KDS и доставку `COOKING`; проверка подтверждает, что чужой гость событие не получает.
- Исправление и регрессионный тест уже присутствуют в текущей ветке. В этой итерации исходный код не менялся; актуализированы отчёт и ответ для открытого inline-треда.

## Files Modified

- `outputs/response.md` — актуальный отчёт о проверках и состоянии исправления.
- `outputs/review_replies/thread_1.md` — ответ на единственный открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD`, `git status --short` и `git diff --check` — выполнены; рабочее дерево чистое, ошибок форматирования diff нет.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace. Первый запуск обнаружил устаревший сгенерированный Prisma Client; после `npm exec --workspace @bonapp/api prisma generate -- --schema prisma/schema.prisma` повторная проверка прошла.
- `npm test` — успешно: API — 60 наборов / 538 тестов, admin-web — 29 файлов / 80 тестов, guest-web — 1 файл / 5 тестов; сборка workspace и `test:design-tokens` также прошли.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно (1 набор / 1 тест). Проверены получение события гостем-владельцем и кухней, а также отсутствие события у гостя другого стола.
- Проверка влияния Socket.io выполнена поиском `rg` по исходникам и тестам: гостевой доступ к комнате заказа проверяет table session, активность заказа и `tableId`; tenant-комнаты кухни и зала доступны только авторизованному персоналу. Проверка миграций показывает только новую `20260926220000_admin_order_guests`; существующие миграции не менялись, новая миграция идёт после базовых миграций на `main`.
