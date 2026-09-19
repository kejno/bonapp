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
