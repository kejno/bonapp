# Доработка PR #208 — BNP-169

## Issues/Notes

- Исправлена открытая блокирующая проблема авторизации iiko Cloud. [iiko объявил о полном отключении старой схемы авторизации 29 августа 2026 года](https://iiko.ru/news/perehod-na-novuyu-shemu-avtorizaczii-v-api/).
- Реквизиты iiko хранятся в `pos_credentials` в зашифрованном виде AES-GCM через существующий механизм проекта. Для этого используется настроенный в проекте `PAYMENT_CREDENTIALS_SECRET`.
- В `pr_discussions_raw.json` только один открытый inline thread с `threadId` и `rootCommentId`; для него создан адресный ответ. Сводные комментарии без идентификаторов thread не являются адресуемыми review threads.

## Approach

- Перед отправкой заказа запрашивается токен через `POST /api/v2/access_token` с `apiKey`, `appId` и `clientSecret`. Выданный `token` передаётся как Bearer при вызове `POST /api/1/order/create`; далее сохраняется возвращённый `orderInfo.id`.
- Добавлены поля реквизитов iiko в форму подключения. API проверяет их наличие и сохраняет данные тенанта в зашифрованном JSON-поле. Импорт меню и проверка подключения для iiko также получают токен перед запросом.
- Регрессионные тесты проверяют порядок обмена: авторизация → отправка заказа с выданным токеном, а также отсутствие отправки заказа, если токен не выдан.

## Files Modified

- `apps/api/src/onboarding/pos-network.ts`
- `apps/api/src/onboarding/pos-auth.spec.ts`
- `apps/api/src/onboarding/pos-order-queue.service.ts`
- `apps/api/src/onboarding/pos-order-recovery.ts`
- `apps/api/src/onboarding/onboarding.service.ts`
- `apps/api/src/onboarding/onboarding.controller.ts`
- `apps/api/src/tenant/payment-credentials.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260929120000_add_iiko_app_credentials/migration.sql`
- `apps/admin-web/src/onboarding/OnboardingStep2Page.tsx`
- `apps/admin-web/src/onboarding/onboarding.api.ts`
- `apps/admin-web/src/onboarding/pos-validation.ts`
- `apps/admin-web/src/onboarding/pos-validation.test.ts`
- `apps/admin-web/src/onboarding/BNP-466.test.tsx`
- `apps/admin-web/src/onboarding/BNP-467.test.tsx`

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; проверен список файлов PR и незакоммиченные файлы этой доработки.
- `npx eslint <изменённые TypeScript-файлы>` — пройден.
- `npm run typecheck` — пройден для всех четырёх workspace.
- `npm test` — пройден: API 74 набора / 592 теста, admin-web 63 файла / 124 теста, guest-web 10 файлов / 32 теста; также прошли сборка и проверка design tokens.
- Blast-radius схемы проверен поиском всех обращений к `posApiKey` и `posCredentials` в `apps/api/src`, `apps/api/test` и `apps/admin-web/src`; учтены импорт меню, отправка заказа и восстановление очереди. Новая миграция добавлена отдельно с timestamp `20260929120000`, позже последней миграции базовой ветки `20260927020000`; существующие миграции не изменялись.
- Проверка RED подтвердила, что тест авторизации падал до реализации. Новые ожидания используют независимый литеральный payload и тестовую замену только внешнего POS HTTP-клиента.
