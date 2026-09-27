# Повторная доработка PR #159 — BNP-135

## Issues/Notes

- Исправлена серверная проверка обязательных названия, юридического наименования и адреса, а также формата цвета бренда.
- Конфликт уникальности slug от Prisma (`P2002`) возвращается как доменная ошибка `SLUG_TAKEN`.
- Для timezone применено принятое продуктовое решение из `existing_questions.json` (BNP-280): в MVP поле скрыто, при сохранении используется `Europe/Minsk`.
- Исправлены конфликты с `main` в `App.tsx`, `tenant.controller.ts`, `tenant.service.ts` и этом файле; функции шага 1 и текущие маршруты/методы сохранены.
- Замечание о превью логотипа исправлено очисткой object URL при смене файла и размонтировании.
- Файлы `ci_failures.md`, `ci_failures_full.log`, `ticket.md` и `pr_files.txt` в предоставленном контексте отсутствуют. Отдельный PR diff усечён; исходный код проверен в checkout.

## Approach

- Добавлены регрессионные проверки обязательных полей, некорректных цветов и гонки slug в существующий набор тестов `TenantService`.
- Уникальное ограничение БД остаётся окончательным арбитром конкурентных запросов; Prisma `P2002` преобразуется в тот же ответ, что и предварительная проверка занятости.
- Все 4 открытых inline-треда получили отдельные ответы. Тред по timezone ссылается на принятую продуктовую спецификацию BNP-280.
- Для поиска использования затронутых методов использован `rg` по `apps/` и `packages/` (CodeGraph недоступен).

## Files Modified

- `apps/admin-web/src/App.tsx` — разрешены конфликты маршрутов с `main` и сохранены onboarding-маршруты.
- `apps/admin-web/src/pages/OnboardingStep1Page.tsx` — временный URL предпросмотра освобождается при смене файла и размонтировании.
- `apps/api/src/tenant/tenant.controller.ts` — объединены импорты и интерфейсы после разрешения конфликта.
- `apps/api/src/tenant/tenant.service.ts` — объединены изменения с `main`; добавлены валидация профиля и преобразование конфликта уникальности.
- `apps/api/src/tenant/tenant.service.spec.ts` — добавлены регрессионные проверки валидации и конкурентного конфликта.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/` — итог и ответы на открытые треды.

## Test Coverage

- `npx jest --config apps/api/package.json --runInBand apps/api/src/tenant/tenant.service.spec.ts` — успешно, 21 тест.
- `git diff --diff-filter=ACM --name-only origin/main...HEAD`, `git status --short` и `git diff --check` — выполнены; `git diff --check` прошёл, конфликтных маркеров в разрешённых файлах не осталось.
- `npx eslint apps/admin-web/src/App.tsx apps/admin-web/src/pages/OnboardingStep1Page.tsx apps/api/src/tenant/tenant.controller.ts apps/api/src/tenant/tenant.service.ts apps/api/src/tenant/tenant.service.spec.ts` — успешно.
- `npm run typecheck` — успешно во всех 4 workspace.
- `npm test` — успешно: API 64 набора / 558 тестов, guest-web 8 файлов / 26 тестов, admin-web 33 файла / 85 тестов; build и проверка design tokens в составе команды завершились успешно.
- Blast-radius: проверены вызовы `saveOnboardingStep1`, `isSlugAvailable` и `getSettings` поиском `rg` по `apps/` и `packages/`. Изменений схемы или миграций в этом исправлении нет.
