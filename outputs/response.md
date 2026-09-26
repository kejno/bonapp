# Исправления PR #150

## Issues/Notes

- `PATCH /orders/:id/status` отклоняет `PAID`; фиксация оплаты остаётся в `pay()`, который обновляет платёжные данные и освобождает стол.
- Клиент сначала подтверждает вступление в комнату, затем повторно загружает снимок. `updatedAt` и проверка версии в Zustand защищают от перезаписи более нового события запоздавшим снимком.
- «Добавить ещё» сохраняет `orderId`; меню позволяет добавить позицию к соответствующему активному заказу через QR-защищённый endpoint с проверкой стола и транзакционным обновлением суммы.
- В `input/BNP-144/` отсутствуют `ci_failures.md`, `ci_failures_full.log`, `merge_conflicts.md` и `pr_files.txt`; CI и конфликты по подготовленным материалам подтвердить нельзя.

## Approach

- Проверены три открытых review-треда и соответствующие исправления с регрессионными тестами.
- Изменения уже присутствовали в checkout на коммите `92b2513`; рабочее дерево исходного кода было чистым. Подготовлены отдельные ответы для каждого открытого треда.
- Blast-radius: проверены вызовы `emitOrderStatusChanged` в API; схема БД и миграции в этой правке не менялись.

## Files Modified

- `apps/api/src/orders/orders.controller.ts` и `.spec.ts` — запрет обхода оплаты через общий endpoint статуса.
- `apps/api/src/menu/menu.gateway.ts` и `.spec.ts` — acknowledgement вступления в комнату и временная метка события.
- `apps/api/src/guest-session/guest-session.service.ts`, `.spec.ts` и `guest-orders.controller.ts` — снимок заказа и добавление позиции.
- `apps/guest-web/src/OrderStatusPage.tsx`, `OrderStatusPage.test.tsx`, `orders/orders.store.ts`, `orders/orders.store.test.ts`, `App.tsx` и `App.test.tsx` — синхронизация статуса и дозаказ.
- `outputs/review_replies.json` и `outputs/review_replies/thread_{1,2,3}.md` — ответы на три открытых треда.

## Test Coverage

- `git diff --diff-filter=ACM --name-only origin/main...HEAD` и `git status --short` — выполнены; локальное дерево чистое.
- `npx eslint` для всех 15 изменённых TypeScript-файлов — успешно.
- `npm run typecheck` — успешно во всех четырёх workspace.
- `npm test` — успешно: API 59 наборов / 535 тестов, admin-web 29 файлов / 80 тестов, guest-web 3 файла / 10 тестов; также выполнены сборки и проверка design tokens.
- `node scripts/verify-design-tokens.mjs` и `git diff --check` — успешно.
