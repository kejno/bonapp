### What changed
- После успешной проверки QR клиент создаёт UUID гостевой сессии, сохраняет его в `localStorage` и повторно использует при отправке заказа.
- Добавлен клиентский helper для `POST /guest/orders`; он передаёт `guestSessionId` и QR-токен.

### Key decisions
- Ключ хранилища — `guest_session_id`; UUID генерируется через `crypto.randomUUID()` только после разрешения QR.
- Серверный маршрут и экран checkout в текущем репозитории отсутствуют, поэтому этот helper пока не подключён к пользовательскому действию создания заказа.

### How to verify
- `npm test` (apps/guest-web)
- `npm run lint` (apps/guest-web)
- `npm run typecheck` (apps/guest-web)
