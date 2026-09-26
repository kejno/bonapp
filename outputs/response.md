# Исправления PR BNP-154

## Issues/Notes

- Удалено автоматическое присоединение QR-клиентов к общей комнате tenant. Такая комната раскрывает гостевым клиентам события, предназначенные всему заведению.
- Открытый блокирующий тред учтён. Гость подключается к комнате заказа только после проверки действующей сессии стола и принадлежности заказа этому столу.
- В `input/BNP-154` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt`, `ticket.md` и корневой `instruction.md`; CI-сбоев в подготовленных материалах нет. Конфликтных маркеров в рабочем дереве не обнаружено.

## Approach

- Удалена регистрация QR-сокета в общей комнате `tenant:<tenantId>`. Подключение персонала по `accessToken` оставлено с проверкой JWT и членства в tenant.
- Использована существующая сквозная проверка: владелец заказа получает `order:status_changed`, гость другого стола не получает это событие, кухня получает событие в своей комнате.

## Files Modified

- `apps/api/src/menu/menu.gateway.ts` — исключено автоматическое присоединение QR-гостей к общей комнате.
- `outputs/response.md` — этот отчёт.
- `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — ответ на открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены. В рабочем дереве уже присутствуют отдельные staged-изменения waiter-call; они не относятся к этому исправлению и не включены в список изменённых файлов выше.
- `npx eslint apps/api/src/menu/menu.gateway.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace. Первый запуск выявил устаревший сгенерированный Prisma Client (`Guest` отсутствовал); после `npm exec --workspace @bonapp/api prisma generate -- --schema prisma/schema.prisma` повторный запуск прошёл.
- `npm test` — успешно: API — 60 suites / 538 тестов, admin-web — 29 файлов / 80 тестов, guest-web — 1 файл / 5 тестов. Сборка приложений и `test:design-tokens` также завершились успешно.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно (1 suite / 1 тест); проверены доставка статуса владельцу заказа и отсутствие события у гостя другого стола.
- `git diff --check` и `git diff --cached --check` — выполнены.
