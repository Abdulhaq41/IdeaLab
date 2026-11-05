# Проверка Telegram Stars

## Официальные источники

- https://core.telegram.org/bots/payments-stars
- https://core.telegram.org/bots/api#createinvoicelink
- https://core.telegram.org/bots/api#answerprecheckoutquery
- https://core.telegram.org/bots/api#refundstarpayment
- https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
- https://core.telegram.org/bots/webapps#testing-mini-apps

На момент локальной работы 3 ноября 2026 доступ к сайту документации блокировался политикой сети (403). Доступный текущий официальный исходный код Bot API `https://github.com/tdlib/telegram-bot-api/blob/master/telegram-bot-api/Client.cpp` был прочитан: наличие createInvoiceLink, refundStarPayment, XTR, pre_checkout_query и successful_payment сверено. Это не заменяет обязательную сверку актуальной документации и реальный test environment перед включением публичных продаж. Версия grammY зафиксирована в lockfile.

## Разделение сред

Браузерное DEMO_MODE=true: SQLite, подпись сессии, имитация счёта с явным предупреждением. Endpoint demo-pay существует только в этом режиме и никогда не выдаёт production-покупку. Сочетание production и DEMO_MODE=true запрещено при старте.

Telegram test environment: отдельный тестовый аккаунт и бот, отдельные секреты/БД/PUBLIC_URL, NODE_ENV=development, DEMO_MODE=false, TELEGRAM_TEST=true. Запросы API идут на `/bot<TOKEN>/test/<method>`, grammY использует test environment. Настрой домен, webhook и открывай Mini App именно в тестовой среде Telegram. Не используй браузерное demo как доказательство успешной проверки Stars.

Production: отдельный настоящий бот, TELEGRAM_TEST=false, NODE_ENV=production, DEMO_MODE=false. Платёжные provider_token не нужны для цифровых товаров в XTR. Plus продаётся разово, `subscription_period` не отправляется.

## Обязательный прогон на тестовом боте

1. Заверши обучение. До этого сервер не создаёт заказ, магазин не предлагает оплату.
2. Открой каждый товар, проверь состав/Stars, примерь набор. Примерка не изменяет skin в серверном снимке.
3. Создай invoice. Сравни Order.amount с одним prices.amount. Попытки передать свою цену в тело запроса не должны влиять на счёт.
4. Отмени окно и закрой приложение. Открой профиль: pending-заказ сохранён, кнопка «Продолжить» открывает тот же счёт.
5. Оплати. Убедись, что Product не выдан до successful_payment, а после него есть Payment с уникальным telegram_payment_charge_id, Order.status=paid и Entitlement.source=orderId.
6. В изолированном тестовом стенде повторно доставь захваченный update с тем же charge ID через защищённый webhook. Право/декор не дублируются. Не записывай в общедоступные логи заголовки или initData.
7. Проверь параллельное создание одного постоянного набора. Должен быть один pending-заказ; повторно купить уже принадлежащий набор нельзя.
8. Купи Plus дважды: второй срок идёт от max(now, текущий конец). Отзови только первый платёж через кабинет с причиной; второе право и его 30 дней должны сохраниться.
9. Сделай refundStarPayment. Проверь реальный возврат Stars, audit и status=refunded. Повтори: не должно быть повторной выдачи или отзыва другого источника. Прерви связь после внешнего refund и проверь ручное завершение pending-сверки. Любой неизвестный ответ Telegram требует расследования, не выдачи успеха.
10. Проверь неверный secret_token webhook, чужой Telegram ID в авторизации, изменённую сумму/валюту/payload, просроченную подпись initData: отказ.
11. Проверь /support /paysupport /terms. Отправь обращение и ответь из кабинета. Контакт должен принадлежать оператору игры.
12. Убедись, что уведомление о смене не приходит без согласия и не дублируется после перезапуска.

Локальные тесты автоматизируют правила, повторные доставки на уровне сервиса и транзакции PostgreSQL. Реальная выдача Telegram Stars, webhook от Telegram и возврат через внешний API здесь не проверялись: нет настоящих настроенных ключей/HTTPS test environment. Не объявляй оплату production-готовой до выполнения этого списка.
