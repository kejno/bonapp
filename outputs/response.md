# Повторная проверка PR BNP-154

## Issues/Notes

- Открытый inline-тред требовал исключить утечку статусов заказов между QR-гостями. Исправление уже находится в ветке: QR-подключение не добавляется в общую комнату tenant, а гость получает доступ к комнате заказа только после проверки QR-токена/сессии и принадлежности активного заказа его столу.
- E2E-тест проверяет отказ гостю другого стола при попытке подключиться к комнате, получение события владельцем заказа и KDS, а также отсутствие события у гостя другого стола.
- В текущем повторном проходе производственный код не менялся: необходимая изоляция и регрессионный сценарий уже присутствовали в проверяемой ветке.
- В `input/BNP-154/` не приложены `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt`, `merge_conflicts.md` и отдельные файлы инструкций/спецификаций. Записей об ошибке подготовки `rework_setup_failed.md` нет.

## Approach

- Проверил `joinOrderRoom`, `joinTenantRoom` и `emitOrderStatusChanged`: гостевые сокеты входят только в `order_<id>` после проверки; комнаты кухни/зала доступны через действительный staff access token; событие статуса отправляется гостю заказа и соответствующей комнате сотрудников.
- Проверил влияние поиском по исходникам и E2E: подключение к комнате заказа обрабатывается через `join_order_room`; сценарий изоляции выполнен через реальные Socket.io-клиенты.
- Проверил миграции относительно `origin/main`: добавлена только новая миграция `20260926220000_admin_order_guests`; ранее существовавшие миграции не изменены.

## Files Modified

- `outputs/response.md` — результаты повторной проверки и команд.
- `outputs/review_replies/thread_1.md` — ответ на открытый inline-тред.
- `outputs/review_replies.json` — привязка ответа к `threadId` и корневому комментарию.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — проверены список файлов PR и состояние рабочей копии.
- `npx prisma generate --schema apps/api/prisma/schema.prisma` — успешно; сгенерирован Prisma Client для модели `Guest`.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts apps/api/test/admin-orders.e2e-spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace после генерации Prisma Client. Первый запуск до генерации обнаружил устаревший клиент (`TransactionClient.guest`); после генерации повторный typecheck прошёл.
- `npm test` — успешно: API — 61 suite / 542 теста; admin-web — 29 файлов / 80 тестов; guest-web — 3 файла / 11 тестов; также прошли сборка и проверка design tokens.
- `npm run test:e2e --workspace @bonapp/api -- --runInBand --forceExit test/admin-orders.e2e-spec.ts` — успешно: 1 suite / 1 тест, включая получение события гостем заказа и кухней и отсутствие события у гостя другого стола.
- `git diff --check` — успешно.
- `git diff --name-status origin/main...HEAD -- '*/migrations/*'` — успешно; найдено только добавление новой миграции.
