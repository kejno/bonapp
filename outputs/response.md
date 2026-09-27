# Исправления PR #151

## Issues/Notes

- Реализованы экран `/order/checkout`, создание гостевого заказа и переход на экран статуса. Корзина хранится в Zustand с сохранением в `localStorage`, поэтому возврат в меню сохраняет блюда, количества, выбранные модификаторы и комментарий.
- API сверяет `qrToken` в теле с заголовком `X-QR-Token`, проверяет непустую корзину, доступность блюд, диапазоны количеств, обязательность/допустимость модификаторов и длину комментария. Цены рассчитываются сервером по текущему меню.
- Ежедневный номер синхронизирован между гостевым и штатным созданием заказов: транзакция использует блокировку tenant, часовой пояс tenant и сброс номера при смене локальной даты. Открытие/закрытие смены больше не сбрасывает счётчик в середине дня; миграции сохраняют текущую дату для уже накопленных номеров.
- В `input/BNP-143/` нет `ci_failures.md`, `ci_failures_full.log`, `ticket.md`, `pr_files.txt` и отдельных файлов спецификаций; требования сверены с `request.md`, комментариями и обсуждениями PR. `instruction.md` в корне репозитория отсутствует; прочитаны корневой `CLAUDE.md` и инструкции PR rework из `.dmtools/agents/instructions/pr_rework/`.
- В `pr_discussions_raw.json` есть две открытые inline-темы с `threadId`; третья запись — сводный комментарий без идентификаторов треда. Подготовлены ответы для обеих открытых тем.

## Approach

- Сначала добавил проверку поля `qrToken` в JSON тела запроса; она падала до исправления и прошла после него.
- Добавил checkout и UI управления корзиной, выбор модификаторов, серверный расчёт суммы и публикацию `order:created` в кухонную комнату после фиксации транзакции.
- Перенёс общий расчёт ежедневного номера в `apps/api/src/orders/daily-order-number.ts` и применил его к гостевому и штатному созданию заказов. Проверил все вызовы `order.create` и использования `dailyOrderNumber` через `rg`; обе точки создания используют транзакционную блокировку tenant. Убрал сброс счётчика при открытии/закрытии смены, чтобы номера оставались уникальными в течение дня. CodeGraph недоступен.
- Разрешил конфликт `App.tsx`, объединив гостевую сессию из PR с маршрутом статуса, настройками заведения и Socket.IO из `main`. Конфликт отчёта заменён актуальной сводкой.
- Добавлена новая миграция для даты счётчика; существующие миграции не менялись. Миграция `20260927000000` новее миграций, уже присутствующих в ветке.

## Files Modified

- `apps/guest-web/src/App.tsx`, `apps/guest-web/src/CheckoutPage.tsx`, `apps/guest-web/src/orders/cart.store.ts` — маршрут оформления, добавление блюд/модификаторов и сохранение корзины.
- `apps/guest-web/src/guest-session.ts` и `apps/guest-web/src/guest-session.test.ts` — QR-токен в теле POST и регрессионная проверка контракта.
- `apps/guest-web/src/orders/cart.store.test.ts` — сохранность корзины, комментария, модификаторов и изменение количества.
- `apps/api/src/guest-session/guest-orders.controller.ts`, `apps/api/src/guest-session/guest-session.module.ts`, `apps/api/src/guest-session/guest-session.service.ts`, `apps/api/test/guest-orders.e2e-spec.ts` — API создания заказа, проверки корзины, серверное ценообразование и e2e через PostgreSQL/Socket.IO.
- `apps/api/src/orders/daily-order-number.ts`, `apps/api/src/orders/daily-order-number.spec.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/staff/shift.service.ts` — номера tenant за локальный день без сброса при смене.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260927000000_daily_order_number_date/migration.sql`, `apps/api/prisma/migrations/20260927000001_backfill_daily_order_number_date/migration.sql` — дата сброса и сохранение текущего номера после обновления.
- `outputs/response.md`, `outputs/review_replies.json`, `outputs/review_replies/thread_1.md`, `outputs/review_replies/thread_2.md` — сводка и ответы в тредах.

## Test Coverage

- `npx eslint` для всех файлов, изменённых в этом раунде, — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API 60 наборов/538 тестов, admin-web 29 файлов/80 тестов, guest-web 5 файлов/15 тестов; production build и проверка design tokens также прошли.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` — успешно применены миграции к пустой локальной PostgreSQL базе.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp npm run test:e2e --workspace @bonapp/api -- --runInBand test/guest-orders.e2e-spec.ts` — успешно: 5 интеграционных сценариев; проверены две позиции заказа, серверная цена модификатора, номер следующего заказа, событие в комнате кухни, пустая корзина, обязательный модификатор, неактивная группа/вариант модификатора, стоп-лист и лимит комментария в 255 символов.
- `git diff --check` — успешно. Проверены все вызовы `order.create`, чтения/обновления `dailyOrderNumber` и операции смен через `rg`; обе точки создания используют общий транзакционный счётчик. CodeGraph недоступен.
- Новые миграции `20260927000000` и `20260927000001` идут после последней миграции базы `20260926180001`; существующие миграции не изменялись.
