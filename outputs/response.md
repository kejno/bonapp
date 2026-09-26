# Исправления PR BNP-154

## Issues/Notes

- Единственный открытый inline-тред касался утечки статусов заказов между QR-гостями. Исправление присутствует: гость подключается к комнате конкретного заказа только после проверки table session, активности заказа и принадлежности заказа столу сессии.
- Остальные inline-треды закрыты. Две открытые сводные рецензии в `pr_discussions_raw.json` не содержат `threadId` и `rootCommentId`, поэтому адресные ответы для них сформировать нельзя.
- Подготовленные материалы не содержат `ci_failures.md`, `ci_failures_full.log`, `merge_conflicts.md`, `ticket.md` и `pr_files.txt`. Инструкции проекта проверены по `CLAUDE.md` и `.dmtools/agents/instructions/pr_rework/`.

## Approach

- Проверил подключение гостей к `order_<id>` и персонала к комнатам кухни/зала. Событие заказа отправляется в конкретную комнату гостя; авторизованная кухня получает событие для KDS.
- Сквозной сценарий проверяет административное создание заказа, агрегацию позиций по цеху, смену статуса и доставку события владельцу заказа и кухне. Второй гость с другого стола события не получает.
- Код исправления и регрессионный тест уже присутствовали в ветке; в этой итерации новых изменений исходного кода не потребовалось.

## Files Modified

- `outputs/response.md` — отчёт о текущей проверке.
- `outputs/review_replies/thread_1.md` и `outputs/review_replies.json` — адресный ответ на открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD`, `git status --short` и `git diff --check` — выполнены; рабочее дерево чистое, ошибок diff нет.
- `npx eslint` по всем затронутым TypeScript-файлам API — успешно. Первая попытка до генерации Prisma Client выявила только типизацию устаревшего сгенерированного клиента; после `npm exec --workspace @bonapp/api prisma generate -- --schema prisma/schema.prisma` повторный lint прошёл. `schema.prisma` проигнорирован ESLint, так как для него нет конфигурации.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API — 60 наборов / 538 тестов, admin-web — 29 файлов / 80 тестов, guest-web — 1 файл / 5 тестов; сборка workspace и проверка design tokens также прошли.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 набор / 1 тест; подтверждены доставка события владельцу заказа и кухне и отсутствие события у гостя другого стола.
- Проверка blast radius для Socket.io проведена поиском `rg` по исходникам и тестам. Проверка миграций (`git diff --name-status origin/main...HEAD -- '*/migrations/*'`) показала только добавление новой `20260926220000_admin_order_guests/migration.sql`; существующие миграции не менялись.
