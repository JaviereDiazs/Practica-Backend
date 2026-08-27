# 08 — Testing y debugging

> **Vitest**, no Jest. El scaffold de Nest 12 cambió de runner y los comandos que uno
> recuerda (`jest --watch`, `--testPathPattern`) ya no aplican.

**Depende de**: todos los planes anteriores

---

## Lo que cambió respecto a Nest 10/11

| Antes | Ahora |
|---|---|
| Jest + `ts-jest` | **Vitest 4** |
| `jest.config` en `package.json` | `vitest.config.ts` + `vitest.config.e2e.ts` |
| `jest.fn()` / `jest.spyOn()` | `vi.fn()` / `vi.spyOn()` |
| `--testPathPattern` | `vitest run <patrón>` a secas |
| ESLint | **oxlint** (`npm run lint`) |

**Verificado**: la DI de Nest funciona bajo Vitest sin configuración extra. Vitest 4 usa
rolldown/oxc, que sí soporta `emitDecoratorMetadata` (esbuild no lo hacía, y por eso en
guías viejas se ve el plugin de SWC — acá **no hace falta**).

Los tests usan `globals: true`, así que `describe` / `it` / `expect` están disponibles sin
importar nada. `vi` sí hay que importarlo: `import { vi } from 'vitest'`.

## Comandos

```bash
npm test              # unit, una pasada
npm run test:watch    # modo watch
npm run test:cov      # cobertura (v8)
npm run test:e2e      # e2e con vitest.config.e2e.ts
npm run test:debug    # --inspect-brk --no-file-parallelism
```

---

## 1. Tests unitarios (sin infraestructura)

Corren siempre, sin Docker. Es la ventaja de haber puesto puertos en `domain/`.

`Test.createTestingModule` con los puertos mockeados por su token:

```ts
const module = await Test.createTestingModule({
  providers: [
    AuthService,
    { provide: USER_REPOSITORY, useValue: mockUserRepository },
    { provide: PASSWORD_HASHER, useValue: mockHasher },
    { provide: JwtService, useValue: { signAsync: vi.fn().mockResolvedValue('token') } },
  ],
}).compile();
```

Qué cubrir (casos de borde, no el camino feliz solamente):

| Archivo | Casos |
|---|---|
| `auth.service.spec.ts` | email duplicado → `ConflictError`; password malo → `InvalidCredentialsError`; **email inexistente y password malo devuelven el mismo error** (no filtrar qué emails existen); el hash nunca sale en el DTO |
| `catalog.service.spec.ts` | MISS llama al repo y guarda en caché; HIT **no** llama al repo; `create` invalida la clave |
| `ai-concurrency.limiter.spec.ts` | nunca más de N en paralelo; el permiso se libera aunque la función **lance** (el `finally`) |
| `domain-exception.filter.spec.ts` | cada `DomainError` → su status; un `Error` cualquiera → 500 sin filtrar el stack |

El test del limiter es el más valioso: se lanzan 10 tareas con un contador compartido y se
verifica que el máximo observado nunca supere el límite.

## 2. Test e2e sin base de datos

El truco que hace que valga la pena toda la arquitectura:

```ts
const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(USER_REPOSITORY)
  .useClass(InMemoryUserRepository)
  .compile();
```

Se levanta la app **entera** (pipes, guards, filtros, rutas reales) pero con el repositorio
en memoria. Corre en milisegundos y no necesita Postgres.

`test/auth.e2e-spec.ts` con supertest:

1. `POST /auth/register` → 201 con token
2. Repetir el mismo email → 409
3. `POST /auth/login` correcto → 200
4. `POST /auth/login` con password malo → 401
5. `GET /auth/me` con token → 200 y **sin** `passwordHash` en el body
6. `GET /auth/me` sin token → 401
7. `POST /auth/register` con email inválido → 400 (prueba el `ValidationPipe` global)

⚠️ ESM: los imports en los specs llevan `.js`
(`from '../src/app.module.js'`), igual que en el resto del proyecto.

## 3. Test e2e con infraestructura (opcional)

Documentar cómo correr el e2e completo contra Docker, pero **no** hacerlo el default: si
depende de Docker, tarde o temprano se rompe y deja de correrse.

```bash
docker compose up -d
npm run test:e2e
```

---

## 4. Debugging

Lo que hay que tener resuelto **antes** de mañana, porque perder 20 minutos peleando con el
debugger en la prueba es fatal.

### La app

```bash
npm run start:debug        # nest start --debug --watch → inspector en :9229
```

`.vscode/launch.json`:

```jsonc
{
  "type": "node",
  "request": "attach",
  "name": "Attach to Nest",
  "port": 9229,
  "restart": true,          // se reengancha tras cada recarga del --watch
  "skipFiles": ["<node_internals>/**", "**/node_modules/**"]
}
```

Los breakpoints funcionan sobre el `.ts` porque el scaffold ya trae `sourceMap: true`.

### Los tests

```bash
npm run test:debug         # vitest --inspect-brk --no-file-parallelism
```

`--no-file-parallelism` es obligatorio: sin eso los workers de Vitest corren en paralelo y
los breakpoints se comportan de forma errática.

### Un worker_thread

Los `worker_threads` del plan 06 **no** heredan el inspector. Para depurarlos hay que
arrancar con `--inspect` y adjuntarse al hilo desde la lista de targets de Chrome DevTools.
Alternativa pragmática, y suficiente para mañana: logs dentro del worker.

---

## Verificación

```bash
npm test        # todo verde, sin Docker corriendo
npm run test:e2e
npm run test:cov
npm run lint
```

Prueba real del debugging: poner un breakpoint en `AuthService.login`, correr
`npm run start:debug`, adjuntarse desde VS Code y hacer un login → tiene que parar ahí.
