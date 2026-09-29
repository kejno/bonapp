# Доработка PR #211 — BNP-158

## Issues/Notes

- **BLOCKING по повторной отправке POS остаётся открытым.** В PR для обоих POS передаются стабильные идентификаторы заказа (`externalId` и `externalNumber`), однако доступный контракт произвольного POS endpoint не подтверждает дедупликацию по этим полям. В коде также нет API для поиска заказа по внешнему ID. Нельзя утверждать, что повторная попытка безопасна без подтверждённого контракта r_keeper и iiko.
- Сводные записи в `pr_discussions_raw.json` без `threadId`/`rootCommentId` не позволяют отправить отдельные адресные ответы; единственный inline-поток с идентификаторами — открытый поток 4.
- CI-логи и `pr_files.txt` в подготовленных материалах отсутствуют.
- В локальном контексте отсутствует `instruction.md`; прочитан `CLAUDE.md` в корне репозитория.
- Конфликты артефактов `outputs/response.md` и `outputs/review_replies/thread_3.md` разрешены; `git diff --check` проходит.

## Approach

- Сохранено исправление восстановления POS-очереди: выбираются только неоплаченные заказы в активных статусах `NEW`, `COOKING`, `READY`, `SERVED`; worker повторно проверяет статус и `isPaid` перед вызовом POS.
- Ранее внесённые исправления обработки гонки webhook, доставки WS-событий и миграционного timestamp сохранены.
- Для открытого замечания подготовлен адресный ответ с требованием предоставить и подтвердить контракт идемпотентности/поиска для обеих POS-систем. До этого повторный `POST` после неопределённого результата может создать дубль, поэтому замечание не считается закрытым.

## Files Modified

- `apps/api/src/onboarding/pos-order-recovery.ts` — фильтрация восстановленных заказов по статусу и оплате.
- `apps/api/src/onboarding/pos-order-recovery.spec.ts` — регрессионные сценарии восстановления.
- `apps/api/src/onboarding/pos-order-queue.service.ts` — повторная проверка пригодности заказа перед отправкой.
- `apps/api/prisma/migrations/20260929120001_payment_completed_status/migration.sql` — миграция статуса платежа.
- `outputs/response.md`
- `outputs/review_replies.json`
- `outputs/review_replies/BNP-158-thread-4.md`

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- `npx eslint apps/api/src/onboarding/pos-order-queue.service.ts apps/api/src/onboarding/pos-order-recovery.ts apps/api/src/onboarding/pos-order-recovery.spec.ts` — пройден.
- `npm run typecheck` — пройден во всех четырёх workspace.
- `npm test` — пройден: API 77 наборов / 603 теста, guest-web 10 / 32, admin-web 63 / 124; сборка и проверка design tokens также прошли.
- `apps/api/test/payments.e2e-spec.ts` не запускался: переменная `DATABASE_URL` в окружении не настроена.
- Проверка радиуса миграции: `git diff --name-status origin/main...HEAD -- '*/migrations/*'` показывает только добавление `20260929120001_payment_completed_status/migration.sql`; timestamp позже последней миграции `20260929120000_add_iiko_app_credentials` на `origin/main`. Поиск обращений к `payment` и `PENDING` в `apps/api/src` и `apps/api/test` выполнен; глобальные провайдеры и публичные сигнатуры не менялись.
- `git diff --check` — пройден.
