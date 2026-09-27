# Исправления по PR #151 — BNP-143

## Issues/Notes

- Устранены оба открытых замечания: меню обрабатывает фактический вложенный формат групп модификаторов API; корзина сбрасывается при смене QR-токена.
- CI-логи, `ticket.md` и `pr_files.txt` в `input/BNP-143` отсутствуют. Требования сверены с `request.md`, PR diff и обсуждениями.

## Approach

- Разрешил конфликты с `main`, сохранив карточку блюда и подключив выбор модификаторов к QR-привязанной Zustand-корзине PR.
- Регрессионные тесты проверяют выбор обязательного модификатора через карточку блюда и сброс корзины при открытии checkout с другим QR.
- Изменений схемы БД, миграций, глобальных провайдеров и публичных API в этой итерации нет.

## Files Modified

- `apps/guest-web/src/App.tsx` — разрешён конфликт и объединён интерфейс выбора блюда с текущей корзиной.
- `apps/guest-web/src/App.test.tsx` — разрешён конфликт; тесты проверяют вложенный контракт меню и пользовательский сценарий выбора блюда.
- `outputs/response.md` — этот отчёт.
- `outputs/review_replies.json` и `outputs/review_replies/thread_1.md`, `outputs/review_replies/thread_2.md` — ответы на открытые треды.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены для проверки состава PR и состояния конфликтов.
- `git diff --check` — успешно; конфликтных маркеров не осталось.
- `npx eslint apps/guest-web/src/App.tsx apps/guest-web/src/App.test.tsx` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно; guest-web: 6 файлов и 22 теста, API: 62 набора и 547 тестов. Остальные workspace и проверка design tokens также прошли; команда завершилась с кодом 0.
