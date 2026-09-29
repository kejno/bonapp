# Доработка PR #209 — BNP-168

## Issues/Notes

- Устранён дублирующийся `POST /admin/pos/sync-menu`: теперь маршрут зарегистрирован только в `PosSyncController` и запускает новую очередь через `IikoService`.
- Для сохранённого маршрута оставлены существующие `TenantContextGuard` и `AdminRoleGuard`; `IikoController` обслуживает только `GET /admin/pos/sync-status`.
- В подготовленных материалах отсутствуют CI-логи и отдельный список файлов PR. Других открытых inline review threads нет.

## Approach

- Подключил `IikoService` через экспорт `IikoModule` и направил существующую точку входа синхронизации на `enqueueSync()`.
- Добавил регрессионный тест, который проверяет контроллеры обоих модулей и подтверждает наличие ровно одного POST-маршрута `sync-menu`, а также сохранность polling-маршрута.
- Проверка RED: до изменения новый тест обнаруживал второй POST-маршрут; после изменения тест проходит.

## Files Modified

- `apps/api/src/integrations/iiko/iiko.controller.ts`
- `apps/api/src/integrations/iiko/iiko.controller.spec.ts`
- `apps/api/src/integrations/iiko/iiko.module.ts`
- `apps/api/src/onboarding/onboarding.module.ts`
- `apps/api/src/onboarding/pos-sync.controller.ts`
- `outputs/response.md`
- `outputs/review_replies.json`
- `outputs/review_replies/thread_3.md`

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены для сверки файлов PR и локальных изменений.
- `npx eslint apps/api/src/integrations/iiko/iiko.controller.ts apps/api/src/integrations/iiko/iiko.controller.spec.ts apps/api/src/integrations/iiko/iiko.module.ts apps/api/src/onboarding/pos-sync.controller.ts apps/api/src/onboarding/onboarding.module.ts` — PASSED.
- `npm run typecheck` — PASSED для всех четырёх workspace.
- `npm test` — PASSED: API 75 наборов / 594 теста, guest-web 10 файлов / 32 теста, admin-web — все тесты прошли; также прошли сборка и проверка design tokens.
- Blast-radius маршрутизации проверен регрессионным тестом по контроллерам, зарегистрированным в `IikoModule` и `OnboardingModule`; в сумме для `sync-menu` найден ровно один маршрут. Изменения не затрагивают публичные сигнатуры, глобальные провайдеры, схему БД или миграции.
