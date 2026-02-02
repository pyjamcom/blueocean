# Observability

## Логи
- WS connect/disconnect
- join/answer ошибки
- client_error (без PII)

## Метрики
- wsConnections/wsDisconnects
- joinSuccess/joinFail
- answerAccepted/answerRejected
- roomsCreated/roomsExpired
- roomsActive
- D1/D7 retention
- sessions/user
- streak completion rate
- quest completion rate

## Авто‑отчёты
- Ежедневный rollup метрик (D1/D7, churn, sessions/user) сохраняется в Redis.
- GET `/metrics/engagement?period=daily&day=YYYY-MM-DD` — дневной отчёт.
- GET `/metrics/engagement?period=weekly&week=YYYY-W##` — недельный отчёт.
- `/metrics/engagement` также возвращает `periodSweep` со статусом ночных rollup‑джоб.

## Уведомления (Telegram)
- `TELEGRAM_BOT_TOKEN` — токен бота.
- `TELEGRAM_CHAT_ID` — id чата/канала для алертов.
- `TELEGRAM_THREAD_ID` — опционально, для форум‑топика.

## Алерты (рекомендации)
- рост joinFail > 10% за 5 мин
- spikes answerRejected
- рост roomsExpired при низком roomsCreated
- деградация time‑to‑start (из аналитики)
- падение streak completion > 15% день‑к‑дню
- падение D1 > 8% после релиза/эксперимента
