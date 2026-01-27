# CI/CD & релизы

## CI (обязательные проверки)
- lint
- typecheck (web + server)
- tests (schema/validators + WS contracts)
- build (web/server)

## Окружения
- dev → stage → prod
- раздельные домены и конфиги

## Деплой
- Web (PWA): сборка → загрузка в S3 → инвалидация CloudFront
- Server (WS): build → publish container → deploy ECS Fargate

## Версионирование
- server/shared: semver
- web: тег релиза
- changelog: краткий, без технической перегрузки

## Rollback
- web: быстрый откат версии + CloudFront invalidate
- server: откат на предыдущий образ ECS
- fallback: последняя стабильная версия
