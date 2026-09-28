# Доработка PR #192 — BNP-481

## Issues/Notes

- Сброс `dailyOrderNumber` выполняется в транзакции закрытия смены.
- Блокирующее замечание о реальных вызовах СКНО остаётся открытым: в кодовой базе есть только заглушки и хранение учётных данных, но нет описания API/SDK СКНО «Титан-Плюс». Реализация сетевого протокола без контракта и формата Z-отчёта была бы выдуманной.
- Точечный e2e BNP-413 падает до новой проверки заказа: ответ на открытие смены содержит `cashierId`, отличный от ID переданного кассира. Нужна отдельная диагностика этого поведения.
- Конфликтующие `outputs/rca.md` и `outputs/response.md` разрешены; сведения о BNP-412 из `origin/main` сохранены в соответствующем RCA/изменениях рабочей копии.
- Входные `ci_failures.md`, `ci_failures_full.log` и `pr_files.txt` отсутствуют.

## Approach

- Добавлена проверка, которая после закрытия смены создаёт заказ через публичный endpoint `/api/v1/guest/orders` и ожидает номер `1`.
- Проверена доступная реализация СКНО по `apps/api` и `apps/admin-web`: найденные настройки не сопровождаются интеграционным клиентом или контрактом внешнего API.
- Для комментария о прямом чтении БД сохранена подготовка состояния через Prisma, а итоговая нумерация проверяется через HTTP-ответ гостевого API.

## Files Modified

- `apps/api/test/BNP-413.e2e-spec.ts` — проверка следующего номера заказа через публичный API после закрытия смены.
- `outputs/rca.md` — разрешён конфликт и описаны первопричины BNP-481.
- `outputs/response.md` — этот отчёт.
- `outputs/review_replies.json` и `outputs/review_replies/thread_1.md` — ответ на открытый inline-тред.
- Также сохранены изменения по конфликту ветки: `apps/api/src/guest-session/guest-session.module.ts`, `apps/api/src/menu/menu.module.ts`, `apps/api/src/staff/shift.service.ts`, `apps/api/test/BNP-412.e2e-spec.ts`, `apps/api/test/BNP-414.e2e-spec.ts`, `apps/api/test/staff-test.fixture.ts`.

## Test Coverage

- `npx jest --config apps/api/test/jest-e2e.json --runInBand apps/api/test/BNP-413.e2e-spec.ts` — НЕ ПРОЙДЕН: проверка обнаружила несовпадение `cashierId` в ответе на открытие смены; новый сценарий публичного заказа не был достигнут.
- `git diff --check` — ПРОЙДЕН.
- `npx eslint apps/api/src/guest-session/guest-session.module.ts apps/api/src/menu/menu.module.ts apps/api/src/staff/shift.service.ts apps/api/test/BNP-412.e2e-spec.ts apps/api/test/BNP-413.e2e-spec.ts apps/api/test/BNP-414.e2e-spec.ts apps/api/test/staff-test.fixture.ts` — ПРОЙДЕН.
- `npm run typecheck` — ПРОЙДЕН для всех четырёх workspace.
- `npm test` — ПРОЙДЕН: guest-web 32 теста, API 581 тест, admin-web 124 теста; сборки и проверка design tokens также завершились успешно.
- Граф вызовов не менялся. Изменение счётчика затрагивает путь создания заказов: `apps/api/src/orders/orders.service.ts` и `apps/api/src/guest-session/guest-session.service.ts` используют `dailyOrderNumber`; тест проверяет гостевой путь через публичный API.
