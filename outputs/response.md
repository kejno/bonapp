# Доработка PR #211 — BNP-158

## Issues/Notes

- Исправлена классификация ответов POS: HTTP 4xx при вызове создания заказа не доказывает, что заказ не был принят. Такие ошибки больше не снимают `posOrderSubmittedAt`, поэтому BullMQ не повторяет неоднозначный `POST`.
- Подтверждённая ошибка получения токена iiko до вызова создания заказа по-прежнему допускает безопасный повтор.
- В подготовленном контексте нет `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt`, `ticket.md` и корневого `instruction.md`. Требования сверены с `request.md`, инструкции проекта — с `CLAUDE.md` и `.dmtools/agents/instructions/pr_rework/`. CI-отчёты не предоставлены.

## Approach

- HTTP-ответы вне 2xx теперь приводят к обычной ошибке; специальный `PosOrderRejectedError` оставлен только для сбоя iiko-аутентификации до обращения к endpoint создания заказа.
- На границе iiko-адаптера ошибки создания заказа преобразуются в неоднозначные, даже если requester классифицировал их как отказ.
- Добавлены регрессионные случаи HTTP 400, 408 и 409 через внешний seam requester. Каждый фиксированный статус проверяет, что вызов заказа не классифицируется как безопасно отклонённый.

## Files Modified

- `apps/api/src/onboarding/pos-network.ts` — неоднозначные ответы POS больше не освобождают защитную отметку.
- `apps/api/src/onboarding/pos-auth.spec.ts` — покрытие 400, 408 и 409 при вызове iiko endpoint создания заказа.
- `outputs/response.md` и `outputs/review_replies.json` — сводка доработки и ссылка на ответ в треде.
- `outputs/review_replies/BNP-158-thread-8.md` — ответ на открытое замечание классификации 4xx.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены для проверки файлов PR и состояния дерева.
- RED: `npx jest --runInBand src/onboarding/pos-auth.spec.ts` до исправления — три новых проверки HTTP 400, 408 и 409 упали, поскольку ошибка оставалась `PosOrderRejectedError`.
- GREEN: `npx jest --runInBand src/onboarding/pos-auth.spec.ts` — пройдено: 5 тестов.
- `npx eslint apps/api/src/onboarding/pos-network.ts apps/api/src/onboarding/pos-auth.spec.ts` — пройдено.
- `npm run typecheck` — пройдено.
- `npm test` — пройдено: API 80 наборов / 619 тестов, guest-web 10 / 33, admin-web 63 / 124; сборки workspace и проверка design tokens прошли.
- `git diff --check` — пройдено.
- CodeGraph недоступен; потребители `PosOrderRejectedError`, `requestIikoOrder` и обработчика отправки проверены поиском `rg` по `apps/api/src` и `apps/api/test`. Схема, миграции, общие сигнатуры и глобальные провайдеры не затрагивались.
