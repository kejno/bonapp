# Результат доработки PR #164

## Issues/Notes

- Устранено блокирующее замечание в треде `PRRT_kwDOUUbUMs6md79P`: тест больше не задаёт цвет гостевой конфигурации независимо от результата сохранения.
- В `input/BNP-164` отсутствуют `instruction.md`, `pr_files.txt`, `ci_failures.md` и `ci_failures_full.log`; состояние CI по приложенным материалам проверить нельзя.
- В `pr_discussions_raw.json` единственный открытый inline-тред с `threadId` и `rootCommentId` — тред 8. На него подготовлен адресный ответ. Сводные комментарии без этих идентификаторов не являются адресуемыми review threads.

## Approach

- Обновил сценарий BNP-406: он меняет цвет на странице настроек, отправляет реальный для компонента `PUT /api/v1/admin/tenant/settings`, затем открывает гостевое меню.
- Заглушка API сохраняет результат PUT в общем состоянии и возвращает его для `GET /api/v1/guest/tenant/config`. Тест проверяет, что именно сохранённый `#123456` применяется к CSS-переменной гостевого меню.
- Миграции, схема БД и production-код не менялись; blast-radius проверки для этих областей не требовались.

## Files Modified

- `apps/guest-web/src/BNP-406.test.tsx` — связаны сохранение цвета в настройках и применение полученной конфигурации в гостевом PWA.
- `outputs/response.md` — сводка доработки и результаты проверок.
- `outputs/review_replies.json` — адресный ответ на открытый тред 8.
- `outputs/review_replies/thread_8.md` — ответ на замечание о несвязанном состоянии заглушек.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; проверены список файлов PR и рабочее дерево.
- `npx eslint apps/guest-web/src/BNP-406.test.tsx` — пройден.
- `npm run typecheck` — пройден для всех четырёх workspace.
- `npm test` — пройден: API 69 наборов / 581 тест, admin-web 63 файла / 122 теста, guest-web 9 файлов / 27 тестов; сборка и проверка design tokens также прошли.
- `git diff --check` — пройден.
- Blast-radius проверка не требовалась: изменён только тест, публичные сигнатуры, провайдеры, схема и миграции не затрагивались.
