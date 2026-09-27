# Повторная доработка PR #156 — BNP-139

## Issues/Notes

- Подготовленные файлы `ci_failures.md` и `ci_failures_full.log` отсутствуют, поэтому отдельные падения CI не предоставлены. Ветка `pr_discussions_raw.json` содержит три открытых inline-треда; для каждого подготовлен отдельный ответ.
- В схеме и коде API нет хранилища tenant-level credentials платёжных провайдеров. Согласно решению BNP-267, до появления соответствующих моделей готовность этого пункта возвращается как `false`; решение BNP-270 требует учитывать сохранённые credentials, когда такое хранилище будет доступно. Создание новой модели или endpoint для настройки платежей выходит за согласованный scope. Текущее ограничение подробно пояснено в ответе на тред 1.
- Предложение вынести расчёт бизнес-дня пропущено: в актуальном `OrdersService` нет копии `businessDayBounds`/`zonedMidnight`; он использует счётчик `Tenant.dailyOrderNumber`, который сбрасывается при открытии и закрытии смены.
- Описание PR в `pr_info.md` относится к PDF/QR-гонке и не соответствует BNP-139. Внешнее описание PR этим локальным rework не изменялось.

## Approach

- Разрешил все семь конфликтов из `merge_conflicts.md`, сохранив Welcome-изменения и совместив их с маршрутами, KDS, модулями и схемой `main`.
- Согласовал Welcome-сервис с моделью `Shift` из актуальной схемы: активная смена имеет статус `OPEN`, при открытии указывается `cashierId`.
- Изменил выбор стола для тестового заказа: сначала минимальный `tableNumber`, затем дата создания. Добавил регрессионную проверку выбора порядка.
- Перенёс миграцию Welcome на `20260927000000`, после всех миграций `main` (максимальный timestamp — `20260926220000`), и оставил в ней только добавление `orders.is_test`; таблица `shifts` уже создаётся миграцией `main`.

## Files Modified

- `apps/admin-web/src/App.tsx` — объединил маршруты Welcome и актуальные маршруты приложения.
- `apps/api/prisma/schema.prisma` — объединил изменения схемы и добавил `Order.isTest`.
- `apps/api/src/app.module.ts` — зарегистрировал WelcomeModule совместно с модулями `main`.
- `apps/api/src/orders/orders.controller.ts`, `orders.controller.spec.ts`, `orders.module.ts` — объединил симуляцию тестового заказа с KDS и административными контроллерами.
- `apps/api/src/prisma/prisma.service.ts` — сохранил tenant-scoping актуальных моделей `main`.
- `apps/api/src/welcome/welcome.service.ts`, `welcome.service.spec.ts`, `apps/api/test/BNP-139.e2e-spec.ts` — исправил выбор стола и интеграцию со схемой смен; добавил e2e-регрессию через публичный HTTP API.
- `apps/api/prisma/migrations/20260927000000_welcome_dashboard/migration.sql` — добавил поле тестового заказа миграцией с новым timestamp.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/*.md` — итог и ответы на открытые ревью-треды.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` — выполнена проверка списка файлов PR.
- `git status --short` — выполнена; все семь конфликтных файлов разрешены и добавлены в индекс.
- `npx eslint` для файлов исходников, изменённых при разрешении конфликтов и исправлении — успешно, ошибок нет. Prisma schema проигнорирована конфигурацией ESLint.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API 62 suite / 543 теста, admin-web 31 файл / 82 теста, guest-web 6 файлов / 14 тестов; сборка и проверка design tokens завершились успешно.
- `npx jest --config test/jest-e2e.json BNP-139.e2e-spec.ts --runInBand --forceExit` — успешно: 1 e2e-тест на реальных PostgreSQL и Redis через Docker.
- `git diff --check` — успешно.
- Миграционная проверка: timestamp новой миграции позже максимального timestamp на `main`; существующие миграции не изменялись.
