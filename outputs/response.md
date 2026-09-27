# Повторная работа над PR #157

## Issues/Notes

- Добавлен `AdminRoleGuard` на получение и сохранение платёжных реквизитов. Роли `WAITER`, `CASHIER` и `CHEF` не могут управлять настройками шлюзов.
- Запись реквизитов теперь атомарно меняет только ключ выбранного шлюза в JSONB внутри tenant-транзакции. Параллельное сохранение разных шлюзов не затирает данные.
- Разрешены все конфликты с `main`: сохранены настройки тенанта, режим обслуживания и маршруты `main`, а также шаг 3 и поле платёжных реквизитов из PR.
- Исправлено совпадение timestamp новой миграции с миграцией `main`: `add_payment_credentials` перенесена на `20260927000000`, позже всех миграций базовой ветки.

## Approach

- Добавлены регрессионные тесты для guard на обоих платёжных endpoints и конкурентного сохранения двух шлюзов.
- Код прав доступа и сохранения обновлён после подготовки проверок. Для JSONB используется `jsonb_set` в транзакции с RLS-контекстом тенанта.
- Проверил потребителей `paymentCredentials` поиском по API; CodeGraph недоступен. Схема, имена полей и публичные сигнатуры методов не менялись.

## Files Modified

- `apps/admin-web/src/App.tsx` — сохранены маршруты PR и `main` при разрешении конфликта.
- `apps/api/prisma/schema.prisma` — объединены поле реквизитов из PR и `serviceMode` из `main`.
- `apps/api/src/tenant/tenant.controller.ts` — применён административный guard к платёжным endpoints; сохранены настройки тенанта и загрузка логотипа.
- `apps/api/src/tenant/tenant.service.ts` — объединены функции настроек и платежей; JSONB-реквизиты записываются атомарно.
- `apps/api/src/tenant/tenant.service.spec.ts` — проверено сохранение разных шлюзов при конкурентных запросах.
- `apps/api/src/tenant/tenant.controller.spec.ts` — проверено ограничение обоих платёжных endpoints административным guard.
- `apps/api/prisma/migrations/20260927000000_add_payment_credentials/migration.sql` — новая миграция с уникальным timestamp.
- `outputs/review_replies.json` и `outputs/review_replies/*.md` — ответы на оба открытых inline-треда.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; новых неучтённых файлов от этой работы нет.
- `npx eslint apps/admin-web/src/App.tsx apps/api/src/tenant/tenant.controller.ts apps/api/src/tenant/tenant.service.ts apps/api/src/tenant/tenant.service.spec.ts apps/api/src/tenant/tenant.controller.spec.ts` — пройден.
- `npm run typecheck` — пройден для всех четырёх workspace.
- `npm test` — пройден: API 62 набора / 545 тестов, admin-web 30 файлов / 81 тест, guest-web 6 файлов / 14 тестов; production build и проверка design tokens также прошли.
- Проверка blast radius: поиском `rg` проверены все упоминания `paymentCredentials` в `apps/api`; CodeGraph недоступен. Изменённые миграции только добавляются, миграция `main` не редактировалась.
- `git diff --check` — пройден; конфликтных маркеров в разрешённых файлах нет.
