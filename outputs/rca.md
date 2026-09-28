## Root Cause Analysis

**Bug:** связанный e2e-тест BNP-412 не мог проверить сброс PIN через API.

**Root cause:** `StaffTestFixture.adminRequest()` вызывал `.set('Authorization', ...)` на объекте, который возвращает `request(server)`. В supertest этот объект является фабрикой HTTP-запросов, а не отдельным запросом, поэтому тест завершался с `TypeError` до вызова endpoint. Реализация `StaffService.resetPin()` сохраняет bcrypt-хэш нового PIN.

**Impact:** проверка BNP-412 падала из-за ошибки тестовой обвязки и не подтверждала ни ответ endpoint, ни действительность нового PIN. По исходным данным фактический `Failed Reason` не был заполнен.

**Fix approach:** создавать supertest agent и настраивать на нём Bearer-аутентификацию. Усилить BNP-412: подготовить известный прежний PIN и проверить, что вход с новым PIN успешен, а со старым — отклонён.
