Добавил исключение `**/e2e/**` в `apps/guest-web/vite.config.ts`, поэтому `npm test` больше не загружает Playwright spec. Полный `npm test` и отдельный `test:e2e` для `dish-card.spec.ts` прошли.
