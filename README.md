# Bonapp

## Локальная разработка

Скопируйте шаблоны окружения для API и обоих клиентов:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/guest-web/.env.example apps/guest-web/.env
cp apps/admin-web/.env.example apps/admin-web/.env
```

Запустите локальные PostgreSQL и Redis, примените миграции и заполните базу тестовыми данными:

```bash
docker compose up -d
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx prisma db seed --schema apps/api/prisma/schema.prisma
```

Запустите приложения:

```bash
npm run dev
```

Гостевой клиент доступен на `http://localhost:5173`, панель ресторатора — на `http://localhost:5174`, API — на `http://localhost:3000`. Откройте `http://localhost:5173/` и выберите тестовый стол либо перейдите по адресу `http://localhost:5173/t/dev-table-1` (также доступны `dev-table-2` и `dev-table-3`). Войти в панель можно с `admin@lebistro.by`, пароль для локальной разработки — `local-dev-password` (значение `SEED_OWNER_PASSWORD` в `apps/api/.env`).

Повторный запуск `prisma db seed` безопасен: записи тестового заведения обновляются по фиксированным идентификаторам и токенам.

PostgreSQL доступен на `localhost:5432`, Redis — на `localhost:6379`. Данные сохраняются в named volumes `bonapp_pg_data` и `bonapp_redis_data`.

### Обновление существующей локальной БД

Миграция `20260916000000_init` добавлена в историю после уже опубликованной
`20260917000000_add_tenant_logo_url`. На чистой БД ничего дополнительно делать
не нужно: команды выше применят миграции в правильном порядке.

Если в существующей БД уже применена `20260917000000_add_tenant_logo_url`, не
запускайте `migrate dev` или `migrate deploy`, пока не выполните ребейзлайнинг.
Сначала создайте резервную копию и убедитесь, что в БД уже есть таблицы `Tenant`
и `User`, колонка `Tenant.logoUrl`, а в `_prisma_migrations` есть запись о
`20260917000000_add_tenant_logo_url`:

```bash
docker compose exec postgres psql -U postgres -d bonapp -c "SELECT to_regclass('\"Tenant\"'), to_regclass('\"User\"');"
docker compose exec postgres psql -U postgres -d bonapp -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'Tenant' AND column_name = 'logoUrl';"
docker compose exec postgres psql -U postgres -d bonapp -c "SELECT migration_name FROM \"_prisma_migrations\" WHERE migration_name = '20260917000000_add_tenant_logo_url';"
```

Если все три проверки вернули ожидаемые значения, отметьте начальную миграцию
как уже применённую и только после этого продолжайте обычное обновление:

```bash
npx prisma migrate resolve --applied 20260916000000_init --schema apps/api/prisma/schema.prisma
npx prisma migrate dev --schema apps/api/prisma/schema.prisma
```

Не выполняйте `migrate resolve` на БД без этой схемы: для неё требуется обычная
последовательность миграций из раздела выше.

Локальный S3-совместимый MinIO запускается тем же Compose: API — `http://localhost:9000`, консоль — `http://localhost:9001` (логин/пароль `minioadmin`). Создайте в консоли bucket `bonapp`. Если эти порты заняты, запустите Compose, например, с `BONAPP_MINIO_API_PORT=9002 BONAPP_MINIO_CONSOLE_PORT=9003 docker compose up -d` и укажите `S3_ENDPOINT` и `S3_PUBLIC_ENDPOINT` как `http://localhost:9002` в `apps/api/.env`.
