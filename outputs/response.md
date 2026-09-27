# Повторная проверка PR BNP-142

## Issues/Notes

- Исправлена причина падения CI: Vitest больше не обнаруживает Playwright-сценарии из `e2e/`; отдельный скрипт Playwright продолжает запускать этот каталог.
- При разрешении конфликтов сохранены изменения `main` для экрана статуса заказа, вызова официанта и конфигурации режима обслуживания. Карточка блюда и локальная корзина объединены с этим функционалом.
- Описание PR в исходных данных относится к BNP-387 и не соответствует BNP-142. Его следует синхронизировать с реализацией карточки блюда.

## Approach

- Добавлено исключение `**/e2e/**` в конфигурацию Vitest; Playwright-сценарий оставлен в штатном расположении и его маршрут дополнен ответом API конфигурации тенанта.
- Разрешены конфликты `App.tsx` и `App.test.tsx`, объединив текущую карточку блюда с изменениями из `main`.
- Регрессионный тест проверяет валидацию обязательного выбора, изменение цены после выбора модификатора и увеличение доступного счётчика корзины.
- Проверка blast radius для глобальных провайдеров, схемы БД, публичных API и миграций не требуется: изменены только интерфейс гостевого клиента, конфигурация Vitest и его тесты.

## Files Modified

- `apps/guest-web/src/App.tsx` — карточка блюда, модификаторы, цена и запись в Zustand-корзину; сохранены функции из `main`.
- `apps/guest-web/src/App.test.tsx` — сценарий обязательного модификатора и корректные проверки интерфейса.
- `apps/guest-web/vite.config.ts` — исключение каталога Playwright из Vitest.
- `apps/guest-web/e2e/dish-card.spec.ts` — мок конфигурации тенанта для e2e.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md` — отчёт и ответ на открытый inline-тред.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — проверены состав PR и рабочее дерево; все конфликтные файлы разрешены.
- `npx eslint apps/guest-web/src/App.tsx apps/guest-web/src/App.test.tsx apps/guest-web/e2e/dish-card.spec.ts apps/guest-web/vite.config.ts` — завершился успешно; ESLint сообщил, что `vite.config.ts` исключён настройкой игнорирования.
- `npm run typecheck` — успешно для всех четырёх workspace.
- `npm test` — успешно: API 61 suite / 543 теста, admin-web 29 файлов / 80 тестов, guest-web 4 файла / 14 тестов; production build и проверка design tokens также прошли.
- `npm run test:e2e --workspace @bonapp/guest-web -- e2e/dish-card.spec.ts` — успешно, 1 Playwright-тест.
- `git diff --check` — успешно.
