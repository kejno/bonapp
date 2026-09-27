Добавил исключение `**/e2e/**` в `apps/guest-web/vite.config.ts`, поэтому Vitest не загружает Playwright spec. Проверки `npm test` и отдельный Playwright-сценарий `dish-card.spec.ts` прошли.
