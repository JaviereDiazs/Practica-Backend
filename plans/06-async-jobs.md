# 06 — US5: Programación asíncrona, paralelismo e IA

> El plan más denso. Pide cuatro cosas distintas que se confunden fácil, así que cada una
> se resuelve con un mecanismo **separado y visible**.

**Depende de**: [00](00-project-setup.md), [01](01-shared-kernel.md), [02](02-auth.md)
**Se conecta con**: [04](04-realtime-websockets.md) vía event bus

---

## Las cuatro piezas, cada una con su mecanismo

| Requisito | Mecanismo | Dónde |
|---|---|---|
| Job en background | `@Processor` + `WorkerHost` de BullMQ | `infrastructure/queue/` |
| **Cola con máximo de jobs concurrentes** | opción `concurrency` del Worker | `jobs.module.ts` |
| **Semáforo sobre una sección de código** | `Semaphore` de `async-mutex`, singleton | `application/` |
| **Paralelismo real** | `worker_threads` de Node | `infrastructure/workers/` |
| Integración con modelo IA | puerto `AiProvider` + `FakeAiProvider` | `domain/` + `infrastructure/ai/` |

**La distinción clave**, y es la pregunta que van a hacer:

- `concurrency` limita cuántos **jobs** procesa el worker a la vez.
- El semáforo limita cuántas **ejecuciones simultáneas** entran a una sección crítica,
  *sumando todos los jobs*. Con `concurrency: 3` y semáforo en 2, tres jobs corren en
  paralelo pero solo dos pueden estar dentro de la sección crítica al mismo tiempo.
- Node es **single-threaded**: `async/await` da *concurrencia*, no *paralelismo*. Para
  paralelismo real de CPU hacen falta `worker_threads`. Poder decir esta frase vale mucho.

---

## Estructura

```
src/modules/jobs/
├── jobs.module.ts
├── domain/
│   ├── entities/{analysis-job,analysis-result}.ts
│   ├── services/ai-provider.ts              # interface AiProvider + Symbol AI_PROVIDER
│   └── errors/job-not-found.error.ts
├── application/
│   ├── dto/{create-analysis-job,job-status}.dto.ts
│   ├── mappers/job.mapper.ts
│   ├── services/
│   │   ├── analysis-job.service.ts          # encola y consulta estado
│   │   └── ai-concurrency.limiter.ts        # ← EL SEMÁFORO
├── infrastructure/
│   ├── queue/analysis.processor.ts          # ← EL WORKER DE BULLMQ
│   ├── workers/
│   │   ├── worker-pool.ts                   # ← LOS worker_threads
│   │   └── analysis.worker.ts               # código que corre EN el hilo
│   └── ai/fake-ai-provider.ts               # ← LA "IA"
└── presentation/jobs.controller.ts
```

---

## 1. La cola (BullMQ)

```ts
BullModule.forRootAsync({ inject: [ConfigService], useFactory: (c) => ({
  connection: { host: c.get('REDIS_HOST'), port: c.get('REDIS_PORT') },
})}),
BullModule.registerQueue({ name: 'analysis' }),
```

Productor:

```ts
const job = await this.queue.add('analyze', { texts: dto.texts }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 100,
});
return { jobId: job.id };     // el controller responde 202 Accepted
```

`202 Accepted` es el código correcto: se aceptó el trabajo, todavía no terminó.

Consumidor:

```ts
@Processor('analysis', { concurrency: Number(process.env.JOBS_CONCURRENCY) })
export class AnalysisProcessor extends WorkerHost {
  async process(job: Job<AnalysisJobData>): Promise<AnalysisResult> { ... }

  @OnWorkerEvent('active')    onActive(job)    { ... }
  @OnWorkerEvent('progress')  onProgress(job)  { /* → event bus → WebSocket */ }
  @OnWorkerEvent('completed') onCompleted(job) { ... }
  @OnWorkerEvent('failed')    onFailed(job, err) { ... }
}
```

⚠️ En BullMQ (a diferencia de Bull viejo) **no** hay `@Process('nombre')`: hay un solo
`process()` y se ramifica por `job.name` con un `switch`.

## 2. El semáforo

