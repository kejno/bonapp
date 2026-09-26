# Исправления PR BNP-154

## Issues/Notes

- Ветка уже содержит исправление открытого блокирующего замечания: QR-гости не присоединяются к общей комнате tenant. Подключение к комнате заказа проходит только после проверки действующей table session и принадлежности активного заказа этому столу.
- Открытый тред проверен сквозным тестом: статус получает гость своего заказа и подключённая кухня, а гость другого стола не получает событие.
- `outputs/review_replies.json` содержит ссылку-ответ для открытого треда `PRRT_kwDOUUbUMs6mUrZr` с правильным `inReplyToId`.
- В `input/BNP-154` отсутствуют `pr_files.txt`, `ci_failures.md`, `ci_failures_full.log`, `ticket.md` и корневой `instruction.md`. Для инструкций проекта прочитан `CLAUDE.md`; CI-сбоев и файлов с конфликтами среди подготовленных материалов нет.

## Approach

- Проверил маршрутизацию Socket.io в `MenuGateway`: событие гостю отправляется в `order_<id>`, а персоналу — в tenant-комнату кухни или зала. Tenant-комнату может открыть только персонал с действительным access token.
- Проверил уже добавленный интеграционный сценарий создания заказа, подключения двух гостей к заказам разных столов, агрегации KDS и доставки `COOKING`.
- Исходный код в этой итерации не менялся: исправление и регрессионный тест уже присутствуют в текущей ветке. Обновлены только отчёт и ответ для открытого review-треда.

## Files Modified

- `outputs/response.md` — актуальный отчёт о проверках и состоянии исправления.
- `outputs/review_replies/thread_1.md` — ответ на единственный открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; рабочее дерево до обновления отчёта было чистым.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace. Первый запуск обнаружил устаревший сгенерированный Prisma Client; после `npm exec --workspace @bonapp/api prisma generate -- --schema prisma/schema.prisma` полный повтор проверки прошёл.
- `npm test` — успешно: API — 60 наборов / 538 тестов, admin-web — 29 файлов / 80 тестов, guest-web — 1 файл / 5 тестов; сборка workspace и `test:design-tokens` также прошли.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно (1 набор / 1 тест). Проверены получение события гостем-владельцем и кухней, а также отсутствие события у гостя другого стола.
- Проверка влияния Socket.io выполнена поиском `rg` по исходникам и тестам: гостевой доступ к комнате заказа проверяет table session и `tableId`; широковещательные tenant-комнаты доступны только авторизованному персоналу.
