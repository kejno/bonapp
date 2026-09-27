# Повторная проверка PR BNP-154

## Issues/Notes

- Единственный открытый inline-тред касается раскрытия статусов заказов гостям других столов. В текущем HEAD `2aaebbbfb74c7ef00cc354f4f4ce54cf55def963` гостевой сокет входит в `order_<id>` только после проверки QR-токена или действующей сессии и подтверждения, что активный заказ принадлежит столу этой сессии. События кухни направляются только в авторизованную комнату кухни.
- Исправление и регрессионный E2E-тест уже присутствовали в рабочей копии; исходный код в этой итерации не менялся.
- Для локальной проверки сгенерирован Prisma Client по актуальной схеме. До генерации typecheck и ESLint сообщали об отсутствующей модели `Guest`; после генерации оба прошли.
- В `input/BNP-154/` нет `instruction.md`, `pr_files.txt`, CI-логов, отдельного `ticket.md`, файлов конфликтов или связанных спецификаций.

## Approach

- Сверил проверку доступа в `joinOrderRoom`, маршрутизацию статусов и E2E-сценарий с открытым замечанием.
- E2E использует QR-токены двух столов: проверяет отказ чужому гостю при попытке войти в комнату заказа, получение события владельцем заказа и кухней, а также отсутствие события у гостя другого стола.
- Проверил diff и миграции относительно `origin/main`; миграция PR новая, существующие миграции не менялись.

## Files Modified

- `outputs/response.md` — актуализирован отчёт проверки.
- `outputs/review_replies/thread_1.md` — ответ на единственный открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — проверены список файлов PR и рабочая копия.
- `npx prisma generate --schema apps/api/prisma/schema.prisma` — успешно.
- `npx eslint` для всех изменённых TypeScript-файлов PR — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API — 61 suite / 542 теста; admin-web — 29 файлов / 80 тестов; guest-web — 3 файла / 11 тестов; сборки workspace прошли.
- `npm run test:design-tokens` — успешно.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 suite / 1 тест, включая доставку Socket.io и изоляцию QR-клиентов между столами.
- `git diff --check` — успешно.
- `git diff --name-status origin/main...HEAD -- '*/migrations/*'` — успешно; обнаружена только новая миграция `apps/api/prisma/migrations/20260926220000_admin_order_guests/migration.sql`.
