# Исправления PR #146

## Issues/Notes

- Исправлена маршрутизация `tenant:service_mode_changed`: событие отправляется в комнаты кухни и зала, к которым подключается персонал.
- Входящие замечания по проверке перехода статуса и JWT из query уже устранены в предыдущем изменении PR; текущий открытый тред касался только маршрутизации события.
- Для локальных проверок восстановлены отсутствующие зависимости командой `npm install --ignore-scripts --no-audit --no-fund`.

## Approach

- Добавлен регрессионный тест с проверкой события и обеих целевых комнат.
- Сначала тест воспроизвёл дефект: событие уходило в `tenant:<id>`. Затем Gateway был исправлен на отправку в `tenant_<id>_kitchen` и `tenant_<id>_hall`.

## Files Modified

- `apps/api/src/menu/menu.gateway.ts` — маршрутизация события смены режима обслуживания в обе комнаты персонала.
- `apps/api/src/menu/menu.gateway.spec.ts` — регрессионный тест маршрутизации.
- `outputs/response.md` — отчёт о rework.
- `outputs/review_replies.json` и `outputs/review_replies/thread_1.md` — ответ на открытый review-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены для проверки состава файлов и рабочей копии.
- `npx eslint apps/api/src/menu/menu.gateway.ts apps/api/src/menu/menu.gateway.spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API — 56 наборов и 525 тестов; admin-web — 28 файлов и 76 тестов; guest-web — 1 файл и 3 теста. Команда также запустила сборку и проверку design tokens.
- `npm run test:design-tokens` — успешно; сборка трёх приложений и проверка design tokens завершились.
- `git diff --check` — успешно.
