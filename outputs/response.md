# Результат доработки PR #210 — BNP-157

## Issues/Notes

- **BLOCKING остаётся:** в предоставленных материалах нет официальной спецификации Оплати™. Текущие форматы API и webhook нельзя подтвердить или безопасно заменить предположениями. Для завершения интеграции нужны endpoint, схемы запроса/ответа, правила webhook и sandbox-реквизиты от владельца интеграции.
- Адресное замечание по очередям устранено: тест проверяет конфигурацию обоих producer-ов и worker-ов, а не только значения констант.
- `ci_failures.md`, `ci_failures_full.log` и `merge_conflicts.md` в `input/BNP-157/` отсутствуют.

## Approach

- Создаю оба потока обработки в тесте и проверяю, что producer и worker каждого потока используют согласованное имя очереди, а имена двух потоков различаются.
- CodeGraph недоступен. Радиус влияния проверен поиском `rg` по использованиям очередей в `apps/api/src/payments`.

## Files Modified

- `apps/api/src/payments/payment-queue.spec.ts` — проверка фактической настройки producer-ов и worker-ов.
- `outputs/response.md` — сводка доработки.
- `outputs/review_replies.json` и `outputs/review_replies/BNP-157-queue-wiring.md` — адресный ответ на открытый inline-тред.

## Test Coverage

- `npx jest --runInBand src/payments/payment-queue.spec.ts` из `apps/api` — пройдено: 1 тест.
- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; изменения этой доработки ограничены тестом очередей и отчётными файлами.
- `npx eslint apps/api/src/payments/payment-queue.spec.ts` — пройдено.
- `npm run typecheck` — пройдено во всех четырёх workspace.
- `npm test` — пройдено: API — 83 набора / 624 теста; guest-web — 10 файлов / 33 теста; admin-web — 63 файла / 124 теста. Сборки workspace и проверка design tokens также прошли.
- `git diff --check` — пройдено.
- Проверка радиуса влияния: `rg` проверил места создания producer-ов и worker-ов обоих потоков в `apps/api/src/payments`; схема БД, публичные сигнатуры и глобальные провайдеры этой доработкой не менялись.
