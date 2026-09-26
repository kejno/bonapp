### Что изменено
- Добавлен экран `/kds` с четырьмя колонками, фильтром по цехам, карточками заказов, drag-and-drop и Bump.
- Socket.io обновляет доску в реальном времени; Howler воспроизводит сигнал при новом заказе.
- API фильтрует позиции повара по назначенным цехам и переводит общий статус после обработки всех позиций.

### Ключевые решения
- Добавлено поле `kitchenDepartments` для назначений поваров; доступ к KDS ограничен ролями CHEF, OWNER и MANAGER на API и WebSocket.
- Повторно использован общий Socket.io gateway проекта.

### Как проверить
```bash
npm test --workspace apps/admin-web
npm test --workspace apps/api -- --runInBand
npm run typecheck --workspace apps/admin-web
npm run typecheck --workspace apps/api
```
