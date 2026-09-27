## Issues/Notes

- Исправлено единственное открытое адресуемое замечание (thread `PRRT_kwDOUUbUMs6mdivC`): тест BNP-406 проверял применение цвета только в админке.
- В `input/BNP-406` не приложены CI failure-логи, поэтому состояние CI не подтверждено.
- Разрешён конфликт `outputs/response.md` и добавлен файл в индекс.

## Approach

- Добавлен отдельный тест гостевого приложения BNP-406: он открывает меню по QR-токену, загружает сохранённую конфигурацию заведения и проверяет значение `--color-primary`.
- Проверки BNP-405 и админской части BNP-406 оставлены без изменений.
- Для блокирующего inline-замечания подготовлен адресный ответ в `outputs/review_replies/`.

## Files Modified

- `apps/guest-web/src/BNP-406.test.tsx` — проверка загрузки конфигурации и применения цвета в гостевом PWA.
- `outputs/response.md` — сводка изменений и проверок; конфликтный файл разрешён.
- `outputs/review_replies.json`, `outputs/review_replies/thread_7.md` — ответ на открытый блокирующий тред.

## Test Coverage

- `npm run test -w apps/guest-web -- BNP-406` — 1 тест пройден.
- `npm run test -w apps/admin-web -- BNP-405 BNP-406` — 2 теста пройдены.
