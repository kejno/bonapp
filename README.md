# Bonapp

## Локальная разработка

Скопируйте шаблон окружения для API:

```bash
cp apps/api/.env.example apps/api/.env
```

Запустите локальные PostgreSQL и Redis, примените миграции, затем запустите приложения:

```bash
docker compose up -d
npx prisma migrate dev --schema apps/api/prisma/schema.prisma
npm run dev
```

PostgreSQL доступен на `localhost:5432`, Redis — на `localhost:6379`. Данные сохраняются в named volumes `bonapp_pg_data` и `bonapp_redis_data`.

Локальный S3-совместимый MinIO запускается тем же Compose: API — `http://localhost:9000`, консоль — `http://localhost:9001` (логин/пароль `minioadmin`). Создайте в консоли bucket `bonapp`. Если эти порты заняты, запустите Compose, например, с `BONAPP_MINIO_API_PORT=9002 BONAPP_MINIO_CONSOLE_PORT=9003 docker compose up -d` и укажите `S3_ENDPOINT` и `S3_PUBLIC_ENDPOINT` как `http://localhost:9002` в `apps/api/.env`.
