### Что изменено
Добавлен коннектор iiko Cloud: фоновая синхронизация меню, upsert блюд и категорий, polling статуса и повторные попытки при сбоях.

### Ключевые решения
- Учётные данные хранятся в отдельной tenant-scoped таблице; пароль расшифровывается AES-256-GCM из `POS_CREDENTIALS_KEY`.
- Для синхронизации используется BullMQ; отсутствующие в успешном ответе блюда деактивируются, ручные блюда не затрагиваются.
- Добавлены `POST /api/v1/admin/pos/sync-menu` и `GET /api/v1/admin/pos/sync-status`.

### Как проверить
```bash
npm test --workspace=@bonapp/api -- --runInBand
npm run typecheck --workspace=@bonapp/api
npx eslint apps/api/src/integrations/iiko/iiko.module.ts apps/api/src/integrations/iiko/iiko.controller.ts apps/api/src/integrations/iiko/iiko.service.ts apps/api/src/app.module.ts apps/api/src/prisma/prisma.service.ts apps/api/src/prisma/prisma.service.spec.ts
```
