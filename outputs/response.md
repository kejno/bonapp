# Результат доработки PR #192 — BNP-481

## Issues/Notes

- Устранён дефект маршрутизации: два контроллера обрабатывали `POST /api/v1/admin/shifts/open`, из-за чего запрос с `cashier_id` попадал в сценарий onboarding и смена открывалась для текущего пользователя. Теперь onboarding использует отдельный `POST /api/v1/admin/welcome/shifts/open`.
- Блокирующее требование BNP-481 по интеграции СКНО остаётся невыполненным. `ShiftService.open`/`close` не выполняют фискальные вызовы, а локальная запись `shiftReport` не является Z-отчётом.
- В доступном коде найдены только реквизиты `cashRegisterSerial` и `unp`; спецификация/SDK «Титан-Плюс», авторизация и контракты успешных/ошибочных ответов отсутствуют. Для реализации нужны согласованный протокол и тестовый стенд либо утверждённые примеры запросов и ответов.
- В `input/BNP-481` отсутствуют `pr_files.txt`, CI-логи, `ticket.md` и материалы родительской задачи. Файлов с CI-ошибками нет.

## Approach

- Воспроизведён сбой: до изменения `POST /admin/shifts/open` возвращал `cashierId`, отличный от переданного `cashier_id`, потому что совпадающий маршрут onboarding перехватывал запрос.
- Перенесён маршрут onboarding на `/admin/welcome/shifts/open`; клиент onboarding и его тест обновлены.
- В BNP-413 проверяется выбранный кассир, отчёт, сброс счётчика, отсутствие текущей смены через публичный API и номер следующего заказа. Проверка учитывает пустое HTTP-тело GET-запроса при отсутствии смены.
- Интеграцию СКНО не имитировал и не придумывал протокол; это не подтвердило бы фактическую фискальную операцию.

## Files Modified

- `apps/api/src/welcome/welcome.controller.ts` — отдельный маршрут onboarding для открытия смены.
- `apps/admin-web/src/welcome/welcome.api.ts` — обновлён адрес вызова onboarding.
- `apps/admin-web/src/pages/BNP-452.test.tsx` — проверяется новый маршрут onboarding.
- `apps/api/test/BNP-413.e2e-spec.ts` — проверяется открытие смены через корректный маршрут и отсутствие активной смены.
- `outputs/response.md` — этот отчёт.
- `outputs/review_replies.json` и `outputs/review_replies/thread_1.md` — адресный ответ на открытый блокирующий тред.

## Test Coverage

- `npx eslint apps/api/src/welcome/welcome.controller.ts apps/api/test/BNP-413.e2e-spec.ts apps/admin-web/src/welcome/welcome.api.ts apps/admin-web/src/pages/BNP-452.test.tsx apps/api/src/staff/staff.controller.ts` — пройден.
- `npm run typecheck` — пройден во всех четырёх workspace.
- `npm test` — пройден: API 69 наборов/583 теста, guest-web 10 наборов/32 теста, admin-web 63 набора/124 теста; сборки и проверка design tokens прошли.
- `npm run test:e2e -w apps/api -- --runInBand test/BNP-413.e2e-spec.ts` — пройден: 1 набор, 1 тест.
- Радиус влияния: изменён отдельный onboarding-маршрут и его клиент; штатный маршрут смен остался `POST /admin/shifts/open`. Обновлён и прогнан тест onboarding BNP-452, а также e2e BNP-413. Схема БД, миграции, глобальные провайдеры и публичные сигнатуры сервисов не затрагивались.
