# 00 — Project setup

> Deja el repo listo para trabajar: limpieza, dependencias, infraestructura en Docker y
> variables de entorno. Sin esto no arranca nada de lo demás.

**Depende de**: nada · **Habilita**: todos los planes siguientes

---

## 1. Limpieza del repo

El scaffold quedó en `prototype/` con un `.git` anidado sin commits, y el `.gitignore` de
la raíz es una plantilla equivocada (Dynamics 365 Business Central / AL).

- [ ] Borrar `prototype/.git` para que el repo de la raíz trackee el código.
- [ ] Reemplazar el `.gitignore` de la raíz por uno de Node/Nest:
      `node_modules/`, `dist/`, `.env`, `coverage/`, `*.log`, `.vitest-cache/`.
      El scaffold ya generó un `.gitignore` correcto en `prototype/` — usarlo de base.
- [ ] Mover el `README.md` del scaffold a `prototype/README.scaffold.md` (o borrarlo);
      el README bueno se escribe en el plan 09.

Decisión: **el proyecto se queda en `prototype/`**. La raíz del repo aloja `plans/` y el
README maestro.

## 2. Dependencias

Versiones verificadas en npm el 2026-08-27. Instalar por grupos, no todo de golpe, así se
ve qué paquete corresponde a qué feature (útil para recordarlo mañana).

```bash
cd prototype

# Base transversal — plan 01
npm i @nestjs/config class-validator class-transformer @nestjs/event-emitter \
      @nestjs/swagger

# Persistencia — plan 01/02
npm i @nestjs/typeorm typeorm pg

# Auth — plan 02
npm i @nestjs/jwt bcrypt
npm i -D @types/bcrypt

# RabbitMQ — plan 03
npm i @nestjs/microservices amqplib amqp-connection-manager
npm i -D @types/amqplib

# WebSockets — plan 04
npm i @nestjs/websockets @nestjs/platform-socket.io socket.io

# Caché — plan 05
npm i @nestjs/cache-manager cache-manager keyv @keyv/redis cacheable

# Jobs — plan 06
npm i @nestjs/bullmq bullmq ioredis async-mutex

# Observabilidad — plan 07
npm i @opentelemetry/sdk-node @opentelemetry/api @opentelemetry/api-logs \
      @opentelemetry/auto-instrumentations-node @opentelemetry/resources \
      @opentelemetry/semantic-conventions @opentelemetry/sdk-metrics @opentelemetry/sdk-logs \
      @opentelemetry/exporter-trace-otlp-http \
      @opentelemetry/exporter-metrics-otlp-http \
      @opentelemetry/exporter-logs-otlp-http \
      pino pino-http pino-pretty
```

⚠️ **Dos paquetes que NO se instalan, verificado hoy contra npm**:

- **`@nestjs/terminus`** — su última versión (`11.1.1`) solo declara peer
  `@nestjs/common ^10.0.0 || ^11.0.0`. Aún no sacaron build para Nest 12. En vez de eso, el
  plan 01 hace un `HealthController` a mano (más simple igual).
- **`nestjs-otel`** y **`nestjs-pino`** — mismo problema, sus peers tampoco llegan a Nest 12.
  Se usa el SDK de OpenTelemetry directo y `pino`/`pino-http` sin el wrapper de Nest — más
  código propio, pero también más didáctico para explicarlo en un code review.

## 3. `docker-compose.yml` (en la raíz del repo)

Cuatro servicios. El de observabilidad es `grafana/otel-lgtm`, que es un solo contenedor
con Grafana + Tempo + Prometheus + Loki y recibe OTLP de las tres señales en el mismo
puerto — mucho más simple que montar Jaeger + Prometheus + Loki por separado.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: practica
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app -d practica']
      interval: 5s
      retries: 10

  redis:
    image: redis:8-alpine
    ports: ['6379:6379']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      retries: 10

  rabbitmq:
    image: rabbitmq:4-management-alpine
    ports: ['5672:5672', '15672:15672']   # 15672 = UI, guest/guest
    healthcheck:
      test: ['CMD', 'rabbitmq-diagnostics', '-q', 'ping']
      interval: 10s
      retries: 10

  otel-lgtm:
    image: grafana/otel-lgtm:latest
    ports:
      - '3001:3000'   # Grafana UI (3000 lo usa la app)
      - '4318:4318'   # OTLP HTTP — el que usan los exporters del plan 07

volumes:
  pgdata:
```

> `otel-lgtm` es una imagen pesada (~1 GB). Si la máquina va justa, se puede levantar solo
> el resto y correr la app con `OTEL_EXPORTER=console` (ver plan 07).
>
> ⚠️ **El puerto `4317` (OTLP gRPC) no se publica a propósito**: si tenés otra herramienta
> local escuchando ahí (p. ej. un Aspire Dashboard de otro proyecto .NET), `docker compose
> up` deja el contenedor en `Created` sin arrancar por el conflicto de puerto. No hace
> falta ese puerto — los exporters del plan 07 usan HTTP (4318), no gRPC.

## 4. Variables de entorno

`.env.example` versionado + `.env` real ignorado por git. La tabla completa se documenta en
el plan 09; acá va el contenido inicial:

```dotenv
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=app
DB_PASSWORD=app
DB_NAME=practica
DB_SYNCHRONIZE=true

# Auth
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=3600s

# Redis (cache + BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379
CACHE_TTL_MS=30000

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=notifications
RABBITMQ_QUEUE=notifications_queue

# Jobs
JOBS_QUEUE_NAME=analysis
JOBS_CONCURRENCY=2
AI_MAX_CONCURRENCY=3
AI_LATENCY_MS=400

# Observability
OTEL_ENABLED=true
OTEL_EXPORTER=otlp            # otlp | console
OTEL_SERVICE_NAME=practica-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=debug
```

`dotenv` no se instala aparte: `@nestjs/config` ya lo trae y lo carga con
`ConfigModule.forRoot({ envFilePath: '.env' })`. La validación de estas variables se hace
en el plan 01.

## 5. Scripts de `package.json`

El scaffold ya trae `build`, `start`, `start:dev`, `start:debug`, `start:prod`, `lint`,
`test`, `test:watch`, `test:cov`, `test:debug`, `test:e2e`. Añadir:

```json
"start:otel": "node --experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./dist/instrumentation.js dist/main.js",
"typeorm": "node --loader ts-node/esm ./node_modules/typeorm/cli.js -d src/shared/database/data-source.ts",
"migration:generate": "npm run typeorm -- migration:generate",
"migration:run": "npm run typeorm -- migration:run",
"migration:revert": "npm run typeorm -- migration:revert"
```

## 6. `.vscode/launch.json`

Para el debugging de mañana. Dos configuraciones:

- **Attach a Nest**: `type: node`, `request: attach`, `port: 9229`, `restart: true`,
  para usar con `npm run start:debug`.
- **Debug Vitest**: `request: launch`, `program: node_modules/vitest/vitest.mjs`,
  `args: ['run', '--no-file-parallelism']`.

---

## Verificación

```bash
docker compose up -d
docker compose ps                      # los 4 servicios healthy
cd prototype && npm ci && npm run build   # compila sin errores
npm run start:dev                      # arranca en :3000
curl localhost:3000                    # "Hello World!"
```

Además:
- RabbitMQ UI en <http://localhost:15672> (guest / guest)
- Grafana en <http://localhost:3001>
