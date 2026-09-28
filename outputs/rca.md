## Root Cause Analysis

**Bug:** PATCH stop-list возвращает 400 для запроса с полем `is_in_stop_list`, указанным в сценарии BNP-364.

**Root cause:** `MenuAdminController.isValidStopListBody()` читает только `isInStopList`; snake_case поле из контракта тест-кейса не распознаётся. Из-за этого запрос отклоняется до обновления блюда, инвалидирования Redis и отправки WebSocket-события.

**Impact:** клиент, отправляющий описанный в BNP-364 payload, не может изменить стоп-лист через admin endpoint. Для camelCase payload сервис уже обновляет запись меню, удаляет tenant cache key и отправляет событие в hall/kitchen rooms.

**Fix approach:** принимать оба существующих стиля имени поля на границе admin API, нормализовать значение в boolean и проверить snake_case контракт сквозным тестом, включая состояние БД, кэш и событие.
