# Доработка PR #161 — BNP-134

## Issues/Notes

- Устранены замечания повторного ревью: редактирование настроек тенанта было доступно любому аутентифицированному сотруднику, а ключ загрузки логотипа не проходил проверку при сохранении настроек.
- В `input/BNP-134` отсутствуют CI-логи. В `pr_discussions_raw.json` нет открытых inline-тредов, поэтому `outputs/review_replies.json` содержит пустой список.

## Approach

- Добавил `AdminRoleGuard` для `PUT /admin/tenant/settings` по принятому в API паттерну административных маршрутов.
- Генерация presigned URL теперь использует уникальный ключ `tenants/{tenantId}/logos/{uuid}.{ext}`, который соответствует ограничениям `updateSettings()` и не перезаписывает ранее загруженный логотип.
- Добавил проверки наличия guard на маршруте и совместимости сформированного URL с сохранением настроек.
- Проверил вызовы `updateSettings` поиском `rg` по `apps/` и `packages/`; внешний потребитель метода — только контроллер тенанта. CodeGraph недоступен.

## Files Modified

- `apps/api/src/tenant/tenant.controller.ts` — добавлена проверка административной роли.
- `apps/api/src/tenant/tenant.service.ts` — согласован ключ загрузки логотипа с валидатором.
- `apps/api/src/tenant/tenant.controller.spec.ts`, `apps/api/src/tenant/tenant.service.spec.ts` — регрессионные проверки.
- `outputs/response.md`, `outputs/review_replies.json` — этот отчёт и перечень ответов на треды.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- `npx eslint apps/api/src/tenant/tenant.controller.spec.ts apps/api/src/tenant/tenant.controller.ts apps/api/src/tenant/tenant.service.spec.ts apps/api/src/tenant/tenant.service.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API, guest-web и admin-web; сборка и проверка design tokens также прошли.
- `git diff --check` — успешно.
- Blast-radius: проверены все вызовы `updateSettings` поиском `rg`; глобальные провайдеры, схема БД и миграции этим исправлением не затронуты.
