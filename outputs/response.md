# Повторная доработка PR #160

## Issues/Notes

- Исправлена обработка dual-stack DNS: IPv6-записи пропускаются, а для POS-запроса выбирается публичный IPv4. Если DNS возвращает запрещённый IPv4 или не возвращает IPv4, соединение отклоняется.
- Конфликт схемы `Tenant` разрешён с сохранением полей интеграции POS, платёжных реквизитов и ежедневной нумерации заказов.
- В `input/BNP-136` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `merge_conflicts.md` и отдельный `ticket.md`. Требования проверены по `request.md`.
- Все inline-треды в `pr_discussions_raw.json` помечены как разрешённые; `outputs/review_replies.json` содержит пустой список.

## Approach

- Регрессионные тесты покрывают смешанный ответ с публичными IPv4 и IPv6, а также запрещённый IPv4 в том же DNS-ответе.
- Проверена интеграция адресной валидации с allowlist POS-хостов и закреплением HTTP-соединения за проверенным IPv4; перенаправления отклоняются.
- Поиск потребителей `dailyOrderNumberDate` в `apps/*` и `packages/*` подтвердил использование поля ежедневной нумерацией заказов. Миграция POS добавлена новой append-only миграцией; существующие миграции не изменялись.

## Files Modified

- `apps/api/src/onboarding/pos-network.ts` — выбор безопасного IPv4 из dual-stack DNS-ответа.
- `apps/api/src/onboarding/pos-network.spec.ts` — регрессионные проверки DNS-ответов.
- `apps/api/prisma/schema.prisma` — согласованная модель `Tenant`.
- `outputs/response.md` — результаты повторной проверки.
- `outputs/review_replies.json` — пустой список, так как открытых inline-тредов нет.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; рабочее дерево чистое.
- `npx eslint apps/api/src/onboarding/pos-network.ts apps/api/src/onboarding/pos-network.spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace; генерация Prisma Client прошла.
- `npm test` — успешно: API 65 наборов / 560 тестов, admin-web 33 файла / 86 тестов, guest-web 8 файлов / 26 тестов; сборка и проверка design tokens также прошли.
- `git diff --check` — успешно; маркеров конфликта в `apps/admin-web/src/App.tsx` и `apps/api/prisma/schema.prisma` нет.
- Проверка blast radius схемы: `rg` по `dailyOrderNumberDate` в `apps` и `packages`; typecheck и полный набор тестов прошли. Проверка миграций показала только добавление `20260927000001_add_pos_onboarding/migration.sql`, существующие миграции не менялись.
