# Infra Architecture (AWS, US)

## Цели
- Быстрый запуск без тяжёлой инфраструктуры.
- Масштабирование под ~1000 одновременных игроков.
- Разделение окружений dev/stage/prod.

## Хранилища и состояние
### Оперативное состояние
- Redis (ElastiCache): комнаты/раунды/таймеры, TTL, быстрый read/write.

### Долговременные данные
- Postgres (RDS) или DynamoDB: сессии, метрики, аналитика.

### Ассеты
- S3: PNG/JPG/SVG, версионность, контроль лицензий.

## Хостинг и домены
### Web/PWA
- `escapers.app` → CloudFront (origin: приватный S3).
- ACM сертификаты (CloudFront требует us-east-1).

### WebSocket сервер
- `ws.escapers.app` → ALB → ECS Fargate.
- ACM сертификат в рабочем регионе ALB.

### DNS
- Route53: Alias A/AAAA на CloudFront и ALB.
- При необходимости WAF на CloudFront/ALB.

## Окружения
- dev: `dev.escapers.app`, `ws-dev.escapers.app`.
- stage: `stage.escapers.app`, `ws-stage.escapers.app`.
- prod: `escapers.app`, `ws.escapers.app`.
- Раздельные ключи/конфиги/данные, фичефлаги.

## Мини‑диаграмма (ASCII)
```
Users -> CloudFront -> S3 (PWA)
       -> ALB -> ECS Fargate (WS) -> Redis (state)
                                 -> RDS/DynamoDB (sessions/metrics)
```