```ts
@Injectable()
export class AiConcurrencyLimiter {
  private readonly semaphore: Semaphore;

  constructor(config: ConfigService) {
    this.semaphore = new Semaphore(config.get<number>('AI_MAX_CONCURRENCY')!);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const [, release] = await this.semaphore.acquire();
    try {
      return await fn();
    } finally {
      release();          // SIEMPRE en finally, o el semáforo se filtra y deadlockea
    }
  }
}
```

Es un **singleton a nivel de aplicación**, así que el límite es global a todos los jobs.
El `finally` es el detalle que separa una implementación correcta de una que se cuelga.

## 3. Los worker_threads

`worker-pool.ts`: pool de tamaño fijo que reparte tareas entre N hilos y devuelve una
promesa por tarea.

```ts
const worker = new Worker(new URL('./analysis.worker.js', import.meta.url));
worker.postMessage(chunk);
worker.on('message', resolve);
worker.on('error', reject);
```

**Notas de ESM** (el scaffold es `"type": "module"`):
- `new URL('./analysis.worker.js', import.meta.url)` en vez de
  `path.join(__dirname, ...)` — no existe `__dirname` en ESM.
- La extensión es `.js` porque se resuelve contra `dist/`, no contra `src/`.
- Verificar que `nest build` emita `analysis.worker.js` en `dist/`; si el tree-shaking lo
  descarta, declararlo en `nest-cli.json` → `compilerOptions.assets`.

`analysis.worker.ts` es el código que corre **dentro** del hilo. No tiene acceso a la DI de
Nest — es un módulo suelto que recibe datos por `parentPort` y devuelve el resultado. Esa
frontera es justamente lo interesante de mostrar.

## 4. El proveedor de IA (mock)

```ts
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiProvider {
  analyze(text: string): Promise<{ sentiment: string; summary: string; tokens: number }>;
}
```

`FakeAiProvider` simula latencia (`AI_LATENCY_MS`) y hace algo determinista y CPU-intensivo
(un hash iterado + conteo de palabras) para que el paralelismo se **note** en los tiempos.

Puerto en `domain/`, implementación en `infrastructure/ai/`. Cambiar el mock por un cliente
real de un LLM es sustituir un `useClass` — es exactamente el argumento de la arquitectura
hexagonal, aplicado a algo concreto.

## 5. El flujo completo

```
POST /jobs/analyze  →  queue.add()  →  202 { jobId }
                            │
                            ▼
        AnalysisProcessor.process()      ← máx. JOBS_CONCURRENCY jobs a la vez
                            │
                    parte en chunks
                            │
                            ▼
                  WorkerPool.run(chunk)  ← paralelismo REAL (worker_threads)
                            │
                    AiConcurrencyLimiter ← máx. AI_MAX_CONCURRENCY en la sección crítica
                            │
                     FakeAiProvider.analyze()
                            │
                   job.updateProgress(n)
                            │
              @OnWorkerEvent('progress') → event bus
                            │
                            ▼
          realtime gateway → room `job:<id>`  (plan 04)
```

`GET /jobs/:id` devuelve estado y progreso, con el resultado cacheado (plan 05) cuando ya
terminó.

---

## Verificación

```bash
docker compose up -d redis

# Lanzar 5 jobs de golpe
for i in $(seq 1 5); do
  curl -s -X POST localhost:3000/jobs/analyze \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"texts":["uno","dos","tres","cuatro"]}' &
done; wait
```

Qué hay que ver:

1. En los logs, **nunca más de `JOBS_CONCURRENCY` jobs activos** a la vez (los `@OnWorkerEvent('active')`).
2. En los logs del limiter, **nunca más de `AI_MAX_CONCURRENCY`** dentro de la sección crítica.
3. En el cliente WebSocket suscrito a `job:<id>`, el progreso subiendo en vivo.
4. `GET /jobs/:id` → `waiting` → `active` → `completed` con el resultado.
5. Con `JOBS_CONCURRENCY=1` el conjunto tarda claramente más que con `=4`.
6. Bajar `AI_MAX_CONCURRENCY` a 1 → se serializa aunque haya varios hilos vivos: eso
   **demuestra** que el semáforo es lo que está limitando, no la cola.
7. Matar el proceso a mitad y reiniciarlo → BullMQ retoma los jobs pendientes desde Redis
   (persistencia de la cola).
