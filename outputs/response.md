# Повторная доработка PR #160 — BNP-136

## Issues/Notes

- Исправлена проверка `logoUrl` при сохранении первого шага онбординга: сервер теперь принимает только URL публичного хранилища текущего заведения с именем файла в формате UUID и допустимым расширением.
- В исходном контексте нет `ci_failures.md`, `ci_failures_full.log`, `merge_conflicts.md` и отдельного `ticket.md`; требования сверены с `request.md`.
- Четыре inline-треда с `threadId` и `rootCommentId` в `pr_discussions_raw.json` уже разрешены. Последнее замечание доступно только как текст без идентификаторов треда; адресный ответ для него сформировать нельзя.

## Approach

- Сначала добавлен регрессионный тест: он воспроизводил принятие внешнего URL до исправления.
- Проверку tenant-префикса и имени файла вынес в общий метод `TenantService` и применил как при сохранении настроек, так и при сохранении шага 1 онбординга.
- Схема БД, миграции и публичные сигнатуры не менялись; дополнительная проверка blast radius не требовалась.

## Files Modified

- `apps/api/src/tenant/tenant.service.ts` — общая проверка URL логотипа, подключённая к шагу 1 и существующему сохранению настроек.
- `apps/api/src/tenant/tenant.service.spec.ts` — регрессионный тест для URL из внешнего домена.
- `outputs/response.md` — результаты доработки и проверок.
- `outputs/review_replies.json` — пустой список, так как открытых адресных inline-тредов нет.

## Test Coverage

- RED/GREEN: `npm test --workspace @bonapp/api -- --runInBand src/tenant/tenant.service.spec.ts` — тест падал до исправления и прошёл после; всего 22 теста прошли.
- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; проверен исходный состав PR и текущие изменённые файлы.
- `npx eslint apps/api/src/tenant/tenant.service.ts apps/api/src/tenant/tenant.service.spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API 65 наборов / 568 тестов, admin-web 34 файла / 88 тестов, guest-web 8 файлов / 26 тестов; проверки design tokens и сборки также завершились успешно.
- `git diff --check` — успешно.
