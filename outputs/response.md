# Доработка PR #211 — BNP-158

## Issues/Notes

- Исправлена обработка повторной доставки подтверждённого webhook: очередь выполняет повторные попытки с экспоненциальной задержкой, а обработка платежа остаётся идемпотентной.
- Срок ожидания Checkout берётся из ответа API и рассчитывается от времени создания платежа; после истечения гость может повторить оплату.
- Экран оплаты показывает фактическую сумму заказа без неподдерживаемых чаевых.
- Блокирующий риск повторной отправки заказа в POS при неопределённом результате запроса остаётся нерешённым. Доступные адаптеры не подтверждают идемпотентность и не предоставляют поиск заказа по внешнему ID; локальная отметка до вызова POS могла бы потерять заказ. Для устранения необходим подтверждённый контракт r_keeper/iiko.
- В `pr_discussions_raw.json` четыре inline-треда уже разрешены. Последние открытые замечания не содержат `threadId` и `rootCommentId`, поэтому адресные ответы для них сформировать нельзя. Файлы CI-ошибок, `pr_files.txt`, `ticket.md` и корневой `instruction.md` отсутствуют; требования сверены с `request.md`, инструкции проекта — с `CLAUDE.md` и `.dmtools/agents/instructions/pr_rework/`.

## Approach

- Добавлены тесты повторов webhook, серверного срока Checkout и поведения экрана оплаты.
- Повторная обработка webhook не должна дублировать переход статуса платежа.
- POS-блокер не менялся: без гарантии провайдера нельзя безопасно выбрать между повторной отправкой и риском потери заказа.

## Files Modified

- `apps/api/src/guest-session/bepaid-webhook.ts` и `.spec.ts` — политика повторных попыток очереди.
- `apps/api/src/guest-session/guest-session.service.ts` и `.spec.ts` — серверный срок Checkout.
- `apps/guest-web/src/PayPage.tsx` и `.test.tsx` — показ суммы и истечения оплаты.
- `apps/api/src/guest-session/guest-orders.controller.ts`, `guest-session.module.ts`, `bepaid.client.ts`, `apps/api/src/tenant/payment-credentials.ts` и их тесты — поддержка интеграции оплаты.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260929170000_payment_method/migration.sql`, `apps/api/.env.example` — схема, миграция и настройки оплаты.
- `apps/admin-web/src/pages/OnboardingStep3Page.tsx` — настройка реквизитов оплаты.
- `outputs/response.md`, `outputs/review_replies.json` — этот отчёт; список ответов пуст, так как все адресные треды разрешены.

## Test Coverage

Проверки будут указаны после выполнения обязательной последовательности команд.
