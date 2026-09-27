# Переработка PR #154 — BNP-141

## Issues/Notes

- Закрыто блокирующее замечание: в шапке QR-меню есть кнопка «Вызвать официанта». Она предлагает запросить счёт или позвать официанта, отправляет `POST /guest/call-waiter` с QR-токеном и показывает результат запроса.
- Контекст содержит противоречие: критерии BNP-141 и открытый review thread требуют кнопку, тогда как сохранённый ответ BNP-263 предписывает скрыть её до отдельной истории. В реализации соблюдены критерии BNP-141 и замечание PR.
- В `input/BNP-141/` нет файлов `pr_files.txt`, `ci_failures.md`, `ci_failures_full.log` и `merge_conflicts.md`; отдельные CI-сбои и список конфликтов не предоставлены.
- В рабочем дереве не найден `instruction.md` или корневой `AGENTS.md`. Прочитаны инструкции PR rework из `.dmtools/agents/instructions/pr_rework/`.

## Approach

- Сохранены QR-аутентификация меню, загрузка конфигурации заведения и существующие возможности корзины и заказа.
- Проверил сценарий успешного вызова и отображения ошибки через пользовательский интерфейс и HTTP-запрос с QR-токеном.
- Изменения не добавляют миграции, не затрагивают схему БД или глобальные провайдеры. Метод меню сохранил публичную сигнатуру; проверки влияния на потребителей для этих категорий не требовались.

## Files Modified

- `apps/guest-web/src/App.tsx` — кнопка вызова, выбор причины, запрос к API и состояния результата.
- `apps/guest-web/src/App.test.tsx` — проверки меню/корзины и успешного/неуспешного вызова.
- `apps/api/src/menu/guest-menu.controller.ts`, `menu.module.ts`, `menu.service.ts` и соответствующие тесты — QR-сессия каталога, стоп-лист и сортировка.
- `apps/api/test/BNP-148.e2e-spec.ts`, `BNP-340.e2e-spec.ts`, `BNP-343.e2e-spec.ts`, `BNP-357.e2e-spec.ts`, `BNP-358.e2e-spec.ts`, `BNP-364.e2e-spec.ts`, `BNP-365.e2e-spec.ts`, `menu-cache-test.fixture.ts`, `menu-cache.e2e-spec.ts` — обновлённые сценарии тестирования.
- `apps/guest-web/e2e/menu.spec.ts`, `apps/guest-web/src/cart.store.ts`, `apps/guest-web/vite.config.ts` — проверки QR-меню, состояние корзины и конфигурация тестов.
- `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — ответ на открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` — выполнено, список файлов PR просмотрен.
- `git status --short` — выполнено, рабочее дерево чистое.
- `npx eslint <все изменённые исходные файлы>` — успешно, 0 ошибок; ESLint пропустил `apps/guest-web/vite.config.ts` по правилу игнорирования.
- `npm run typecheck` — успешно во всех 4 workspace.
- `npm test` — успешно: API 61 suite / 541 тест, guest-web 4 файла / 10 тестов, admin-web 29 файлов / 80 тестов; сборка и проверка design tokens также прошли.
- Blast-radius проверка для миграций, схемы БД и глобальных провайдеров не применялась: эти области не менялись. Публичную сигнатуру `MenuService.getGuestMenu` проверил по диффу — она сохранена.
