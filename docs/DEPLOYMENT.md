# Развёртывание

## Windows: локальная игра

1. Установи Node.js 24 LTS с официального сайта и Git. Перезапусти PowerShell.
2. Открой каталог проекта. Выполни `npm ci`, `npm run db:generate`, `npm run dev`.
3. Открой локальный порт 3000. Без BOT_TOKEN включается помеченное демо, SQLite работает встроенным модулем Node 24. Python, Visual Studio Build Tools и PostgreSQL для демо не нужны.
4. Для проверки: `npm test`, `npm run test:economy`, `npm run build`. Для браузерных тестов: `npm run browser:install`, затем `npm run test:visual` при работающем сервере. CHROMIUM_PATH можно не задавать, если установлен Chromium Playwright.
5. Останови сервер Ctrl+C. При следующем запуске прогресс и локальная сессия сохраняются. Не удаляй `.data`.

Для production на Windows удобен Docker Desktop с Linux containers/WSL2. Сам Telegram требует публичный HTTPS-домен, локальный порт не заменяет развёртывание.

## PostgreSQL и миграция

1. Скопируй `.env.example` в `.env` локально. Задай надёжный POSTGRES_PASSWORD и соответствующий DATABASE_URL. В Compose имя сервера БД — `db`, не localhost. URL-кодируй специальные символы пароля в DATABASE_URL.
2. Для production: `NODE_ENV=production`, `DEMO_MODE=false`, BOT*TOKEN, постоянный SESSION_SECRET длиной ≥32, WEBHOOK_SECRET длиной ≥32 (латиница, цифры, `*`, `-`), PUBLIC_URL с HTTPS и настоящий SUPPORT_URL. ADMIN_TELEGRAM_IDS — разделённые запятыми числовые ID.
3. `docker compose up -d --build`. Порт приложения привязан к 127.0.0.1:3000. PostgreSQL не публикуется наружу. Изменение данных без авторизации запрещено.
4. При старте app выполняет `npm run db:apply`: транзакционно применяет проверенную начальную SQL-миграцию, записывает её ID и не повторяет создание таблиц. Каталог сотрудников и продуктов заполняется при старте через Prisma. Для обновлений добавляй новую миграцию и регистрацию в скрипте перед релизом; не редактируй уже применённую миграцию.
5. `npm run db:generate` использует Prisma JS client engine и npm-пакеты с проверкой целостности, не требует нативных движков. CLI Prisma 7 делает лишнюю попытку их загрузки; wrapper задаёт защитные селекторы неиспользуемых native engine. Если они вдруг будут вызваны, guard завершится ошибкой. `--no-engine` не применяется: он несовместим с pg adapter. Для стандартных нативных команд Prisma есть `npm run db:generate:native`; им нужен доступ к binaries.prisma.sh.

Не указывай production-БД в TEST_DATABASE_URL. Тесты создают записи и платежи с отдельными ID, но это всё равно запись в БД.

## HTTPS

Настрой reverse proxy Caddy или nginx с действительным TLS-сертификатом для своего домена. Направляй HTTPS-запросы на 127.0.0.1:3000, сохраняя Host, X-Forwarded-Proto и корректный X-Forwarded-For. Сервис рассчитан на один доверенный reverse proxy; не публикуй порт Node напрямую. Пример Caddyfile:

```caddy
YOUR_REAL_DOMAIN {
    reverse_proxy 127.0.0.1:3000
}
```

PUBLIC_URL должен в точности соответствовать публичному origin. Сервер требует этот Origin для мутаций браузера. Webhook проверяется отдельно заголовком Telegram secret token. Не добавляй permissive CORS.

Для сборки внутри управляемой среды с корпоративным CA передай публичный сертификат через BuildKit secret: `docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t idealab .`. Не отключай TLS и checksum-проверки. Контейнеру, обращающемуся к Telegram через такой прокси, также нужны унаследованные настройки прокси и read-only CA. Для Node 24 можно задать NODE_USE_ENV_PROXY=1 и NODE_EXTRA_CA_CERTS к смонтированному публичному сертификату. Не включай сертификат сеанса в слой образа.

## BotFather и Mini App

1. Создай собственного бота в @BotFather. BOT_TOKEN внеси в секреты развёртывания, не в код, лог или чат.
2. Создай Main Mini App, укажи PUBLIC_URL. Установи кнопку меню и разрешённый домен согласно текущим настройкам BotFather. Для Telegram Stars не нужен сторонний платёжный провайдер.
3. После запуска HTTPS-сервера выполни `npm run bot:configure` с безопасно заданным окружением. Скрипт ставит пять команд, кнопку открытия Mini App и webhook `/telegram/webhook` с secret_token; токен не выводится.
4. Открой /start в боте, нажми кнопку, проверь полное обучение и одну смену. Отдельно включи уведомление в профиле.
5. /support и /paysupport показывают реальный SUPPORT_URL; свободное сообщение боту сохраняется как обращение. Администратор видит его и отвечает через защищённый кабинет в Mini App. Без реального маршрута поддержки production не запустится.
6. У администратора должен быть ID из ADMIN_TELEGRAM_IDS. Вход — через настоящую проверку Telegram initData. Отдельного пароля/секретного URL для обхода нет.

Для локального polling имеется `npm run bot`, только с PostgreSQL и настроенным PUBLIC_URL. Не запускай polling и webhook для одного бота одновременно; runner снимает webhook. Production использует webhook внутри приложения.

## Резервное копирование и восстановление

Храни резервные копии отдельно от сервера, шифруй и ограничивай доступ. Пример PostgreSQL:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > idealab.backup
```

PowerShell 7 поддерживает бинарное перенаправление; в старом Windows PowerShell лучше делать dump внутри контейнера и `docker cp`, чтобы не повредить двоичный поток. Для восстановления останови app, восстанови в отдельную чистую БД, проверь её, затем переключи DATABASE_URL:

```bash
# Эта команда предназначена только для выбранной чистой БД восстановления.
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < idealab.backup
```

Не восстанавливай поверх активного production без отдельного плана. Вместе с БД сохраняй конфигурацию версии приложения и ключ сессии в защищённом хранилище. Демо: останови сервер и скопируй весь каталог `.data` (не только основной sqlite-файл при работающем WAL). Рабочий restore-drill production должен выполнить владелец инфраструктуры.

## Необходимые внешние настройки

- Настоящий бот, PUBLIC_URL, TLS, WEBHOOK_SECRET, SESSION_SECRET, SUPPORT_URL, ADMIN_TELEGRAM_IDS.
- PostgreSQL с резервными копиями; отдельные БД/бот/домен для staging и production.
- Доступ к api.telegram.org, telegram.org (WebApp SDK), core.telegram.org (документация) и npm. Опционально binaries.prisma.sh для native CLI и отдельный hostname выбранного AI_ENDPOINT.
- ИИ необязателен: AI_API_KEY задаётся безопасно в окружении, AI_ENDPOINT — поддерживающий OpenAI-compatible chat completions HTTPS URL. Укажи собственную модель, лимит запросов и денежный лимит у провайдера.
- В управляемой среде изменения сетевой политики сохранены как черновик: их нужно проверить и сохранить в настройках, затем опубликовать среду. Сохранение черновика само не запускает скрипты и не публикует приложение.
