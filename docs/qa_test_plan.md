# QA / Test Plan

## Unit
- Схемы/валидаторы (questions/assets/ws).
- Таймеры/рандомизация.
- Проверка отсутствия текста в UI‑конфиге.

## Integration
- WS‑контракты: join/answer/question.
- QR‑flow: d0.do/xxx.
- Ассеты: валидные лицензии и evidence‑файлы.

## E2E smoke (ручной)
1) Create room → QR.
2) Scan/join → lobby.
3) Play 1 round.
4) Leaderboard → ShareCard.
5) Time‑to‑Smile < 2 мин (ручной замер).

## Load
- 8/16/32 игроков в комнате.
- burst‑join.
- пик ответов.

## Визуальные сценарии
- 10 типов сцен.
- Anti‑red‑ocean guardrails.
- Отсутствие брендов/персоналий.
- Читаемость для 21–55.
