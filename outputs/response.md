### Что изменено
- Добавлен защищённый экран `/onboarding/step-4`: создание зон и пакетное добавление столов, предпросмотр QR и скачивание PDF для созданных в сеансе столов.
- PDF содержит односторонний тейбл-тент на странице A4 и QR с URL гостевого меню и токеном.

### Ключевые решения
- В PDF передаются ID столов текущего сеанса; для больших файлов клиент опрашивает состояние асинхронной генерации.
- Bulk-операция API уже обеспечивает уникальные номера столов и QR-токены.

### Как проверить
- `npm test --workspace=@bonapp/admin-web -- --run`
- `npm test --workspace=@bonapp/api -- --runInBand`
- `npm run lint --workspace=@bonapp/admin-web` и `npm run lint --workspace=@bonapp/api`
- `npm run typecheck --workspace=@bonapp/admin-web` и `npm run typecheck --workspace=@bonapp/api`
