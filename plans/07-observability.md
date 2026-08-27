# 07 — US6: Observabilidad con OpenTelemetry

> Las tres señales: **trazas**, **métricas** y **logs**, correlacionadas entre sí.
> Todo va por OTLP a un solo contenedor (`grafana/otel-lgtm`).

**Depende de**: [00](00-project-setup.md), [01](01-shared-kernel.md)
**Instrumenta**: todos los módulos anteriores

---

## ⚠️ Tres trampas de este proyecto

### 1. `nestjs-otel` y `nestjs-pino` NO sirven acá

Ninguno de los dos tiene todavía una versión con peer `@nestjs/common ^12`, y este
scaffold es Nest 12 (verificado contra npm: `nestjs-otel@8.1.0` pide
`>= 11 < 12`, `nestjs-pino@4.6.1` pide `^8 || ^9 || ^10 || ^11`). Se usa el SDK de
OpenTelemetry directo y `pino`/`pino-http` sin el wrapper de Nest — más código propio, pero
también más didáctico, porque queda visible qué hace cada pieza.

### 2. El puerto OTLP gRPC (4317) puede estar ocupado

Si tenés otra herramienta local en `4317` (p. ej. un Aspire Dashboard de un proyecto
.NET), el `docker-compose.yml` del plan 00 **no publica** ese puerto a propósito — solo el
4318 (HTTP), que es el que usan los exporters de este plan. No hace falta tocar nada más.

### 3. El proyecto es ESM, y OTel necesita un flag extra

El scaffold tiene `"type": "module"`. La instrumentación automática parchea módulos, y en
ESM eso requiere un *loader hook*. El comando correcto es:

```bash
node --experimental-loader=@opentelemetry/instrumentation/hook.mjs \
     --import ./dist/instrumentation.js \
     dist/main.js
```

- `--import` carga el SDK **antes** que la app (con `--require` no funciona en ESM).
- `--experimental-loader=@opentelemetry/instrumentation/hook.mjs` es el único hook
  soportado oficialmente; requiere Node ≥ 18.19 (acá hay v22.22.2 ✓).

**El orden importa**: si `instrumentation.js` se carga después de Nest, las
auto-instrumentaciones no parchean nada y no aparece ni una traza. Es *el* error clásico.
Por eso va como un archivo aparte precargado, no como un import dentro de `main.ts`.

---

## 1. `src/instrumentation.ts`

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'practica-backend',
    [ATTR_SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: 10_000,
  }),
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
process.on('SIGTERM', () => void sdk.shutdown());
```

`OTEL_EXPORTER_OTLP_ENDPOINT` se lee sola de la variable de entorno; no hace falta pasarla.

**Modo sin infraestructura**: si `OTEL_EXPORTER=console`, usar `ConsoleSpanExporter` y
`ConsoleMetricExporter`; si `OTEL_ENABLED=false`, no arrancar el SDK. Sirve para correr sin
levantar el contenedor de LGTM, que pesa ~1 GB.

## 2. Trazas

`getNodeAutoInstrumentations()` instrumenta solo, sin escribir código: HTTP, Express, `pg`,
`ioredis`, `amqplib`, `socket.io` y `pino`. Con eso, una petición produce una traza que
atraviesa toda la app.

**Spans manuales** donde el automático no llega, que es lo que se enseña acá:

```ts
const tracer = trace.getTracer('practica-backend');

await tracer.startActiveSpan('ai.analyze', async (span) => {
  span.setAttribute('ai.text_length', text.length);
  try {
    return await this.ai.analyze(text);
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();       // SIEMPRE, o el span se filtra
  }
});
```

Ojo: el contexto de traza **no cruza a un `worker_thread`** automáticamente. Hay que
propagarlo a mano pasando el `traceparent` en el `postMessage` — buen detalle para
mencionar, aunque no es obligatorio implementarlo.

## 3. Métricas

`shared/observability/metrics.service.ts` centraliza las métricas de negocio con la API de
OTel:

| Métrica | Tipo | De dónde sale |
|---|---|---|
| `auth_logins_total` | Counter | plan 02 |
| `notifications_published_total` | Counter | plan 03 |
| `cache_operations_total{result=hit\|miss}` | Counter | plan 05 |
| `jobs_processed_total{status}` | Counter | plan 06 |
| `job_duration_seconds` | Histogram | plan 06 |
| `ai_concurrent_executions` | UpDownCounter | plan 06, sube/baja con el semáforo |

`ai_concurrent_executions` es el mejor gráfico de la demo: se ve la meseta exacta en
`AI_MAX_CONCURRENCY`.

Se inyecta como servicio normal desde `application/`, así el dominio no se ensucia con la
API de OTel.

## 4. Logs

Sin `nestjs-pino`, se arma a mano — tampoco es mucho código:

**`shared/observability/pino-logger.service.ts`** — implementa `LoggerService` de Nest
sobre una instancia de `pino`, para que `Logger` (el de `@nestjs/common`) escriba en JSON
estructurado en vez de texto plano:

```ts
@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
    redact: ['req.headers.authorization', 'req.body.password'],
  });

  log(message: string, context?: string)   { this.logger.info({ context }, message); }
  error(message: string, trace?: string, context?: string) {
    this.logger.error({ context, trace }, message);
  }
  warn(message: string, context?: string)  { this.logger.warn({ context }, message); }
  debug(message: string, context?: string) { this.logger.debug({ context }, message); }
}
```

`redact` no es opcional: sin eso los tokens y las contraseñas quedan escritos en los logs.
Es un hallazgo típico de code review.

**`pino-http`** como middleware en `main.ts` para loguear cada request HTTP con su
duración, sin escribir un interceptor:

```ts
app.use(pinoHttp({ redact: ['req.headers.authorization'] }));
```

La **correlación** sale gratis: `@opentelemetry/instrumentation-pino` (viene dentro de
`auto-instrumentations-node`) inyecta `trace_id` y `span_id` en cada línea de log
automáticamente, sin tocar el código de arriba. Con eso, desde una traza en Tempo se salta
a los logs exactos de esa petición en Loki.

En `main.ts`: `app.useLogger(app.get(PinoLoggerService))` y `bufferLogs: true` en
`NestFactory.create`.

---

## Verificación

```bash
docker compose up -d otel-lgtm
cd prototype && npm run build && npm run start:otel
```

Generar tráfico: `POST /auth/login`, `POST /messaging/publish`, `POST /jobs/analyze`.

En Grafana (<http://localhost:3001>, sin login):

1. **Tempo** → buscar por `service.name = practica-backend`. Abrir la traza de
   `POST /jobs/analyze`: debe verse el span HTTP con hijos de Redis (BullMQ) y los spans
   manuales de `ai.analyze`.
2. **Prometheus** → graficar `jobs_processed_total` y `ai_concurrent_executions`. El
   segundo hace meseta en `AI_MAX_CONCURRENCY`.
3. **Loki** → filtrar por `trace_id` de la traza del paso 1 → salen solo los logs de esa
   petición. **Esa es la demo que cierra el tema.**
4. Comprobar que ningún log contiene el header `Authorization` ni un password.

Prueba del modo degradado: `OTEL_EXPORTER=console npm run start:otel` → los spans se
imprimen en la terminal, sin necesidad del contenedor.
