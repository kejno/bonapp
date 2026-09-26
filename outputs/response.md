### Что изменено
Добавлен PWA shell гостевого клиента: манифест, service worker с офлайн-страницей и маршрут `/t/:qr_token`. Сессия стола сохраняется в Zustand, цвет заведения применяется как CSS-переменная; добавлены splash-индикатор и русские сообщения об ошибках.

### Ключевые решения
- Использованы уже существующие API сессии и Prisma-модели стола с уникальным QR-токеном.
- Vitest ограничен unit-тестами в `src/`, чтобы Playwright-сценарии не запускались Vitest.

### Как проверить
- `npm test`
- `npm run build --workspace=@bonapp/guest-web`
- `npm run test:e2e --workspace=@bonapp/guest-web` (нужен установленный браузер Playwright)
