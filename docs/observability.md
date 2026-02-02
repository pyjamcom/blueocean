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

## Алерты (рекомендации)
- рост joinFail > 10% за 5 мин
- spikes answerRejected
- рост roomsExpired при низком roomsCreated
- деградация time‑to‑start (из аналитики)
- падение streak completion > 15% день‑к‑дню
- падение D1 > 8% после релиза/эксперимента
