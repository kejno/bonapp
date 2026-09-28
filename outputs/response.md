# Результат доработки PR #187

## Issues/Notes

- Устранено замечание IMPORTANT: некорректное percent-кодирование в маршруте `/t/:token` больше не приводит к падению приложения.
- Для `/t/%` отображается сообщение «Стол не найден», экран загрузки не остается активным.
- В подготовленных материалах отсутствуют отдельные файлы CI и список измененных файлов `pr_files.txt`; проверка выполнена по доступным diff и обсуждениям.

## Approach

- Добавлен регрессионный тест на `/t/%`. До исправления он падал с `URIError: URI malformed`.
- Декодирование токена из маршрута выполняется безопасно. При ошибке разбора приложение показывает ожидаемое сообщение; query-параметр `qr_token` сохраняет приоритет.
- Других открытых inline замечаний в `pr_discussions_raw.json` нет.

## Files Modified

- `apps/guest-web/src/App.tsx` — безопасный разбор токена маршрута и сообщение об ошибке для некорректного токена.
- `apps/guest-web/src/App.test.tsx` — регрессионный тест для ошибочного percent-кодирования.
- `outputs/response.md` — отчет о доработке.
- `outputs/review_replies.json` и `outputs/review_replies/thread_1.md` — ответ на открытое обсуждение PR.

## Test Coverage

- RED: `npx vitest run src/App.test.tsx -t 'malformed percent encoding'` — тест воспроизвел `URIError` до исправления.
- GREEN: `npx vitest run src/App.test.tsx` — пройдено, 13 тестов.
- `git diff --diff-filter=ACM --name-only origin/main...HEAD` — выполнено; показаны файлы PR на HEAD.
- `git status --short` — проверен; изменены только `App.tsx` и `App.test.tsx`.
- `npx eslint apps/guest-web/src/App.tsx apps/guest-web/src/App.test.tsx` — пройдено.
- `npm run typecheck` — пройдено для всех 4 пакетов.
- `npm test` — пройдено: 9 файлов и 29 тестов `guest-web`, 63 файла и 124 теста `admin-web`, 69 suites и 581 тест API; проверка design tokens и сборка также завершились успешно.
- Blast-radius проверка не требовалась: изменения затрагивают только разбор URL и UI гостевого приложения, без глобальных провайдеров, схемы БД, публичных API или миграций.
