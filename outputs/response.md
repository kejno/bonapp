### Root Cause
- В `OrdersController` отсутствовали маршруты создания и оплаты заказа, поэтому создание заказа возвращало 404.
- PATCH маршрута статуса стола уже работал; сбой сценария возникал на API заказов.

### Fix
- `orders.controller.ts`: добавлены `POST /orders` и `POST /orders/:id/pay`.
- `orders.service.ts`: создание и оплата реализованы транзакционно; стол переводится в `OCCUPIED`, затем в `AVAILABLE`.

### Test Coverage
- BNP-362 e2e: 2 теста пройдены.
- Юнит-тесты API: 507 тестов пройдены.
- TypeScript: проверка пройдена.
- Полный e2e: не завершён, окружение не содержит `DATABASE_URL`, Redis недоступен.

### Notes
- Полная e2e-проверка требует настроенных PostgreSQL и Redis.
