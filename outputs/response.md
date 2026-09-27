# Доработка PR #161 — BNP-134

## Issues/Notes

- В `input/BNP-134` отсутствуют `ci_failures.md` и `ci_failures_full.log`; CI-сбои по локальным материалам не указаны.
- Первый полный запуск `npm test` обнаружил совпадение timestamp миграции регистрации с миграцией из `main`. Миграцию регистрации перенёс на уникальный timestamp после всех миграций `main`; существующие миграции не изменялись.
- В `pr_discussions_raw.json` найден один открытый inline-тред и один общий комментарий без `threadId`/`rootCommentId`. Ответ подготовлен для inline-треда.

## Approach

- Добавил отдельное ограничение `5` запросов в минуту для `POST /public/tenants/register` через Nest Throttler.
- Добавил HTTP-регрессионный тест: первые пять регистрационных запросов проходят, шестой получает `429`. До исправления тест падал, получая `201`.
- Разрешил конфликты с `main`, объединив маршруты admin-web, импорты модулей API и все поля Tenant из обеих версий схемы.
- Перенёс миграцию регистрации на `20260927020000_tenant_registration`, после последней миграции `main` (`20260927010002`).

## Files Modified

- `apps/admin-web/src/App.tsx` — объединены маршруты регистрации/онбординга с маршрутами из `main`.
- `apps/api/prisma/schema.prisma` — объединены конфликтующие поля Tenant.
- `apps/api/src/app.module.ts` — сохранены модули регистрации, официантских вызовов и welcome-экрана.
- `apps/api/src/public-registration/public-registration.controller.ts` — лимит регистрации 5 запросов в минуту.
- `apps/api/src/public-registration/public-registration.controller.spec.ts` — регрессионная проверка ограничения через HTTP.
- `apps/api/prisma/migrations/20260927020000_tenant_registration/migration.sql` — уникальный timestamp миграции регистрации.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — отчёт и ответ в review-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены для проверки исходных изменений и состояния рабочей копии.
- `npx eslint apps/admin-web/src/App.tsx apps/api/src/app.module.ts apps/api/src/public-registration/public-registration.controller.ts apps/api/src/public-registration/public-registration.controller.spec.ts` — успешно.
- `npm run typecheck` — успешно для всех четырёх workspace.
- `npm test` — успешно для API, admin-web, guest-web и проверки design tokens; сборки workspace также выполнены.
- `git diff --check` — успешно.
- Проверка влияния миграций: сравнил миграции с `origin/main`; миграция регистрации добавлена с timestamp после существующих, существующие миграции не менялись. Проверка уникальности timestamp миграций проходит в полном наборе тестов.
