# 09 — Documentación (el README)

> **Es el entregable más importante de todo el repo.** Mañana, bajo presión y sin IA, no
> vas a leer código: vas a abrir el README y copiar el comando o el bloque que necesitás.
> Está escrito para consulta rápida, no para presentar el proyecto.

**Depende de**: todos los planes anteriores

---

## Principio de redacción

Cada sección tiene que responderse en **menos de 15 segundos** de escaneo. Comandos
copiables, tablas en vez de prosa, y el bloque de código mínimo de cada feature.

Idioma: **inglés**. La guía de Jalasoft lo pide explícitamente ("Use English consistently
throughout your work, including variable names and commit messages") y conviene que mañana
escribas lo mismo que practicaste.

---

## Secciones

### 1. Create the project from scratch

Lo primero que vas a hacer mañana. Los comandos exactos, con las **sorpresas de Nest 12
marcadas**, porque son lo que te va a hacer perder tiempo si no las esperás:

```bash
npx @nestjs/cli@latest new my-app --package-manager npm
```

> Nest 12 genera **ESM** (`"type": "module"`) → todos los imports relativos llevan `.js`.
> Los tests son **Vitest**, no Jest. El linter es **oxlint**, no ESLint.

Y los generadores, que ahorran mucho tiempo:

```bash
nest g module modules/auth
nest g controller modules/auth/presentation/auth --flat
nest g service modules/auth/application/services/auth --flat
nest g resource modules/catalog        # CRUD completo de una
nest g guard   modules/auth/presentation/guards/jwt-auth --flat
nest g gateway modules/realtime/presentation/gateways/notifications --flat
```

### 2. Run

```bash
docker compose up -d      # postgres, redis, rabbitmq, otel-lgtm
npm ci
npm run start:dev         # watch mode
npm run start:debug       # + inspector en :9229
npm run build && npm run start:prod
npm run start:otel        # con OpenTelemetry (ver nota del plan 07)
```

Tabla de puertos: app `3000`, Postgres `5432`, Redis `6379`, RabbitMQ `5672` (UI `15672`),
Grafana `3001`, OTLP `4317`/`4318`.

### 3. Test

```bash
npm test / test:watch / test:cov / test:e2e / test:debug
npm run lint
```

Con la nota de Vitest: `vi.fn()` en vez de `jest.fn()`, y `--no-file-parallelism` para
debuggear.

### 4. Environment variables

Tabla completa: **nombre · default · descripción · quién la usa**. Cubre las ~25 variables
del plan 00. Es la sección que más se consulta.

Nota sobre `dotenv`: no se instala aparte, `@nestjs/config` ya lo incluye. Se activa con
`ConfigModule.forRoot({ envFilePath: '.env' })` y se **valida** con `class-validator`
(plan 01), de modo que la app no arranca si falta algo.

### 5. Database & migrations

```bash
npm run migration:generate -- src/migrations/AddUsers
npm run migration:run
npm run migration:revert
```

Más la advertencia de `synchronize: true`: cómodo en desarrollo, prohibido en producción.

### 6. Cheat sheets por feature ⭐

**La sección clave.** El bloque mínimo de código de cada cosa, para copiar mentalmente:

| Feature | Qué mostrar |
|---|---|
| Auth | `JwtModule.registerAsync`, el `JwtAuthGuard` completo, `@Public()`, `APP_GUARD` |
| RabbitMQ | `connectMicroservice` con `wildcards: true`, `emit` vs `send`, `@EventPattern` con ack manual |
| WebSockets | `@WebSocketGateway`, auth en el handshake, `client.join()`, `server.to().emit()`, y el snippet del cliente |
| Cache | `CacheModule.registerAsync` con `stores: []`, `@Inject(CACHE_MANAGER)`, `CacheInterceptor` |
| Jobs | `BullModule.registerQueue`, `@Processor` + `WorkerHost`, `concurrency`, `Semaphore`, `new Worker(new URL(...))` |
| OTel | `instrumentation.ts` entero + **el comando con los dos flags de ESM** |
| Clean architecture | el árbol de un módulo + el patrón `Symbol` token → `useClass` |

### 7. Architecture

El árbol de directorios, la regla del shared kernel, y **el párrafo sobre por qué los
módulos se comunican por eventos** — es lo que te van a preguntar en el code review.

Un diagrama ASCII de la dirección de dependencias:
`presentation → application → domain ← infrastructure`.

### 8. Manual verification walkthrough

La secuencia de `curl` que ejercita las 6 features en orden, copiada de las secciones de
verificación de los planes 02–07. Sirve como smoke test y como guion de demo.

### 9. Troubleshooting

Los errores que ya sabemos que van a pasar:

| Síntoma | Causa |
|---|---|
| `ERR_MODULE_NOT_FOUND` | falta el `.js` en un import relativo (ESM) |
| `__dirname is not defined` | ESM → usar `new URL(..., import.meta.url)` |
| No aparece ninguna traza | `instrumentation.ts` cargado después de Nest, o falta `--experimental-loader` |
| `Nest can't resolve dependencies` | falta el `@Inject(TOKEN)` de un puerto, o el módulo no lo provee |
| El consumidor de RMQ no recibe nada | falta `wildcards: true`, o la routing key no matchea el patrón |
| El caché no invalida | se usó `CacheInterceptor` donde hacía falta `cache.del()` |
| El semáforo se cuelga | falta el `release()` en un `finally` |
| Puerto 3000 ocupado | Grafana — por eso está mapeado a 3001 |

---

## Verificación

La prueba real de este plan: **seguir el README desde cero en una carpeta limpia**, sin
mirar el código, y que la app quede corriendo con las 6 features funcionando.

Si en algún paso hay que abrir un archivo `.ts` para entender qué hacer, ese paso está mal
documentado.
