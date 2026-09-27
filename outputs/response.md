# Переработка PR #154 — BNP-141

## Issues/Notes

- Закрыто блокирующее замечание: в шапке экрана QR-меню добавлена кнопка «Вызвать официанта». Она открывает выбор причины, отправляет запрос в `POST /guest/call-waiter` с QR-токеном и показывает состояние успеха или ошибки.
- Сервер определяет стол из QR-сессии, поэтому клиент не передаёт `tableId` в теле запроса.
- В `input/BNP-141/` отсутствуют `pr_files.txt`, `ci_failures.md` и `ci_failures_full.log`; дополнительных CI-сбоев в подготовленном контексте нет.
- В рабочем дереве не найден `instruction.md` или корневой `AGENTS.md`. Прочитаны `CLAUDE.md` и инструкции PR rework из `.dmtools/agents/instructions/pr_rework/`.

## Approach

- Разрешил конфликты в модуле меню, гостевом экране, его тестах и конфигурации Vitest: сохранены QR-аутентификация меню и новые возможности основной ветки для заказа и настроек заведения.
- Добавил пользовательские тесты отправки вызова официанта с QR-токеном и отображения ошибки при отказе API. Проверки проходят через UI и публичный HTTP-запрос, без подмены внутренних компонентов приложения.
- Сохранил проверку QR-меню, добавления блюда в корзину и корзинные/заказные сценарии основной ветки.
- Изменения не затрагивают миграции, схему БД, глобальные провайдеры или публичные сигнатуры API; дополнительная проверка blast radius для этих категорий не требуется.

## Files Modified

- `apps/guest-web/src/App.tsx` — совместил экран меню с загрузкой tenant config, корзиной, заказом и вызовом официанта.
- `apps/guest-web/src/App.test.tsx` — тесты меню/корзины и успеха/ошибки вызова официанта.
- `apps/api/src/menu/menu.module.ts` — объединил импорты гостевой сессии и OrdersModule.
- `apps/guest-web/vite.config.ts` — сохранил фильтр unit-тестов и исключение e2e-папки.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — отчёт и ответ на открытый review thread.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` — выполнено; просмотрен список файлов PR.
- `git status --short` — выполнено; проверен статус изменённых и конфликтных файлов.
- `npx eslint apps/api/src/menu/menu.module.ts apps/guest-web/src/App.test.tsx apps/guest-web/src/App.tsx apps/guest-web/vite.config.ts` — успешно, 0 ошибок. ESLint пропустил `vite.config.ts` согласно ignore-правилу.
- `npm run typecheck` — успешно во всех 4 workspace.
- `npm test` — успешно: API 61 suite / 541 тест, guest-web 4 файла / 10 тестов, admin-web 29 файлов / 80 тестов; сборка и проверка design tokens также прошли.
- `git diff --cached --check` — выполнено после разрешения конфликтов.
