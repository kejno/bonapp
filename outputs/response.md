# Повторная проверка PR BNP-154

## Issues/Notes

- Открытый inline-тред касался утечки статусов заказов между QR-гостями. Ветка уже содержит изоляцию: QR-сокет не подключается к общей комнате tenant, а к `order_<id>` присоединяется только после проверки QR-токена или сессии и принадлежности активного заказа столу.
- E2E-сценарий через реальные Socket.io-клиенты проверяет отказ гостю другого стола, получение статуса владельцем заказа и KDS, а также отсутствие события у постороннего гостя.
- В этой попытке производственный код и тесты не менялись: исправление и регрессионный тест уже присутствовали в checkout. Обновлены только файлы отчёта и ответа на открытое обсуждение.
- В подготовленном `input/BNP-154/` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt` и `merge_conflicts.md`; `rework_setup_failed.md` не найден.

## Approach

- Проверил `joinOrderRoom`, `joinTenantRoom` и `emitOrderStatusChanged`: гость входит только в комнату своего заказа после проверки доступа; комнаты кухни и зала требуют действительный staff access token; событие направляется комнате заказа и соответствующей комнате персонала.
- Проверил все подключения и публикации комнат поиском по исходникам и выполнил E2E через HTTP API и Socket.io-клиенты. CodeGraph недоступен; проверка влияния выполнена поиском по исходникам и E2E.
- Проверил миграции относительно `origin/main`: добавлена только новая миграция `20260926220000_admin_order_guests`, существующие миграции не изменены.

## Files Modified

- `outputs/response.md` — результаты повторной проверки.
- `outputs/review_replies/thread_1.md` — ответ на открытый inline-тред.
- `outputs/review_replies.json` — привязка ответа к `threadId` и корневому комментарию.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — успешно; проверены файлы PR и состояние рабочей копии.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace после генерации клиента командой `npx prisma generate --schema apps/api/prisma/schema.prisma`. Первый запуск до генерации выявил устаревший локальный Prisma Client (`TransactionClient.guest`); повторный запуск прошёл.
- `npm test` — успешно: API — 61 suite / 542 теста; admin-web — 29 файлов / 80 тестов; guest-web — 3 файла / 11 тестов; также прошли сборка и проверка design tokens.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 suite / 1 тест; проверены получение события владельцем заказа и кухней и отсутствие события у гостя другого стола.
- `git diff --check` — успешно.
- `git diff --name-status origin/main...HEAD -- '*/migrations/*'` — успешно; обнаружена только новая миграция.
