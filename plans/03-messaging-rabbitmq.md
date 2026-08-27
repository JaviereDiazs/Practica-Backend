# 03 — US2: Mensajería con RabbitMQ

> Publicar y consumir mensajes de un **topic** específico usando el transporte RMQ de
> `@nestjs/microservices`, con acknowledgment manual.

**Depende de**: [00](00-project-setup.md), [01](01-shared-kernel.md)
**Se conecta con**: [04](04-realtime-websockets.md) vía event bus (sin importarse)

---

## Estructura

```
src/shared/messaging/
├── messaging.module.ts        # ClientsModule.registerAsync → cliente RMQ inyectable
└── messaging.constants.ts     # RMQ_CLIENT token, exchange, routing keys

src/modules/messaging/
├── messaging.module.ts
├── domain/
│   ├── entities/notification.ts
│   └── repositories/notification-log.repository.ts   # interface + token
├── application/
│   ├── dto/publish-notification.dto.ts
│   ├── mappers/notification.mapper.ts
│   └── services/notification.service.ts
├── infrastructure/
│   ├── rabbitmq/rabbitmq-notification-publisher.ts   # implements NotificationPublisher
│   └── persistence/in-memory-notification-log.repository.ts
└── presentation/
    ├── notifications.controller.ts        # POST /messaging/publish, GET /messaging/received
    └── notifications.consumer.ts          # @EventPattern — el "controlador" del microservicio
```

`shared/messaging/` guarda **solo la conexión y las constantes**. La lógica de qué se
publica y qué se hace al recibirlo vive en el módulo.

---

## 1. Topic exchange

Lo que pide la US es enviar y recibir de "un tópico específico". En RabbitMQ eso es un
**topic exchange** con routing keys tipo `notifications.user.created`, y consumidores que se
suscriben con comodines (`notifications.*`, `notifications.#`).

En Nest esto se habilita con **`wildcards: true`** en las opciones del transporte. Sin ese
flag, el transporte RMQ de Nest usa una cola directa y los patrones son literales.

## 2. Consumidor — `main.ts`

La app es **HTTP y microservicio a la vez** (patrón híbrido): un solo proceso sirve REST y
consume de RabbitMQ.

```ts
const app = await NestFactory.create(AppModule);

app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.RMQ,
  options: {
    urls: [config.rabbitmq.url],
    exchange: config.rabbitmq.exchange,
    exchangeType: 'topic',
    wildcards: true,              // ← habilita el topic exchange
    queue: config.rabbitmq.queue,
    queueOptions: { durable: true },
    noAck: false,                 // ← ack manual
    prefetchCount: 10,
  },
});

await app.startAllMicroservices();
await app.listen(config.app.port);
```

`prefetchCount` limita cuántos mensajes sin confirmar recibe el consumidor a la vez — el
control de flujo de RabbitMQ. Vale la pena mencionarlo en el code review.

## 3. Productor

`ClientsModule.registerAsync([{ name: RMQ_CLIENT, transport: Transport.RMQ, options: {...} }])`
con **las mismas opciones** (`exchange`, `exchangeType`, `wildcards`).

En `RabbitMqNotificationPublisher`:

```ts
this.client.emit(`notifications.${topic}`, payload);
```

**`emit` vs `send`** — la otra pregunta clásica:
- `emit()` → evento fire-and-forget, no espera respuesta. Es lo que corresponde acá.
- `send()` → request/reply, devuelve un `Observable` y espera respuesta por la `replyQueue`.

## 4. Consumidor — handler

```ts
@Controller()
export class NotificationsConsumer {
  @EventPattern('notifications.*')
  async handle(@Payload() data: NotificationPayload, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.service.registerIncoming(context.getPattern(), data);
      channel.ack(originalMsg);
    } catch (error) {
      channel.nack(originalMsg, false, false);   // a la DLQ, sin requeue infinito
    }
  }
}
```

**Ack manual** (`noAck: false`): el mensaje solo se borra de la cola cuando el
procesamiento terminó bien. Si el proceso muere a mitad, RabbitMQ lo reentrega. Con ack
automático se perdería.

`nack(msg, false, false)` con `requeue: false` evita el bucle infinito de un mensaje
envenenado.

## 5. Puente hacia el módulo de tiempo real

Después del `ack`, el servicio emite un evento **in-process**:

```ts
this.eventEmitter.emit(INTEGRATION_EVENTS.NOTIFICATION_RECEIVED, {
  topic, payload, receivedAt: new Date(),
});
```

El módulo `realtime` lo escucha. **`messaging` no importa `realtime`, ni al revés.**
Si mañana el WebSocket se va a otro servicio, este módulo no cambia una línea.

## 6. Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/messaging/publish` | body `{ topic, message }` → `emit('notifications.<topic>', ...)`, responde `202` |
| `GET` | `/messaging/received` | últimos N mensajes consumidos (log en memoria) |

`GET /messaging/received` existe para poder **demostrar** que el consumo funcionó sin tener
que leer logs en la demo.

---

## Verificación

```bash
docker compose up -d rabbitmq

curl -X POST localhost:3000/messaging/publish \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"topic":"user.created","message":"hello from rabbit"}'
# → 202

curl localhost:3000/messaging/received -H "Authorization: Bearer $TOKEN"
# → el mensaje, con topic "notifications.user.created"
```

En la UI (<http://localhost:15672>, guest/guest):
1. **Exchanges** → existe `notifications` de tipo `topic`.
2. **Queues** → `notifications_queue` bindeada con la routing key correcta, y el contador de
   mensajes sube y vuelve a cero (se consumieron y confirmaron).

Prueba del ack manual: publicar un mensaje que haga fallar el handler a propósito y
comprobar que **no** desaparece silenciosamente.

Prueba del comodín: publicar en `user.created` y en `order.paid` — el mismo consumidor
(`notifications.*`) recibe ambos.
