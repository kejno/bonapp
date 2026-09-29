# Доработка PR #211 — BNP-158

## Issues/Notes

- Исправлен блокирующий разбор ответа bePaid: `status` и `expired` читаются из корня JSON, как указано в комментарии к API. Ранее открытые сводные замечания без `threadId` не являются адресными inline-тредами; POS-риск повторного создания заказа при неопределённом результате запроса остаётся вне этого изменения и требует отдельной гарантии идемпотентности со стороны POS либо поддерживаемого API сверки.
- В `.dmtools/input/BNP-158` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `pr_files.txt`, `ticket.md` и корневой `instruction.md`; CI-сбои из файлов не предоставлены. Требования сверены с `request.md`, инструкции проекта — с `CLAUDE.md`.
- В `pr_discussions_raw.json` имеется один открытый адресный тред с `threadId` и `rootCommentId`; на него подготовлен отдельный ответ. У сводных review-записей эти идентификаторы отсутствуют.

## Approach

- Добавлен тест `BepaidClient` с документированной формой ответа, где `status` и `expired` находятся на верхнем уровне. До исправления он завершался `BadGatewayException`.
- Клиент теперь валидирует верхнеуровневый `status` и возвращает верхнеуровневый `expired`; данные `checkout` не используются как источник этих полей.
- POS-отправка не менялась: переданный во внешний запрос ID не доказывает дедупликацию, а доступная информация не подтверждает контракт API поиска/идемпотентности.

## Files Modified

- `apps/api/src/guest-session/bepaid.client.ts` — разбор верхнеуровневых полей статуса bePaid.
- `apps/api/src/guest-session/bepaid.client.spec.ts` — регрессионный тест на документированное тело ответа.
- `outputs/response.md` — сводка исправления и проверок.
- `outputs/review_replies.json` и `outputs/review_replies/BNP-158-thread-6.md` — адресный ответ на открытый inline-тред.

## Test Coverage

- RED: `npm test --workspace=apps/api -- --runInBand --runTestsByPath src/guest-session/bepaid.client.spec.ts` — тест упал до изменения реализации с `BadGatewayException`.
- GREEN: та же команда после исправления — пройдена, 1 тест.
- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- `npx eslint apps/api/src/guest-session/bepaid.client.ts apps/api/src/guest-session/bepaid.client.spec.ts` — пройдено.
- `npm run typecheck` — пройдено для четырёх workspace.
- `npm test` — пройдено: API 79 наборов / 609 тестов, guest-web 10 / 33, admin-web 63 / 124; сборка и проверка design tokens пройдены.
- Радиус влияния ограничен клиентом bePaid и его потребителем `GuestSessionService`; схему, миграции, публичную сигнатуру и глобальные провайдеры изменение не затрагивает.
