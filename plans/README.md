# Plan de trabajo — Proyecto de referencia NestJS

## Contexto

Mañana **viernes 28 de agosto de 2026** rindo la prueba técnica de Backend de Jalasoft.
El uso de IA está **prohibido** durante el examen, así que este repositorio es un
**proyecto de referencia** construido hoy: mañana lo consulto para recordar cómo se hace
cada cosa en NestJS, desde crear el proyecto hasta debuggear, testear y ejecutar.

El objetivo no es un producto, es **material de consulta ejecutable**: cada feature debe
correr de verdad y estar documentada con los comandos exactos.

## Estado actual

El scaffold ya está creado en `prototype/` con `@nestjs/cli@12`. Ojo con lo que trae la
versión 12, que **cambió respecto a lo que uno recuerda de Nest 10/11**:

| Aspecto | Valor en este scaffold |
|---|---|
| Módulos | **ESM** (`"type": "module"`) → todos los imports relativos llevan `.js` |
| TypeScript | `module: nodenext`, `target: ES2023`, TS `^6.0.2` |
| Tests | **Vitest 4** (no Jest) — `vitest.config.ts` y `vitest.config.e2e.ts` |
| Linter | **oxlint** (no ESLint) |
| Nest | `@nestjs/core@12.0.1` |
| Node del host | v22.22.2 · Docker Compose v5.1.4 |

Verificado: `npm test` pasa y la DI de Nest funciona bajo Vitest (Vitest 4 usa
rolldown/oxc, que **sí** soporta `emitDecoratorMetadata`; esbuild no lo soportaba y por eso
antes había que meter el plugin de SWC).

Pendiente antes de empezar: `prototype/` tiene un `.git` anidado sin commits — hay que
borrarlo para que el repo de afuera trackee el código.

## Alcance — 6 funcionalidades

1. **Auth** — register, login y un endpoint protegido.
2. **Mensajería** — RabbitMQ, publicar y consumir de un topic.
3. **Tiempo real** — WebSocket Gateway con Socket.IO.
4. **Caché** — Redis, manual y declarativa.
5. **Jobs asíncronos** — cola con límite de concurrencia, semáforo, paralelismo real e IA.
6. **Observabilidad** — OpenTelemetry: trazas, métricas y logs.

## Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Tiempo real | **Socket.IO** (`@nestjs/platform-socket.io`) | SignalR es exclusivo de .NET. Socket.IO es el equivalente más cercano: rooms (≈ *Groups*), broadcast, reconexión automática |
| Persistencia | **PostgreSQL + TypeORM** | `@nestjs/typeorm` es módulo de primera clase; los repositorios encajan con el puerto de `domain/` |
| IA | **Solo mock**, sin SDK real | Corre 100 % offline. Puerto `AiProvider` + `FakeAiProvider` |
| Jobs | **BullMQ + `worker_threads` reales** | Cubre cola, concurrencia y paralelismo de verdad |
| OTel | SDK crudo, **no `nestjs-otel`** | `nestjs-otel` tiene peer `@nestjs/common >= 11 < 12` → incompatible |
| Idioma | Código, commits y README en **inglés** | La guía de Jalasoft lo exige. Estos planes van en español |

## Arquitectura

Monolito modular con arquitectura limpia **por módulo**:

```
src/
├── shared/            ← shared kernel (ver 01-shared-kernel.md)
└── modules/
    └── <modulo>/
        ├── domain/          entidades, interfaces de infraestructura, errores propios
        ├── application/     servicios, interfaces de servicio, DTOs, mappers
        ├── infrastructure/  un directorio por servicio externo
        └── presentation/    controladores, guards, decoradores
```

**Regla de oro**: los módulos **no se importan entre sí**. Se comunican por eventos de
integración in-process (`@nestjs/event-emitter`). Esto es lo que evita que el monolito
modular degenere en un monolito donde ningún módulo es independiente — y es el punto que
más vale la pena defender en un code review.

**Regla del shared kernel**: en `shared/` va solo lo transversal — configuración,
conexiones, errores base, filtros/interceptores globales, observabilidad, event bus.
Nunca entidades de negocio, DTOs ni servicios de un módulo concreto.

## Orden de ejecución

Cada plan es **un commit** (esto también practica el flujo "un user story a la vez" que
pide el examen). Los planes 02–07 dependen del 00 y 01; entre ellos son independientes.

| # | Plan | Qué entrega |
|---|---|---|
| 00 | [Project setup](00-project-setup.md) | Dependencias, Docker Compose, `.env`, limpieza |
| 01 | [Shared kernel](01-shared-kernel.md) | Config validada, DB, errores, filtros, event bus |
| 02 | [Auth](02-auth.md) | US1 — register / login / me |
| 03 | [Messaging (RabbitMQ)](03-messaging-rabbitmq.md) | US2 — topic exchange, ack manual |
| 04 | [Realtime (Socket.IO)](04-realtime-websockets.md) | US3 — gateway con rooms |
| 05 | [Caching](05-caching.md) | US4 — caché manual y declarativa |
| 06 | [Async jobs](06-async-jobs.md) | US5 — BullMQ + semáforo + worker_threads + IA |
| 07 | [Observability](07-observability.md) | US6 — trazas, métricas y logs |
| 08 | [Testing](08-testing.md) | Unit + e2e con Vitest |
| 09 | [Documentation](09-documentation.md) | El README de consulta para mañana |

## Cómo ejecutar comandos en este entorno

Esta sesión de Claude corre dentro del sandbox Flatpak de VS Code, donde **no hay `node`
ni `docker`**. Hay que salir al host con `host-spawn`:

```sh
/app/bin/host-spawn --no-pty sh -c 'cd "/home/javier/Documentos/Jala University/Practica prueba tecnica/Practica-Backend/prototype" && <comando>'
```

El `cd` va dentro del `sh -c` porque `host-spawn` resetea el cwd.

En una terminal normal (fuera del sandbox) los comandos son los de siempre.
