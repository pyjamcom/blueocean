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

## Алерты (рекомендации)
- рост joinFail > 10% за 5 мин
- spikes answerRejected
- рост roomsExpired при низком roomsCreated
- деградация time‑to‑start (из аналитики)
