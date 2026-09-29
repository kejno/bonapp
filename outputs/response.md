# Доработка PR #211 — BNP-158

## Issues/Notes

- **Блокирующий риск повторной отправки в POS не устранён.** После неопределённого результата `POST` (таймаут или потеря ответа) повтор BullMQ может создать дубль. Текущий код обоих адаптеров передаёт внешний ID заказа, но используемые POS endpoint произвольны; доступный контракт не подтверждает дедупликацию по этим полям и не предоставляет общего поиска заказа. Локальная отметка до запроса предотвратила бы повтор, но оставила бы заказ неотправленным после сбоя до фактической отправки. Для безопасного исправления нужен подтверждённый контракт идемпотентности или сверки для обоих шлюзов.
- iiko-интеграция больше не входит в diff BNP-158 относительно `origin/main`: она уже находится в базовой ветке.
- В `pr_discussions_raw.json` идентификаторы имеют только inline-потоки 1–4, и все они помечены resolved. Последняя сводка и inline-замечание об iiko не содержат `threadId`/`rootCommentId`, поэтому адресные ответы сформировать нельзя. `outputs/review_replies.json` оставлен пустым.
- `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt`, `ticket.md` и `instruction.md` в подготовленных материалах отсутствуют. Требования сверены по `request.md`; инструкции репозитория прочитаны из `CLAUDE.md`.

## Approach

- Сохранено восстановление POS-очереди только для неоплаченных заказов в активных статусах `NEW`, `COOKING`, `READY`, `SERVED`; worker повторно проверяет пригодность заказа перед обращением к POS.
- Сохранены исправления гонки отмены платежа, доставки WS-события во все активные сессии стола, интеграционного покрытия двух исходов webhook и уникального timestamp миграции.
- POS-дедупликация остаётся блокирующей: ни один тест не может доказать её для удалённой системы без контракта шлюза. Вносить неподтверждённую гарантию в запрос или заменять повтор потерей заказа небезопасно.

## Files Modified

- `apps/api/.env.example` — переменные шлюзов оплаты.
- `apps/api/prisma/migrations/20260929120001_payment_completed_status/migration.sql` и `apps/api/prisma/schema.prisma` — статус завершённого платежа и ограничение активного платежа.
- `apps/api/src/app.module.ts`, `apps/api/src/main.ts` — регистрация модуля оплаты и сохранение raw body webhook.
- `apps/api/src/menu/menu.gateway.ts`, `apps/api/src/menu/menu.gateway.spec.ts` — WS-уведомления персоналу и активным сессиям стола.
- `apps/api/src/onboarding/pos-order-queue.service.ts`, `apps/api/src/onboarding/pos-order-recovery.ts`, `apps/api/src/onboarding/pos-order-recovery.spec.ts` — отбор активных неоплаченных заказов для восстановления.
- `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts` — учёт `COMPLETED` при чтении платежей.
- `apps/api/src/payments/` — шлюз, очередь, API и обработка webhook с проверкой гонок.
- `apps/api/test/payments.e2e-spec.ts` — интеграционные сценарии подтверждённого и неуспешного webhook.
- `apps/guest-web/src/App.tsx` — подключение гостевой сессии к WS-комнате.
- `outputs/response.md`, `outputs/review_replies.json` — результаты доработки и состояние адресных ответов.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- ESLint для всех изменённых TypeScript-файлов PR — пройден после генерации Prisma Client.
- `npm run typecheck` — пройден во всех четырёх workspace.
- `npm test` — пройден: API 77 наборов / 603 теста, guest-web 10 / 32, admin-web 63 / 124; сборка и проверка design tokens также завершились успешно.
- `npm run test:e2e --workspace=apps/api -- --runInBand test/payments.e2e-spec.ts` — запуск заблокирован отсутствующей `DATABASE_URL`; оба сценария не смогли подключиться к PostgreSQL.
- Миграционная проверка `git diff --name-status origin/main...HEAD -- '*/migrations/*'` показывает только добавление `20260929120001_payment_completed_status/migration.sql`; существующие миграции не менялись. Поиск вызовов `emitPaymentStatusChanged` и обращений к статусам платежа выполнен через `rg` в `apps/api/src` и `apps/api/test`.
- `git diff --check` — пройден.
