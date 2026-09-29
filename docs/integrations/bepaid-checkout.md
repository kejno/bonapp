# bePaid Checkout — оплата картой и кошельками (Apple Pay / Google Pay)

Рабочая спецификация для карточной оплаты гостя на экране счёта
(`/order/:orderId/pay`, SCREEN_46). Собрана из публичной документации bePaid
(см. «Источники»). Тестовые ключи и секреты в репозиторий и тикеты не кладём:
их берёт разработчик в личном кабинете bePaid.

## Что уже есть в репо

- Реквизиты шлюза `bepaid` хранятся в зашифрованном виде в
  `Tenant.paymentCredentials.bepaid`: `provider` (`bepaid` | `webpay`),
  `shopId`, `secret`, `environment` (`TEST` | `PROD`).
  См. `apps/api/src/tenant/payment-credentials.ts`.
- Модель `Payment` (`orderId`, `amountByn`, `tipsAmountByn`, `provider`,
  `providerTransactionId`, `status`, `payload`), enum `PaymentMethod.BANK_CARD`,
  `PaymentStatus` (`PENDING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `REFUNDED`).
- `POST /orders/:id/pay` (`OrdersController.pay`) завершает заказ и закрывает
  сессию стола. Создания платежа у провайдера и приёма результата нет.
- `apps/guest-web/src/PayPage.tsx` только загружает заказ; вкладок оплаты,
  перехода на Checkout и Payment Request API нет.
- BullMQ уже используется в API. По CLAUDE.md платёжные вебхуки не
  обрабатываются синхронно в HTTP-обработчике, а идут через очередь.

## Поток оплаты картой

1. Гость на вкладке «Карта» жмёт «Оплатить картой».
2. `guest-web` вызывает API (предлагаемый маршрут
   `POST /guest/orders/:id/pay/card`, доступ по Table Session).
3. API создаёт `Payment` (`PENDING`, `provider='bepaid'`, `BANK_CARD`) и
   запрашивает у bePaid платёжный токен (ниже).
4. API возвращает гостю `redirect_url`; клиент открывает страницу Checkout
   bePaid (или встроенный виджет по токену).
5. bePaid шлёт вебхук на `notification_url`. Сервер проверяет подпись,
   ставит задачу в очередь, воркер обновляет `Payment` и завершает заказ.
6. Гость возвращается по `success_url` / `decline_url` / `fail_url` /
   `cancel_url` и видит итог. Итог показывать по данным сервера
   (WebSocket или опрос статуса), а не по параметрам возврата.

Платёж считается успешным только после вебхука. Ответ виджета или редирект
гостя — не подтверждение (в документации bePaid это сказано явно).

## API bePaid

### Создание платёжного токена

`POST https://checkout.bepaid.by/ctp/api/checkouts`

- Авторизация: HTTP Basic, логин `shopId`, пароль `secret`.
- Заголовки: `Content-Type: application/json`, `Accept: application/json`,
  `X-API-Version: 2`, тело в UTF-8.

Минимальное тело запроса:

```json
{
  "checkout": {
    "transaction_type": "payment",
    "test": true,
    "order": {
      "amount": 1250,
      "currency": "BYN",
      "description": "Заказ №42",
      "tracking_id": "<Payment.id>"
    },
    "settings": {
      "success_url": "https://<guest-web>/order/<orderId>/pay?result=success",
      "decline_url": "https://<guest-web>/order/<orderId>/pay?result=decline",
      "fail_url": "https://<guest-web>/order/<orderId>/pay?result=fail",
      "cancel_url": "https://<guest-web>/order/<orderId>/pay?result=cancel",
      "notification_url": "https://<api>/webhooks/bepaid/<tenantId>",
      "language": "ru"
    }
  }
}
```

- `order.amount` — целое число в минимальных единицах валюты: 12,50 BYN =
  `1250`. В `Payment.amountByn` копейки в `Decimal`, конвертировать без потери
  точности (сумма счёта плюс чаевые).
- `tracking_id` — наш уникальный идентификатор (`Payment.id`), по нему
  сопоставляем вебхук и платёж.
- `test` — `true`, когда `environment === 'TEST'`.
- `payment_method.types` / `excluded_types` / `excluded_brands` ограничивают
  способы оплаты (например, скрыть `apple_pay`, `google_pay`); по умолчанию
  доступно всё, что включено для магазина.
- Токен живёт 24 часа, срок задаётся `order.expired_at`.

Ответ:

```json
{"checkout": {"token": "3241e4...", "redirect_url": "https://checkout.bepaid.by/v2/checkout?token=3241e4..."}}
```

Ошибка валидации:

```json
{"errors": {"checkout": {"settings": {"fail_url": ["is in invalid format"]}}}, "message": "fail_url is in invalid format"}
```

### Статус по токену

`GET https://checkout.bepaid.by/ctp/api/checkouts/:payment_token` (токен в
пути, отдельная авторизация не нужна). Ответ содержит `checkout` со статусом
(`successful`, `failed`, `incomplete`, `expired`), `amount`, `currency`,
`tracking_id`, `finished`, `expired`, `test`, `gateway_response.payment.uid`
(идентификатор транзакции bePaid; сохранять в `providerTransactionId`).
Использовать как сверку, если вебхук не пришёл.

### Вебхук

- Приходит на `notification_url`; тело — как ответ по транзакции.
- Проверка подлинности: заголовок `Content-Signature` — RSA-подпись тела
  (SHA-256, значение в Base64). Проверять по **публичному ключу из личного
  кабинета bePaid** и по **сырому телу** запроса, без разбора и повторной
  сериализации JSON. Перед проверкой не парсить и не переформатировать тело
  (в NestJS нужен `rawBody`).
- Вебхук приходит с HTTP Basic (shopId / secret), это дополнительная проверка.
- Ответ `200` — успех. Иначе повторы с нарастающей паузой; для Checkout всего
  **2 повтора** (через 15 с и через 46 с — 2,5 мин). Значит, обработчик должен
  отвечать быстро: проверить подпись, положить задачу в очередь, вернуть `200`.
- Вебхук может прийти повторно: обработка идемпотентна (по `tracking_id` /
  `providerTransactionId`).

Проект соответствия статусов (уточнить при реализации):

| bePaid | `PaymentStatus` |
|---|---|
| `successful` | `SUCCEEDED` |
| `failed` | `FAILED` |
| `expired` | `CANCELLED` |
| `incomplete` | `PENDING` |

### Открытие страницы оплаты

- Простой вариант: редирект на `redirect_url` (размещённая страница bePaid).
- Встроенный виджет: `<script src="https://js.bepaid.by/widget/be_gateway.js">`,
  объект `BeGateway` с токеном, вызов `createWidget()`. Для WebView передавать
  `fromWebview: true`. Колбэк отдаёт статус (`successful`, `failed`,
  `pending`, `redirected`, `error`, `null` при закрытии), но подтверждением
  оплаты он не является.

Для гостевого PWA с бюджетом бандла <150 КБ предпочтителен редирект без
подключения скрипта виджета.

## Apple Pay и Google Pay

- Через страницу Checkout / виджет bePaid оба кошелька доступны без отдельного
  кода на нашей стороне, если они включены в личном кабинете магазина.
- Apple Pay: нужна регистрация мерчанта и проверка домена, только HTTPS,
  работает в Safari на iPhone, iPad, Apple Watch и новых Mac. Включается в
  личном кабинете bePaid.
- Google Pay у bePaid поддерживается четырьмя способами: виджет, собственный
  checkout, мобильное приложение, расшифрованный токен (только для PCI DSS).
- **Требование тикета BNP-489 — вызывать кошелёк через Payment Request API на
  нашем экране.** Это «собственный checkout». Страницы bePaid по нему
  (параметры `gateway` / `gatewayMerchantId`, приём платёжного токена) в этом
  документе **не разобраны** — читать перед реализацией. Рекомендация для
  MVP: кошельки через Checkout bePaid (там они появляются сами), а Payment
  Request API на своём экране вынести отдельной задачей, если продукт всё ещё
  этого хочет.

## Предлагаемая реализация

- `BepaidClient` — отдельный класс за интерфейсом (создание токена, статус по
  токену), HTTP-клиент с Basic-авторизацией. `OrdersService`/контроллеры от
  HTTP-деталей не зависят.
- `POST /guest/orders/:id/pay/card` — создаёт `Payment(PENDING)`, вызывает
  `BepaidClient`, сохраняет токен в `payload`, возвращает `{ redirectUrl }`.
- `POST /webhooks/bepaid/:tenantId` — публичный маршрут без JWT: проверка
  подписи по сырому телу, задача в BullMQ, `200`. `tenantId` в URL нужен,
  потому что реквизиты и ключ у каждого tenant свои.
- Воркер: идемпотентно обновляет `Payment`, при `SUCCEEDED` вызывает
  существующий сценарий завершения заказа и отправляет событие гостю по
  WebSocket.
- `guest-web`: вкладка «Карта» в `PayPage`, кнопка «Оплатить картой»,
  после возврата — ожидание статуса (WebSocket или опрос), экран
  «Спасибо! Приходите снова».
- Реквизиты: **публичный ключ для проверки подписи** сейчас не хранится
  (в `paymentCredentials.bepaid` есть только `shopId`, `secret`,
  `environment`). Добавить поле и его валидацию в
  `payment-credentials.ts` и форму шага 3 онбординга.

## Тесты

- Мок HTTP-сервера bePaid: успешное создание токена, ответ с `errors`,
  недоступность, ответ без `redirect_url`.
- Вебхуки: подписать тестовой RSA-парой, проверить `successful`, `failed`,
  повтор той же доставки (идемпотентность), неверную подпись (отказ),
  тело, изменённое после подписи.
- e2e API: создание оплаты, вебхук, заказ завершён, событие в WebSocket.
- Внешний доступ к боевому шлюзу в автотестах не нужен и не используется.

## Открытые вопросы

- Значение `provider: 'webpay'` в реквизитах — отдельный шлюз Webpay со своим
  API; в этот документ не входит.
- Нужен ли Payment Request API на собственном экране или достаточно
  кошельков внутри Checkout.
- Куда вести гостя после `cancel_url` / `decline_url` и можно ли повторить
  оплату по тому же `Payment`.
- Формула суммы: счёт плюс чаевые, округление до копеек.
- Публичный URL API для `notification_url` в окружениях dev/stage/prod.

## Источники

- [Создание платёжного токена](https://docs.bepaid.by/en/integration/widget/payment_token/)
- [Статус транзакции по токену](https://docs.bepaid.by/en/integration/widget/query/)
- [Виджет: интеграция по токену](https://docs.bepaid.by/en/integration/widget/setup_with_token/)
- [Вебхуки](https://docs.bepaid.by/en/using_api/webhooks/)
- [Apple Pay](https://docs.bepaid.by/en/payment_methods/apple_pay/)
- [Google Pay](https://docs.bepaid.by/en/payment_methods/google_pay/integration/)
