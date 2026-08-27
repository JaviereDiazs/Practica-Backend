# 01 — Shared kernel

> Todo lo transversal que los módulos de negocio van a reutilizar sin acoplarse entre sí.
> Es el plan que define la frontera: si esto crece de más, el monolito modular se muere.

**Depende de**: [00](00-project-setup.md) · **Habilita**: 02–07

---

## Qué SÍ va en `shared/`

Configuración, conexiones a infraestructura, errores base, filtros e interceptores
globales, observabilidad y el bus de eventos in-process.

## Qué NO va en `shared/`

Entidades de negocio, DTOs de un módulo, servicios de aplicación, reglas de dominio.
Si algo solo lo usa un módulo, vive en ese módulo — aunque "quizás después" lo use otro.

---

## Estructura

```
src/shared/
├── config/
│   ├── env.validation.ts        # clase con class-validator sobre process.env
│   ├── configuration.ts         # namespaces tipados: app, db, redis, rabbitmq, jobs, otel
│   └── app-config.module.ts     # ConfigModule.forRoot({ isGlobal: true, validate })
├── database/
│   ├── database.module.ts       # TypeOrmModule.forRootAsync
│   └── data-source.ts           # DataSource standalone para el CLI de migraciones
├── events/
│   ├── events.module.ts         # EventEmitterModule.forRoot()
│   └── integration-events.ts    # nombres + tipos de los eventos entre módulos
├── domain/
│   └── errors/
│       ├── domain.error.ts      # clase base abstracta
│       ├── not-found.error.ts
│       ├── conflict.error.ts
│       └── unauthorized.error.ts
└── presentation/
    ├── filters/domain-exception.filter.ts
    ├── interceptors/logging.interceptor.ts
    └── health.controller.ts     # GET /health — a mano, ver sección 5
```

> `shared/cache/`, `shared/messaging/` y `shared/observability/` se crean en sus planes
> respectivos (05, 03 y 07) para no adelantar dependencias.

---

## 1. Configuración validada

`env.validation.ts` define una clase con decoradores de `class-validator`
(`@IsString()`, `@IsInt()`, `@IsBoolean()`, `@IsEnum()`, `@IsOptional()`) y una función
`validate(config)` que hace `plainToInstance` + `validateSync` y **lanza** si algo falla.

Se enchufa así:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
  validate,
  cache: true,
})
```

**Por qué importa**: la app falla al arrancar con un mensaje claro si falta una variable,
en lugar de reventar a las dos horas con un `undefined`. Es un punto fácil de defender en
un code review.

`configuration.ts` expone los valores agrupados con `registerAs('database', () => ({...}))`
para que los módulos inyecten `ConfigType<typeof databaseConfig>` en vez de andar con
strings sueltos.

## 2. Base de datos

`DatabaseModule` con `TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory })`.

Puntos a cuidar (**específicos de ESM**):

- Nada de globs tipo `entities: [__dirname + '/**/*.entity.js']` — en ESM no hay
  `__dirname` y el glob es frágil. **Importar las clases de entidad explícitamente** en el
  array `entities`. Es más verboso pero explícito y siempre funciona.
- `synchronize: DB_SYNCHRONIZE === true` y solo fuera de producción. Documentar en el
  README que en un proyecto real van migraciones.
- `autoLoadEntities: true` como alternativa: cada módulo registra las suyas con
  `TypeOrmModule.forFeature([...])` y no hay que tocar el módulo raíz. **Preferir esta**,
  que mantiene los módulos independientes.

`data-source.ts` exporta un `DataSource` suelto (leyendo `.env` con `dotenv/config`) para
que el CLI de TypeORM pueda generar migraciones.

## 3. Errores de dominio

```
DomainError (abstract)
├── NotFoundError      → 404
├── ConflictError      → 409
├── UnauthorizedError  → 401
└── ValidationError    → 400
```

Cada una lleva un `code` string estable (`USER_NOT_FOUND`, `EMAIL_ALREADY_EXISTS`) además
del mensaje.

**La clave**: `domain/` y `application/` lanzan `DomainError`, **nunca** `HttpException`.
El dominio no sabe que existe HTTP. La traducción a códigos de estado ocurre en un único
lugar: el filtro.

`DomainExceptionFilter` (`@Catch()`) mapea `DomainError` → status + body normalizado
(`{ statusCode, code, message, timestamp, path }`), deja pasar las `HttpException` de Nest
y convierte cualquier otra cosa en un 500 sin filtrar detalles internos.

## 4. Event bus in-process

`EventEmitterModule.forRoot()` en `shared/events/`.

`integration-events.ts` centraliza los nombres y los payloads:

```ts
export const INTEGRATION_EVENTS = {
  NOTIFICATION_RECEIVED: 'notification.received',
  JOB_PROGRESS_UPDATED: 'job.progress.updated',
  JOB_COMPLETED: 'job.completed',
} as const;

export interface NotificationReceivedEvent { topic: string; payload: unknown; receivedAt: Date }
export interface JobProgressUpdatedEvent { jobId: string; progress: number }
```

**Este es el mecanismo por el que los módulos hablan entre sí.** El módulo `messaging`
emite `notification.received` y el módulo `realtime` lo escucha con `@OnEvent(...)` —
ninguno importa al otro. Lo mismo con `jobs` → `realtime`.

Los *nombres* de eventos y sus tipos viven en `shared/` porque son un contrato compartido,
igual que un `.proto`. Eso es legítimo en un shared kernel; la lógica que los produce o
consume, no.

## 5. Bootstrap global (`main.ts`)

```ts
const app = await NestFactory.create(AppModule);
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,            // elimina props no declaradas en el DTO
  forbidNonWhitelisted: true, // y devuelve 400 si vienen
  transform: true,            // instancia el DTO de verdad
}));
app.useGlobalFilters(new DomainExceptionFilter());
```

Swagger en `/api` con `DocumentBuilder().addBearerAuth()`, para poder probar los endpoints
protegidos desde el navegador sin pelear con `curl`.

**`GET /health` a mano**, sin `@nestjs/terminus`: su última versión (`11.1.1`) todavía no
soporta Nest 12 (peer `@nestjs/common ^10 || ^11`). Un `HealthController` con `@Public()`
que inyecta el `DataSource` de TypeORM, hace `dataSource.query('SELECT 1')` y devuelve
`{ status: 'ok' | 'degraded', checks: { database } }` — diez líneas, sin dependencia extra.
El check de Redis (`checks.cache`) se agrega en el plan 05, cuando `CACHE_MANAGER` ya
existe — acá solo se deja el objeto `checks` abierto a extender.

---

## Verificación

```bash
npm run start:dev
```

1. Comentar `JWT_SECRET` en `.env` → la app **no arranca**, con un error que nombra la
   variable. Descomentar.
2. `GET /health` → `200` con el estado de Postgres (Redis se suma en el plan 05).
3. Abrir <http://localhost:3000/api> → Swagger carga.
4. Mandar un body con un campo de más a cualquier endpoint con DTO → `400` por
   `forbidNonWhitelisted`.
