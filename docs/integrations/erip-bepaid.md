# ЕРИП через bePaid — оплата по E-POS коду

Рабочая спецификация для вкладки «ЕРИП» на экране счёта и оплаты
(`/order/:orderId/pay`, SCREEN_46). Собрана из публичной документации bePaid
(см. «Источники»). Общая часть с оплатой картой (проверка подписи вебхука,
очередь, обновление `Payment`) описана в
[bepaid-checkout.md](./bepaid-checkout.md) и здесь не дублируется. Секреты в
репозиторий и тикеты не кладём.

## Что уже есть в репо

- Реквизиты шлюза `erip` хранятся зашифрованными в
  `Tenant.paymentCredentials.erip`: `serviceId`, `secret`
  (`apps/api/src/tenant/payment-credentials.ts`, шаг 3 онбординга).
- Модель `Payment` уже содержит поле `eripOrderNumber` и enum
  `PaymentMethod.ERIP_EPOS`; статусы `PENDING`, `SUCCEEDED`, `FAILED`,
  `CANCELLED`, `REFUNDED`.
- **Модуль `apps/api/src/payments/` (BNP-158, PR #211) уже смёржен.** Это
  общий, а не bePaid-специфичный код:
  - `PaymentsController`: `POST /guest/orders/:orderId/pay/erip` и
    `.../pay/bepaid` (доступ по `GuestSessionGuard`);
  - `PaymentsService.initiate()`: находит заказ стола, возвращает уже
    существующий `PENDING`-платёж того же способа или отменяет прежний другого
    способа, создаёт `Payment`, вызывает шлюз, сохраняет `providerTransactionId`
    и `eripOrderNumber`;
  - `WebhooksController`: `POST /webhooks/erip` и `/webhooks/bepaid`, подпись
    HMAC-SHA256 по общему секрету из env (`ERIP_WEBHOOK_SECRET`), задача в
    очередь BullMQ, воркер `PaymentsService.process()` ставит платёж в
    `COMPLETED` / `FAILED`, ставит `order.isPaid` и шлёт событие гостю;
  - `PaymentGateway`: **выдуманный универсальный контракт**, а не API bePaid.
    URL и ключ берутся из env (`ERIP_API_URL`, `ERIP_API_KEY`), поля ответа
    угаданы (`eripOrderNumber ?? orderNumber`), тело вебхука ожидается в виде
    `{paymentId, tenantId, status: confirmed|success|failed|...}`. С реальным
    bePaid этот код работать не будет.
- Оплата картой (BNP-506) реализована отдельно и правильно:
  `POST /guest/orders/:id/pay/card`, `bepaid.client.ts`, `bepaid-webhook.ts`
  (RSA-подпись по публичному ключу магазина), реквизиты tenant. Маршруты
  `pay/bepaid` и `/webhooks/bepaid` из BNP-158 дублируют его и после этого
  не нужны.
- Статусы успеха в схеме два: `COMPLETED` (модуль BNP-158) и `SUCCEEDED`
  (карточный поток); `OrdersService` учитывает оба. Для ЕРИП использовать
  `SUCCEEDED`, как в карточном потоке, и не плодить третий вариант.
- Вкладки «ЕРИП» и показа кода на гостевом экране нет: `PayPage.tsx` умеет
  только оплату картой.

## Как работает ЕРИП через bePaid

Мерчант создаёт запрос на оплату через API bePaid. Гость оплачивает его в
ЕРИП: в банковском терминале, интернет-банке, мобильном банке или на кассе
банка, найдя услугу по дереву ЕРИП или по коду услуги. Когда ЕРИП сообщает об
оплате, bePaid меняет статус запроса и отправляет вебхук.

Нужно от мерчанта: аккаунт bePaid и **зарегистрированная услуга ЕРИП с
номером услуги (`service_no`)**. Регистрация в дереве ЕРИП необязательна, но
без неё гость не найдёт услугу по дереву, только по коду.

Статусы запроса: `pending`, `permanent`, `successful`, `failed` (запрос
остаётся действительным), `expired`, `deleted`, `auto_created`. Деньги по
`successful` зачисляются на следующий рабочий день; сам статус приходит сразу.

## API bePaid

### Создание запроса на оплату

`POST https://api.bepaid.by/beyag/payments`

- Авторизация: HTTP Basic, логин `shopId`, пароль `secret`.
- Заголовки: `Content-Type: application/json`, `Accept: application/json`.

Минимальное тело запроса:

```json
{
  "request": {
    "amount": 1250,
    "currency": "BYN",
    "description": "Заказ №42",
    "ip": "203.0.113.10",
    "tracking_id": "<Payment.id>",
    "notification_url": "https://<api>/webhooks/erip/<tenantId>",
    "expired_at": "2026-09-30T12:00:00+03:00",
    "payment_method": {
      "type": "erip",
      "account_number": "<номер заказа или счёта>",
      "service_no": 12345678,
      "service_info": ["Заказ №42", "Ресторан «...»"],
      "receipt": ["Спасибо за заказ"]
    }
  }
}
```

Обязательные поля: `amount` (в минимальных единицах, 12,50 BYN = `1250`),
`currency` (`BYN`), `description`, `ip` (IP покупателя),
`payment_method.type = "erip"`, `payment_method.account_number` (идентификатор
заказа или счёта, до 30 символов). `payment_method.service_no` (целое, 8
цифр) обязателен, если у магазина подключено несколько услуг ЕРИП.
Необязательные: `email`, `order_id` (12 цифр), `tracking_id`, `success_url`,
`expired_at`, `notification_url`, `customer.*`, `payment_method.instruction`,
`permanent`, `editable_amount`, `additional_data`.

Ответ (важные поля):

```json
{
  "transaction": {
    "status": "pending",
    "uid": "...", "id": "...",
    "amount": 1250, "currency": "BYN",
    "order_id": "...", "tracking_id": "<Payment.id>",
    "expired_at": "...", "payment_method_type": "erip",
    "erip": {
      "request_id": 123,
      "service_no": 12345678,
      "account_number": "...",
      "instruction": ["..."],
      "service_info": ["..."],
      "receipt": ["..."],
      "qr_code": "<base64 PNG>",
      "qr_code_raw": "<base64>",
      "banks": [{"name": "...", "icon": "<base64 SVG>", "platform_urls": {"ios": "...", "android": "..."}}]
    }
  }
}
```

Для показа гостю: `erip.instruction` (путь в дереве ЕРИП или инструкция),
`erip.account_number` и `erip.service_no` (что вводить в ЕРИП),
`erip.qr_code` (оплата из банковского приложения) и `erip.banks`
(ссылки на приложения банков).

### Прочие методы

- `GET https://api.bepaid.by/beyag/payments/:uid` — запрос по `uid`.
- `GET https://api.bepaid.by/beyag/payments/?order_id=:order_id` — по номеру.
- `DELETE https://api.bepaid.by/beyag/payments/:uid` — отмена запроса (только
  `pending` / `permanent`), нужна, если гость меняет способ оплаты.

### Вебхук

Тело содержит объект `transaction` (`status`, `message`, `uid`, `id`,
`order_id`, `tracking_id`, `amount`, `currency`, `paid_at`, `test`,
`payment_method_type`) и вложенный `erip` (`request_id`, `service_no`,
`account_number`, `transaction_id`, `service_info`, `instruction`, `receipt`,
`qr_code`). Проект соответствия статусов (уточнить при реализации):

| bePaid | `PaymentStatus` |
|---|---|
| `successful` | `SUCCEEDED` |
| `failed` | `PENDING` (запрос действителен, гость может заплатить снова) |
| `expired`, `deleted` | `CANCELLED` |
| `pending`, `permanent` | `PENDING` |

**Подпись.** На странице вебхуков ЕРИП сведений о подписи, повторах и
ожидаемом ответе нет. Общее описание вебхуков bePaid говорит о заголовке
`Content-Signature` (RSA, SHA-256, Base64, публичный ключ из личного кабинета,
проверка по сырому телу) и об ответе `200`. Считать это правилом по
умолчанию и **проверить на реальном тестовом вебхуке ЕРИП**, есть ли там
заголовок. Идемпотентность обязательна независимо от этого.

## Предлагаемая реализация

- `EripClient` за интерфейсом (создать запрос, получить, отменить),
  HTTP-клиент с Basic-авторизацией. Общая часть с `BepaidClient` (Basic,
  ошибки, таймауты) выносится в базовый слой, если получается без усложнения.
- **Не добавлять параллельный путь, а доработать существующий модуль
  `payments` (см. «Что уже есть в репо»).**
- Маршрут `POST /guest/orders/:orderId/pay/erip` уже существует. Оставить его
  и `PaymentsService.initiate()` (там уже есть повторное использование
  `PENDING`-платежа и отмена прежнего), но вместо универсального
  `PaymentGateway` для ЕРИП вызвать `EripClient` с реквизитами tenant.
  Сохранять `uid` в `providerTransactionId`, `erip.account_number` в
  `eripOrderNumber`, ответ целиком в `payload`; возвращать гостю код услуги,
  номер заказа, инструкцию и QR. Отмена прежнего запроса — `DELETE
  /beyag/payments/:uid`.
- Вебхук: заменить `POST /webhooks/erip` (общий секрет из env, выдуманный
  формат тела) на `POST /webhooks/erip/:tenantId`: реквизиты и правила
  проверки берутся у tenant, тело разбирается в настоящем формате bePaid
  (`transaction.tracking_id`, `transaction.status`), статус подтверждается
  `GET /beyag/payments/:uid`. Очередь BullMQ и `process()` остаются.
- Воркер: идемпотентное обновление `Payment` в `SUCCEEDED` / `FAILED`,
  завершение заказа существующим сценарием, событие гостю по WebSocket через
  уже имеющийся `emitPaymentStatusChanged`.
- Универсальный `PaymentGateway` после этого больше не нужен для ЕРИП;
  удаление дублирующих `pay/bepaid` и `/webhooks/bepaid` вынести отдельной
  небольшой задачей, если она не мешает.
- `guest-web`: вкладка «ЕРИП» в `PayPage`: код услуги и номер заказа, QR,
  инструкция из 5 шагов, ожидание подтверждения. Без тяжёлых зависимостей
  (бюджет бандла <150 КБ): QR приходит готовым PNG в base64.
- Реквизиты: для Basic-авторизации нужен `shopId`, а в
  `paymentCredentials.erip` его нет (только `serviceId`, `secret`).
  Решение: расширить реквизиты `erip` обязательным полем `shopId` (см.
  «Решения по открытым вопросам»); `serviceId` используется как `service_no`.

## Тесты

- Мок HTTP-сервера bePaid: успешное создание, ответ с ошибкой, недоступность,
  ответ без `erip.instruction`.
- Вебхуки: `successful`, `failed`, `expired`, повторная доставка
  (идемпотентность), неверная подпись, вебхук по чужому заказу.
- e2e API: создание запроса, вебхук, заказ завершён, событие в WebSocket.
- Компонентный тест вкладки: код, 5 шагов инструкции, QR.

## Решения по открытым вопросам

Приняты по ответам продукта в Story BNP-145 (сабтаски BNP-249…252) и, где
ответа нет, по умолчанию. Можно пересмотреть, но реализовывать по этому.

- **«E-POS код».** Гостю показываем два значения: «Код услуги»
  (`service_no`) и «Номер заказа» (`account_number`). `account_number` —
  наш числовой номер из 12 цифр, уникальный в рамках магазина; сохраняется в
  `Payment.eripOrderNumber` и уходит в bePaid как `account_number` и
  `order_id`. Формат проверить на тестовом магазине.
- **Инструкция из 5 шагов — утверждена владельцем 30.09.2026.** Текст
  использовать как есть, дополнительных согласований не требуется:
  1. Откройте ЕРИП: интернет-банк, мобильное приложение банка, терминал или
     касса банка.
  2. Выберите «Система «Расчёт» (ЕРИП)» и найдите услугу по коду услуги
     (или по пути из подсказки, если bePaid вернул `instruction`).
  3. Введите номер заказа.
  4. Проверьте название заведения и сумму и подтвердите платёж.
  5. Дождитесь подтверждения на этой странице: после оплаты заказ закроется
     автоматически.
- **Когда создавать запрос.** При выборе вкладки «ЕРИП» и по кнопке
  «Повторить», а не при оформлении заказа: к этому моменту известна сумма с
  чаевыми. Повторное открытие вкладки возвращает действующий запрос.
- **Срок (BNP-251).** `expired_at` = сейчас плюс 15 минут. Обратный отсчёт на
  вкладке ЕРИП не показываем. По истечении гость видит «Время оплаты
  истекло»; «Повторить» создаёт новый запрос, предыдущий в статусе `pending`
  отменяется через `DELETE /beyag/payments/:uid`. Заказ остаётся открытым.
- **Сумма.** Как в [bepaid-checkout.md](./bepaid-checkout.md): счёт плюс
  чаевые через `Decimal`, чаевые не выпускаются до подтверждения кассового
  провайдера (BNP-252).
- **Подлинность вебхука.** Пока не подтверждено, что вебхук ЕРИП несёт
  `Content-Signature`, вебхук считаем только сигналом: если заголовок есть,
  проверяем подпись; в любом случае перед переводом `Payment` в `SUCCEEDED`
  подтверждаем статус запросом `GET /beyag/payments/:uid` с нашими
  реквизитами. Так поддельный вебхук не сможет закрыть заказ.
- **Реквизиты.** `paymentCredentials.erip` расширяется обязательным полем
  `shopId` (нужен для Basic-авторизации) и остаётся отдельным от `bepaid`:
  ресторан может принимать ЕРИП без карт. `serviceId` трактуем как
  `service_no`: хранится строкой, при отправке приводится к числу. Жёсткую
  проверку «8 цифр» добавить после сверки с реальным аккаунтом.
- **Дерево ЕРИП.** Для MVP регистрация в дереве не требуется: гость находит
  услугу по коду. Если bePaid вернул `instruction`, показываем его.
- **Доступность вкладки (BNP-250).** «ЕРИП» показывается только если у
  ресторана подключён ЕРИП; признак отдаёт бэкенд.
- **Webpay.** `provider: 'webpay'` вне этой Story.

Остаётся проверить на живом тестовом магазине bePaid: формат `account_number`
и `order_id`, наличие `Content-Signature` в вебхуке ЕРИП, соответствие
`serviceId` и `service_no`.

## Источники

- [Создание запроса на оплату](https://docs.bepaid.by/en/payment_methods/apms/erip/create_payment/)
- [Вебхуки ЕРИП](https://docs.bepaid.by/en/payment_methods/apms/erip/webhooks/)
- [Приём платежей через ЕРИП](https://docs.bepaid.by/en/payment_methods/apms/erip/)
- [Вебхуки bePaid (общие)](https://docs.bepaid.by/en/using_api/webhooks/)
