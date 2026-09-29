# Доработка PR #211 — BNP-158

## Issues/Notes

- Устранён блокирующий сценарий, когда подтверждённый отказ POS навсегда оставлял заказ без отправки.
- Повторная отправка после сетевой ошибки, таймаута, HTTP 5xx или некорректного ответа по-прежнему запрещена: в этих случаях неизвестно, принял ли POS заказ.
- В подготовленных материалах нет `instruction.md`, `pr_files.txt`, `ci_failures.md`, `ci_failures_full.log` и `ticket.md`. Инструкции проекта прочитаны из `CLAUDE.md` и `.dmtools/agents/instructions/pr_rework/`; требования сверены с `request.md`. Данных о сбоях CI не предоставлено.
- CodeGraph недоступен; места вызова и обращения к POS-маркеру проверены поиском `rg` в `apps/api/src` и `apps/api/test`.

## Approach

- Для однозначного HTTP-отказа 4xx POS и неудачного получения токена iiko до вызова API создания заказа используется `PosOrderRejectedError`.
- Worker снимает `posOrderSubmittedAt` только для этой ошибки. BullMQ может выполнить повтор, а атомарный захват предотвращает параллельную отправку.
- Для неоднозначных исходов отметка сохраняется, чтобы не создать дубль в POS.
- Регрессионный интеграционный сценарий моделирует первый отказ HTTP 422 и успешную вторую отправку через тот же helper, который вызывает worker. Проверка требует PostgreSQL; запуск заблокирован отсутствующей `DATABASE_URL`.

## Files Modified

- `apps/api/src/onboarding/pos-network.ts` — тип однозначного отказа POS и классификация HTTP 4xx; ошибка получения токена iiko до отправки заказа.
- `apps/api/src/onboarding/pos-order-queue.service.ts` — освобождение отметки только после однозначного отказа.
- `apps/api/src/onboarding/pos-order-recovery.ts` — условный сброс отметки и обработчик отправки с повторным выбросом ошибки.
- `apps/api/test/pos-order-submission.e2e-spec.ts` — интеграционный сценарий отказа и повторной отправки.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/BNP-158-thread-7.md` — отчёт и адресный ответ на открытый review-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- `npx eslint apps/api/src/onboarding/pos-network.ts apps/api/src/onboarding/pos-order-queue.service.ts apps/api/src/onboarding/pos-order-recovery.ts apps/api/test/pos-order-submission.e2e-spec.ts` — пройдено.
- `npm run typecheck` — пройдено во всех четырёх workspace.
- `npm test` — пройдено: API 80 наборов / 616 тестов, guest-web 10 / 33, admin-web 63 / 124; сборки и проверка design tokens также прошли.
- `npm run test:e2e --workspace=apps/api -- --runInBand test/pos-order-submission.e2e-spec.ts` — запущено, но тесты и очистка БД не смогли стартовать: `DATABASE_URL` не задан. Поэтому новый интеграционный сценарий требует повторного запуска в окружении с PostgreSQL.
- `git diff --check` — пройдено.
