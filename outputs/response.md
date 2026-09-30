# Результат доработки PR #210 — BNP-157

## Issues/Notes

- **Блокер по спецификации Оплати™ остаётся.** Во входных материалах нет официального контракта API/webhook и sandbox-реквизитов. Фактическую совместимость форматов запросов, ответов и подписи подтвердить нельзя; для готовности интеграции нужны официальные данные провайдера.
- В `input/BNP-157/pr_discussions_raw.json` замечание об утрате `posOrderId` указано без `threadId` и `rootCommentId`, поэтому адресный ответ на него сформировать невозможно. Идентификаторы не выдумывались.
- `ci_failures.md` и `ci_failures_full.log` отсутствуют во входных данных; отдельный статус CI неизвестен.

## Approach

- Разделил проверку очереди и обработчика в BNP-519: тест проверяет публикацию задания с именем и данными, а обработка заказа вызывается через отдельный сервисный контракт `processOrder(tenantId, orderId)`.
- В тесте обработки восстановил проверку наблюдаемого результата: после успешного ответа r_keeper `posOrderId` сохраняется для заказа.
- Worker вызывает тот же `processOrder`, который проверяется тестом. Поиск `rg` подтвердил, что других потребителей нового метода нет.
- По ответу на вопрос BNP-215 оплата не должна закрывать сессию или менять стол; такое поведение оставлено вне изменений этого раунда.

## Files Modified

- `apps/api/src/onboarding/pos-order-queue.service.ts` — worker передаёт задание сервисному контракту обработки заказа.
- `apps/api/src/onboarding/BNP-519.spec.ts` — раздельные проверки постановки задания и обработки; проверяется сохранённый `posOrderId`.
- `outputs/review_replies.json` и `outputs/review_replies/BNP-157-thread-14.md` — ответ на адресный открытый тред.

## Test Coverage

- RED: `npm test --workspace=apps/api -- --runInBand src/onboarding/BNP-519.spec.ts` — новая проверка упала, так как `processOrder` ещё не существовал.
- GREEN: `npm test --workspace=apps/api -- --runInBand src/onboarding/BNP-519.spec.ts` — пройдено после изменения.
- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- `npx eslint apps/api/src/onboarding/pos-order-queue.service.ts apps/api/src/onboarding/BNP-519.spec.ts` — пройдено.
- `npm run typecheck` — пройдено для всех четырёх workspace.
- `npm test` — пройдено: API 97 наборов / 640 тестов, guest-web 10 файлов / 33 теста, admin-web 64 файла / 126 тестов; build и `test:design-tokens` также завершились успешно. Jest сообщил о принудительном завершении worker-процесса, команда завершилась с кодом 0. Сборка admin-web вывела предупреждение о чанке более 500 КБ.
- `git diff --check` — пройдено.
- Blast-radius: поиском `rg` проверены все вызовы нового `processOrder`; найдены только зарегистрированный BullMQ worker и regression-тест. Изменений схемы, миграций и глобальных провайдеров в этом раунде нет.
