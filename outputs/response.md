# Доработка PR #211 — BNP-158

## Issues/Notes

- Для восстановления POS-очереди отфильтрованы только неоплаченные активные заказы; перед отправкой worker повторно проверяет статус и `isPaid`.
- Повторный запрос передаёт стабильный ID заказа как `externalId` для r_keeper и `externalNumber` для iiko. В доступном контракте интеграции нет подтверждения, что обе POS-системы дедуплицируют `POST` по этим полям; поэтому защита от дубля после принятого POS запроса и потерянного ответа требует подтверждённой поддержки со стороны шлюза.
- Миграция статуса платежа переименована в `20260929120001_payment_completed_status`, чтобы её timestamp был уникальным рядом с другой миграцией в checkout.
- Открытые сводные замечания о POS в `pr_discussions_raw.json` не содержат `threadId` и `rootCommentId`, поэтому адресные ответы для них сформировать нельзя. Ранее открытые inline-потоки отмечены resolved.
- В подготовленном контексте отсутствуют `ci_failures.md` и `ci_failures_full.log`.
- Интеграционный тест платежного webhook требует `DATABASE_URL`; локально он не запускается без тестовой PostgreSQL.

## Approach

- Добавлена проверка допустимых состояний заказа. Восстановление выбирает `NEW`, `COOKING`, `READY` и `SERVED` с `isPaid=false`; worker повторно проверяет статус перед обращением к POS.
- Существующие payload POS уже включают стабильный идентификатор заказа; сохраняется его передача обоим адаптерам.
- Изменения платежного webhook, гонки статуса и WS-доставки, внесённые предыдущим проходом, сохранены.

## Files Modified

- `apps/api/src/onboarding/pos-order-recovery.ts` — отбор активных неоплаченных заказов.
- `apps/api/src/onboarding/pos-order-recovery.spec.ts` — проверки разрешённых и запрещённых состояний.
- `apps/api/src/onboarding/pos-order-queue.service.ts` — повторная проверка заказа перед POS-вызовом.
- `apps/api/prisma/migrations/20260929120001_payment_completed_status/migration.sql` — уникальный timestamp миграции.
- `outputs/response.md`
- `outputs/review_replies.json`
- `outputs/review_replies/thread_1.md`
- `outputs/review_replies/thread_2.md`
- `outputs/review_replies/thread_3.md`

## Test Coverage

- RED: `npm test --workspace=apps/api -- --runInBand src/onboarding/pos-order-recovery.spec.ts` — новый сценарий сначала упал, затем прошёл после исправления.
- `npx eslint apps/api/src/onboarding/pos-order-queue.service.ts apps/api/src/onboarding/pos-order-recovery.ts apps/api/src/onboarding/pos-order-recovery.spec.ts` — пройден.
- `npm run typecheck` — пройден для четырёх workspace.
- `npm test` — пройден: 76 API suites / 601 tests, 63 admin-web suites / 124 tests, 10 guest-web suites / 32 tests; сборка и проверка design tokens также прошли.
- `npm run test:e2e --workspace=apps/api -- --runInBand test/payments.e2e-spec.ts` — не запускался; `DATABASE_URL` для тестовой PostgreSQL не предоставлен.
- Blast-radius: миграции, глобальные провайдеры и публичные сигнатуры в этой доработке не менялись.
