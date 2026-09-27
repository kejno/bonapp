### Root Cause
- `StaffPage` отправлял изменение сотрудника как `PATCH` с полем `fullName`, хотя API принимает `PUT` и `full_name`.
- Деактивация вызывала несуществующий `PATCH /staff/:id/deactivate`; API предоставляет `DELETE /staff/:id`.

### Fix
- `StaffPage.tsx`: привести методы и тело запроса к контракту `StaffController`.
- `BNP-470.test.tsx`, `BNP-408.test.tsx`: проверять реальные endpoint-ы и формат запроса.

### Test Coverage
- `BNP-470.test.tsx` — сначала воспроизводил сбой, после исправления PASSED.
- Полный набор `admin-web`: 63 файла, 124 теста PASSED.

### Notes
- Причина сбоя из Jira не содержала фактического шага; корень подтверждён сравнением UI-запросов с API-контроллером.
