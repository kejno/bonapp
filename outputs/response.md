# Доработка PR #161 — BNP-134

## Issues/Notes

- Единственное адресное замечание в `pr_discussions_raw.json` помечено как resolved; открытых inline-тредов нет. Поэтому `outputs/review_replies.json` содержит пустой список. CI-логи в `input/BNP-134` отсутствуют.
- Устранены конфликты с `main`, сохранив маршрут регистрации и onboarding PR вместе с добавленными в `main` маршрутами шагов 1 и 2.

## Approach

- Объединил маршруты регистрации и онбординга с маршрутами onboarding из `main` в `apps/admin-web/src/App.tsx`.
- Сохранил изменения tenant onboarding и соответствующие регрессионные тесты, находившиеся в подготовленной рабочей копии.
- Проверил использование `saveOnboardingStep1`, `isSlugAvailable` и `getSettings` поиском `rg` в `apps/` и `packages/`; CodeGraph недоступен.

## Files Modified

- `apps/admin-web/src/App.tsx` — объединены маршруты регистрации и onboarding.
- `apps/admin-web/src/pages/OnboardingStep1Page.tsx`, `onboarding-validation.ts`, `onboarding-validation.test.ts` — изменения onboarding и его проверок.
- `apps/api/src/tenant/tenant.controller.ts`, `tenant.service.ts`, `tenant.service.spec.ts` — изменения tenant onboarding и регрессионные проверки.
- `outputs/response.md`, `outputs/review_replies.json` — итоговый отчёт; удалён файл ответа для уже разрешённого треда.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- `npx eslint apps/admin-web/src/App.tsx apps/admin-web/src/pages/OnboardingStep1Page.tsx apps/admin-web/src/pages/onboarding-validation.test.ts apps/admin-web/src/pages/onboarding-validation.ts apps/api/src/tenant/tenant.controller.ts apps/api/src/tenant/tenant.service.ts apps/api/src/tenant/tenant.service.spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API 66 наборов / 564 теста, guest-web 8 файлов / 26 тестов, admin-web 34 файла / 86 тестов; сборка и проверка design tokens также прошли.
- `git diff --check` и `git diff --cached --check` — успешно; конфликтных маркеров не осталось.
- Blast-radius: проверены вызовы затронутых tenant-методов через `rg` по `apps/` и `packages/`.
