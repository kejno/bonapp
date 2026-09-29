# Доработка PR #211 — BNP-158

## Issues/Notes

- Блокирующее замечание по повторной отправке заказа в POS остаётся открытым. Если POS принял `POST`, но ответ потерялся до сохранения `posOrderId`, BullMQ повторит запрос и может создать дубликат. Текущий контракт адаптеров не подтверждает дедупликацию по `externalId`/`externalNumber` и не предоставляет поиск заказа по этим значениям. Локальная отметка до запроса может потерять заказ при сбое до отправки; без контракта идемпотентности или сверки безопасно закрыть этот интервал нельзя.
- Восстановление очереди уже ограничено неоплаченными заказами в статусах `NEW`, `COOKING`, `READY`, `SERVED`; worker повторно проверяет статус и `isPaid` перед вызовом POS.
- В `pr_discussions_raw.json` все inline-треды с `threadId` помечены resolved. Более поздние сводки не содержат `threadId` и `rootCommentId`, поэтому адресуемых открытых тредов для ответа нет; `outputs/review_replies.json` содержит пустой список.
- В подготовленном контексте отсутствуют `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt`, `ticket.md` и `instruction.md`. Требования сверены с `request.md`, инструкции проекта — с `CLAUDE.md` и `.dmtools/agents/instructions/pr_rework/`.

## Approach

- Повторно проверил обработку заказа в `PosOrderQueueService` и фильтр восстановления. Не добавлял неподтверждённую гарантию дедупликации или локальный маркер, который превратил бы неопределённый исход в риск потери заказа.
- Проверил миграцию статуса `COMPLETED`: это новая миграция `20260929170001_payment_completed_status`, её timestamp следует за последней миграцией `origin/main` (`20260929170000_payment_method`); существующие миграции не изменены.
- CodeGraph недоступен; blast-radius проверка выполнена поиском по платежам и POS-полям в `apps/api/src` и `apps/api/test`.

## Files Modified

- `outputs/response.md` — результат повторной проверки, ограничения POS-контракта и фактические проверки.
- `outputs/review_replies.json` — пустой список, так как открытых адресуемых inline-тредов нет.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены для проверки файлов PR и состояния рабочего дерева.
- ESLint для исходных файлов не запускался: в этом проходе файлы исходного кода не изменялись.
- `npm run typecheck` — пройден во всех четырёх workspace.
- `npm test` — пройден: guest-web 10 наборов / 33 теста, API 80 / 616 тестов, admin-web 63 набора / 124 теста; сборка workspace и проверка design tokens также завершились успешно.
- `npm run test:e2e --workspace=apps/api -- --runInBand test/payments.e2e-spec.ts` не запускался: `DATABASE_URL` не задан. Поэтому два интеграционных сценария webhook с PostgreSQL не проверены этим проходом.
- Миграционный blast-radius check: `git diff --name-status origin/main...HEAD -- '*/migrations/*'` показывает добавление только новой миграции; timestamp сверён с последней миграцией базы. Вызовы и запросы по `PaymentStatus.PENDING`, `posOrderId` и платежам проверены поиском через `rg` в `apps/api/src` и `apps/api/test`.
- `git diff --check` — пройдено.
