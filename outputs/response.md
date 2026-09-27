# Проверка исправлений по PR #151

## Issues/Notes

- Оба открытых review-треда закрыты в текущем `HEAD` (`6db7132`): клиент обрабатывает группы модификаторов в фактической вложенной форме API, а сохранённая корзина сбрасывается при смене QR-стола.
- Код и регрессионные тесты уже присутствовали в проверяемой версии; дополнительных изменений исходников в этом проходе не потребовалось.
- В `input/BNP-143` отсутствуют `ci_failures.md`, `ci_failures_full.log` и отдельный `ticket.md`. Требования проверены по `request.md` и обсуждениям PR.

## Approach

- Тест интерфейса меню проверяет фактический ответ с `modifierGroup`: группа и варианты отображаются, добавление блюда недоступно до выбора обязательного варианта и становится доступным после выбора.
- Тест корзины проверяет переключение с одного QR на другой: позиции и комментарий очищаются, а QR нового стола сохраняется. Отдельный сценарий проверяет открытие checkout с QR другого стола.
- CodeGraph недоступен. Изменения не затрагивают глобальные провайдеры или публичные сигнатуры. Проверка миграций `git diff --name-status origin/main...HEAD -- '*/migrations/*'` показала только две новые миграции (`A`); существующие миграции не менялись. Потребители счётчика проверены поиском `rg` по `apps/api/src` и `apps/api/test`; дата дневного счётчика используется в обоих сервисах создания заказов и покрыта тестами.

## Files Modified

- `apps/guest-web/src/App.tsx` — чтение вложенной формы групп модификаторов и активация корзины для QR.
- `apps/guest-web/src/App.test.tsx` — регрессионное покрытие группы с обязательным модификатором и смены QR при открытии checkout.
- `apps/guest-web/src/CheckoutPage.tsx` — выбор QR из URL перед токеном предыдущего стола.
- `apps/guest-web/src/orders/cart.store.ts` — сброс корзины и комментария при смене QR.
- `apps/guest-web/src/orders/cart.store.test.ts` — проверка сброса сохранённой корзины.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md`, `outputs/review_replies/thread_2.md` — отчёт и ответы на открытые review-треды.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; рабочее дерево было чистым до обновления отчёта.
- `npx eslint apps/guest-web/src/App.tsx apps/guest-web/src/App.test.tsx apps/guest-web/src/CheckoutPage.tsx apps/guest-web/src/orders/cart.store.ts apps/guest-web/src/orders/cart.store.test.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API 62 набора/547 тестов, admin-web 29 наборов/80 тестов, guest-web 5 наборов/19 тестов; сборка и проверка design tokens завершились успешно.
- `git diff --check origin/main...HEAD` — успешно.
- Проверка миграций показала только две новые миграции (`A`); поиск потребителей `dailyOrderNumber`/`daily_order_number` выполнен через `rg` по `apps/api/src` и `apps/api/test`.
