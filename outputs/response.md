# Доработка PR #211 — BNP-158

## Issues/Notes

- Устранён риск повторной отправки POS-заказа после таймаута или потери ответа. Для каждого заказа хранится время первой попытки отправки; уже отмеченный заказ не отправляется повторно BullMQ и не попадает в восстановление очереди.
- При сбое после фиксации попытки, но до получения идентификатора POS заказ остаётся на ручную сверку. Без подтверждённой идемпотентности или API поиска со стороны POS автоматический повтор не может быть безопасным.
- В исходных материалах отсутствуют `ci_failures.md`, `ci_failures_full.log` и `pr_files.txt`. В `pr_discussions_raw.json` адресуемые inline-треды отмечены resolved; сводки без `threadId`/`rootCommentId` не позволяют ответить в тред. `outputs/review_replies.json` оставлен с пустым списком.

## Approach

- Перед внешним POS-запросом worker атомарно устанавливает `posOrderSubmittedAt`, только если заказ ещё не оплачен, активен и ранее не отправлялся. При параллельных заданиях право на отправку получает только один worker.
- Восстановление очереди выбирает только заказы без `posOrderSubmittedAt`; добавлен интеграционный тест на конкурентный захват через PostgreSQL.
- CodeGraph недоступен; потребителей проверил поиском `rg` по `posOrderId`, POS-полям и затронутым методам в `apps/api/src` и `apps/api/test`.
- Проверка миграций: добавлена только новая `20260929170002_pos_order_submission_claim`; миграции базы не редактировались, timestamp позже последней миграции `origin/main` (`20260929170000_payment_method`).

## Files Modified

- `apps/api/prisma/schema.prisma` — поле времени первой отправки POS-заказа.
- `apps/api/prisma/migrations/20260929170002_pos_order_submission_claim/migration.sql` — новая миграция.
- `apps/api/src/onboarding/pos-order-queue.service.ts` — атомарный захват перед отправкой.
- `apps/api/src/onboarding/pos-order-recovery.ts` — исключение уже отправлявшихся заказов из восстановления.
- `apps/api/test/pos-order-submission.e2e-spec.ts` — интеграционная проверка конкурентного захвата.
- `outputs/response.md` и `outputs/review_replies.json` — отчёт и список ответов на открытые треды.

## Test Coverage

- `npx eslint apps/api/src/onboarding/pos-order-queue.service.ts apps/api/src/onboarding/pos-order-recovery.ts apps/api/test/pos-order-submission.e2e-spec.ts` — пройдено.
- `npm run typecheck` — пройдено для всех четырёх workspace.
- `npm test` — пройдено: API 80 наборов / 616 тестов, guest-web 10 / 33, admin-web 63 / 124; сборки workspace и проверка design tokens также прошли.
- `npm run test:e2e --workspace=apps/api -- --runInBand test/pos-order-submission.e2e-spec.ts` — не прошёл запуск: `DATABASE_URL` не задан в окружении; интеграционная проверка требует PostgreSQL.
- `git diff --check` — пройдено.
