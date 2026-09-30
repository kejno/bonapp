### What changed
- Удалён неиспользуемый модуль `apps/api/src/payments/` со старым универсальным шлюзом, дублирующим `pay/bepaid` и вебхуком.
- Удалены настройки устаревших API-адаптеров из `.env.example`.

### Key decisions
- Сохранены действующие потоки оплаты картой и ЕРИП в `guest-session`, включая настоящий webhook bePaid.
- Ошибка Checkout и возврат redirect URL покрыты тестами карточного потока BNP-513 и BNP-433.
- Удалены устаревшие тесты мёртвого модуля и его e2e-тест обработки webhook.

### How to verify
- `npm test --workspace apps/api -- --runInBand` — 94 suites, 638 тестов пройдены.
- `npm run typecheck --workspace apps/api` — успешно.
