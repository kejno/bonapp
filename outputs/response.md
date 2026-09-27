# Повторная доработка PR #160

## Issues/Notes

- Исправлена обработка dual-stack DNS-ответа: публичные IPv6-записи не блокируют POS-хост, если DNS возвращает безопасный публичный IPv4.
- Если среди IPv4-адресов есть частный или иной запрещённый адрес, хост отклоняется. Хост без публичного IPv4 также отклоняется.
- Разрешён конфликт схемы `Tenant`: сохранены поля POS и оплаты, а также поля ежедневной нумерации заказов из актуальной базовой ветки.
- В `input/BNP-136` нет файлов CI-отчётов и отдельного `ticket.md`; требования сверены с `request.md`. Все inline review-треды в исходном JSON закрыты, поэтому список ответов пуст.

## Approach

- Добавлены регрессионные тесты смешанных IPv4/IPv6 DNS-ответов и отказа при наличии запрещённого IPv4.
- DNS-валидация пропускает IPv6, проверяет каждый IPv4 и закрепляет соединение за первым безопасным адресом. Существующая allowlist и защита от перенаправлений сохранены.

## Files Modified

- `apps/api/src/onboarding/pos-network.ts` — выбор безопасного IPv4 из DNS-ответов.
- `apps/api/src/onboarding/pos-network.spec.ts` — проверки смешанных DNS-ответов и запрещённых IPv4.
- `apps/api/prisma/schema.prisma` — разрешён конфликт полей `Tenant` с сохранением полей POS, оплаты и ежедневной нумерации.
- `outputs/response.md` — результаты доработки и проверок.
- `outputs/review_replies.json` — пустой список, так как открытых inline-тредов нет.
- `outputs/review_replies/thread_1.md` — удалён устаревший ответ на закрытый тред.

## Test Coverage

- RED/GREEN: `npm test --workspace @bonapp/api -- --runInBand src/onboarding/pos-network.spec.ts` — регрессионный тест воспроизводил отказ для dual-stack до исправления; после исправления прошли 9 тестов.
- `npx eslint apps/api/src/onboarding/pos-network.ts apps/api/src/onboarding/pos-network.spec.ts` — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API 65 наборов / 560 тестов, admin-web 33 файла / 86 тестов, guest-web 8 файлов / 26 тестов; сборка и проверка design tokens также завершились с кодом 0.
- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены.
- Blast-radius для объединённой схемы проверен поиском потребителей `dailyOrderNumberDate` по `apps/*` и `packages/*`; Prisma generate и API typecheck/test подтвердили согласованность схемы. Существующие миграции не редактировались.
- `git diff --check` и `git diff --cached --check` — успешно; конфликтных маркеров не осталось.
