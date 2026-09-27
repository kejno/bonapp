# Повторная проверка PR #151 — BNP-143

## Issues/Notes

- Исправлено актуальное замечание из `input/BNP-143/pr_discussions.md`: запрос меню теперь передаёт `X-QR-Token`, требуемый `GuestSessionGuard`.
- `input/BNP-143/pr_discussions_raw.json` не содержит идентификаторов этого замечания; в GitHub у PR сейчас нет открытых review-тредов, поэтому `outputs/review_replies.json` содержит пустой список.
- Отдельный `ticket.md`, `pr_files.txt` и CI-логи в `input/BNP-143` отсутствуют; требования сверены с `request.md` и локальной историей обсуждения.

## Approach

- Добавлена проверка в тест загрузки меню: fetch должен содержать заголовок `X-QR-Token` со значением текущего QR-токена.
- Проверка сначала завершилась ожидаемой ошибкой на прежнем коде без заголовка; после исправления стала проходить.

## Files Modified

- `outputs/response.md` — результаты проверки.
- `outputs/review_replies.json` — пустой список, поскольку открытых GitHub review-тредов нет.
- `apps/guest-web/src/App.tsx` — передача `X-QR-Token` при запросе меню.
- `apps/guest-web/src/App.test.tsx` — проверка заголовка QR-токена в запросе меню.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` — выполнено; список файлов PR проверен.
- `git status --short` — проверено; изменены только `apps/guest-web/src/App.tsx`, `apps/guest-web/src/App.test.tsx` и файлы итогового отчёта.
- `npx eslint apps/guest-web/src/App.test.tsx apps/guest-web/src/App.tsx` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно; прошли тесты всех workspace, сборка и проверка design tokens.
- `git diff --check` — успешно.
- `git diff --name-status origin/main...HEAD -- '*/migrations/*'` — проверено: обе миграции новые (`A`), существующие не изменены.
- Изменён только публичный клиентский GET-запрос меню; глобальные провайдеры, схема БД и миграции этим исправлением не затронуты.
