# Результат доработки PR #210 — BNP-157

## Issues/Notes

- **Блокирующий вопрос по контракту Оплати™ остаётся открытым.** В доступных материалах нет официальных endpoint, форматов API/webhook и sandbox-параметров. Тикет BNP-213 подтверждает, что эти данные должны быть предоставлены отдельно. Подменять их предположениями нельзя, поэтому совместимость интеграции с реальным провайдером не подтверждена.
- В `pr_discussions_raw.json` все записи, помеченные открытыми, не содержат `threadId` и `rootCommentId`. Сформировать адресные ответы без этих идентификаторов невозможно; `outputs/review_replies.json` содержит пустой список.
- Файлы `ci_failures.md` и `ci_failures_full.log` отсутствуют во входных данных, поэтому отдельные результаты CI не предоставлены.
- Рабочее дерево уже содержало staged-изменения в тестах гостевой сессии, `guest-session.service.ts` и `BNP-519.spec.ts`. Они сохранены; в этом раунде в `BNP-519.spec.ts` исправлена только нестабильная дата тестовой фикстуры.

## Approach

- Исправил фикстуру `today` в тесте BNP-519: теперь она совпадает с датой, на которую тест замораживает системное время. До исправления полный прогон падал с ожидаемым номером заказа `1` вместо `19`; после изменения тест проходит.
- Не менял реализацию платежной интеграции: официальный контракт Оплати™ отсутствует, и его нельзя достоверно восстановить по имеющимся данным.
- CodeGraph недоступен; проверил потребителей `providerTransactionId` и `OPLATI` поиском `rg` по `apps` и `packages`. Проверка миграций показала только две добавленные миграции; существующие миграции не изменены.

## Files Modified

- `apps/api/src/onboarding/BNP-519.spec.ts` — фиксированная дата фикстуры для детерминированной проверки daily order number.
- `outputs/response.md` — результаты доработки и проверок.
- `outputs/review_replies.json` — пустой список, так как идентификаторы открытых тредов во входных данных отсутствуют.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; зафиксированы файлы PR и исходные staged-изменения.
- `npx jest --runInBand src/onboarding/BNP-519.spec.ts` — пройдено: 1 тест.
- `npx eslint apps/api/src/guest-session/BNP-433.spec.ts apps/api/src/guest-session/BNP-510.spec.ts apps/api/src/guest-session/BNP-511.spec.ts apps/api/src/guest-session/BNP-512.spec.ts apps/api/src/guest-session/BNP-513.spec.ts apps/api/src/guest-session/BNP-514.spec.ts apps/api/src/guest-session/guest-session.service.ts apps/api/src/onboarding/BNP-519.spec.ts` — пройдено.
- `npm run typecheck` — пройдено во всех четырёх workspace.
- `npm test` — пройдено после исправления: все тесты workspace, сборки и `test:design-tokens` завершились с кодом 0. В сборке admin-web осталось предупреждение о чанке более 500 КБ.
- `git diff --check` и `git diff --cached --check` — пройдены.
- Blast-radius: поиск `providerTransactionId` и `OPLATI` выполнен по `apps` и `packages`; миграции PR проверены и обе добавлены (`A`), существующие не изменены. Глобальные провайдеры и публичные сигнатуры в этом раунде не менялись.
