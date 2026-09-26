## Root Cause Analysis
**Bug**: Сценарий BNP-362 получал HTTP 404 при создании заказа.
**Root cause**: `apps/api/src/orders/orders.controller.ts` регистрировал только GET-маршруты, поэтому `POST /api/v1/orders` и `POST /api/v1/orders/:id/pay` отсутствовали. PATCH статуса стола в `apps/api/src/halls/tables.controller.ts` существовал и проходил тест.
**Impact**: Заказ нельзя было создать или оплатить через заявленный API; автоматические переходы статуса стола не выполнялись.
**Fix approach**: Добавлены POST-маршруты создания и оплаты заказа. Операции выполняются транзакционно с проверкой tenant/table/order и обновлением состояния стола.
