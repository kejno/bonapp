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
- Создания платежа в ЕРИП, вкладки «ЕРИП» и показа кода нет: `PayPage.tsx` и
  `OrderStatusPage.tsx` про оплату не знают.

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
- `POST /guest/orders/:id/pay/erip` (доступ по Table Session): создаёт
  `Payment(PENDING, ERIP_EPOS, provider='erip')`, вызывает bePaid, сохраняет
  `uid` в `providerTransactionId`, `erip.account_number` в `eripOrderNumber`,
  ответ целиком в `payload`; возвращает гостю код, инструкцию и QR.
  Повторный вызов для того же заказа возвращает существующий действующий
  запрос, а не создаёт новый.
- Вебхук: тот же публичный маршрут-приёмник и очередь BullMQ, что для карты
  (см. bepaid-checkout.md), с разбором по `payment_method_type = "erip"`.
- Воркер: идемпотентное обновление `Payment`; при `SUCCEEDED` завершает заказ
  существующим сценарием и шлёт событие гостю по WebSocket.
- `guest-web`: вкладка «ЕРИП» в `PayPage`: код услуги и номер заказа, QR,
  инструкция из 5 шагов, ожидание подтверждения. Без тяжёлых зависимостей
  (бюджет бандла <150 КБ): QR приходит готовым PNG в base64.
- Реквизиты: для Basic-авторизации нужен `shopId`, а в
  `paymentCredentials.erip` его нет (только `serviceId`, `secret`).
  Решить: расширить реквизиты `erip` полем `shopId` или переиспользовать
  `shopId` / `secret` из `bepaid`. `serviceId` вероятно соответствует
  `service_no`, это нужно подтвердить.

## Тесты

- Мок HTTP-сервера bePaid: успешное создание, ответ с ошибкой, недоступность,
  ответ без `erip.instruction`.
- Вебхуки: `successful`, `failed`, `expired`, повторная доставка
  (идемпотентность), неверная подпись, вебхук по чужому заказу.
- e2e API: создание запроса, вебхук, заказ завершён, событие в WebSocket.
- Компонентный тест вкладки: код, 5 шагов инструкции, QR.

## Открытые вопросы

- Что именно продукт называет «E-POS кодом» в тест-кейсе: вероятно
  `account_number` вместе с `service_no` (что гость вводит в ЕРИП). Уточнить.
- Текст «инструкции из 5 шагов»: bePaid отдаёт свой массив `instruction`
  (путь в дереве ЕРИП), пять шагов нужно утвердить как продуктовый текст.
- Когда создавать запрос: при выборе вкладки «ЕРИП» (рекомендуется, сумма уже
  известна вместе с чаевыми) или при оформлении заказа.
- Срок действия запроса (`expired_at`) и что делать по истечении.
- Связь с `provider: 'webpay'` в реквизитах: отдельный шлюз, вне документа.
- Нужна ли услуга ЕРИП в дереве (`ERIP tree integration`) или достаточно
  ввода кода.

## Источники

- [Создание запроса на оплату](https://docs.bepaid.by/en/payment_methods/apms/erip/create_payment/)
- [Вебхуки ЕРИП](https://docs.bepaid.by/en/payment_methods/apms/erip/webhooks/)
- [Приём платежей через ЕРИП](https://docs.bepaid.by/en/payment_methods/apms/erip/)
- [Вебхуки bePaid (общие)](https://docs.bepaid.by/en/using_api/webhooks/)
