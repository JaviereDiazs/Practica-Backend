# 04 — US3: Comunicación en tiempo real

> El requisito original decía **SignalR**, que es exclusivo de .NET. El equivalente en el
> mundo Node es un **WebSocket Gateway con Socket.IO**: rooms (≈ *Groups* de SignalR),
> broadcast, reconexión automática y fallback a long-polling.

**Depende de**: [00](00-project-setup.md), [01](01-shared-kernel.md), [02](02-auth.md)
**Se alimenta de**: [03](03-messaging-rabbitmq.md) y [06](06-async-jobs.md), vía event bus

---

## Cómo explicarlo mañana

| SignalR (.NET) | Socket.IO + Nest |
|---|---|
| `Hub` | `@WebSocketGateway()` |
| `[HubMethodName]` / método público del hub | `@SubscribeMessage('evento')` |
| `Groups.AddToGroupAsync(id, "room")` | `client.join('room')` |
| `Clients.Group("room").SendAsync(...)` | `server.to('room').emit(...)` |
| `Clients.All.SendAsync(...)` | `server.emit(...)` |
| `OnConnectedAsync` / `OnDisconnectedAsync` | `OnGatewayConnection` / `OnGatewayDisconnect` |
| Negociación con fallback | Fallback automático a HTTP long-polling |

---

## Estructura

```
src/modules/realtime/
├── realtime.module.ts
├── domain/
│   └── entities/realtime-client.ts          # userId, socketId, rooms
├── application/
│   ├── dto/subscribe.dto.ts
│   └── services/realtime.service.ts         # registro de conexiones, quién está en qué room
├── infrastructure/
│   └── socketio/socket-io-broadcaster.ts    # implements Broadcaster (puerto de domain)
└── presentation/
    ├── gateways/notifications.gateway.ts
    └── listeners/integration-events.listener.ts
```

El gateway vive en `presentation/` porque es exactamente eso: un punto de entrada, el
equivalente WebSocket de un controller.

---

## 1. El gateway

```ts
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: '*' },        // solo para la demo local
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  // ...
}
```

Sin puerto explícito → comparte el puerto del servidor HTTP (3000). Es lo que se quiere:
un solo puerto para REST y WS.

## 2. Autenticación en el handshake

El header `Authorization` no viaja de forma confiable en un handshake de WebSocket, así que
el token va en `handshake.auth.token` (el cliente lo manda con
`io(url, { auth: { token } })`).

```ts
async handleConnection(client: Socket) {
  try {
    const token = client.handshake.auth?.token;
    client.data.user = await this.jwt.verifyAsync(token);
    this.realtime.register(client.data.user.sub, client.id);
  } catch {
    client.disconnect(true);      // conexión no autenticada, fuera
  }
}
```

Reutiliza el `JwtService` del plan 02 — no se duplica lógica de verificación.

> Alternativa a mencionar: un `WsJwtGuard` con `@UseGuards()` sobre cada
> `@SubscribeMessage`. Validar en `handleConnection` es más simple y rechaza antes.

## 3. Rooms

```ts
@SubscribeMessage('subscribe')
handleSubscribe(@MessageBody() dto: SubscribeDto, @ConnectedSocket() client: Socket) {
  client.join(dto.room);
  return { event: 'subscribed', data: { room: dto.room } };   // ack al cliente
}
```

Devolver un objeto `{ event, data }` desde el handler hace que Nest emita esa respuesta al
cliente — el acuse de recibo.

Rooms que se usan en la demo:
- `notifications` → mensajes que llegan de RabbitMQ (plan 03)
- `job:<jobId>` → progreso de un job concreto (plan 06)

## 4. El puente con los otros módulos

```ts
@Injectable()
export class IntegrationEventsListener {
  constructor(private readonly gateway: NotificationsGateway) {}

  @OnEvent(INTEGRATION_EVENTS.NOTIFICATION_RECEIVED)
  onNotification(event: NotificationReceivedEvent) {
    this.gateway.broadcastTo('notifications', 'notification', event);
  }

  @OnEvent(INTEGRATION_EVENTS.JOB_PROGRESS_UPDATED)
  onJobProgress(event: JobProgressUpdatedEvent) {
    this.gateway.broadcastTo(`job:${event.jobId}`, 'job:progress', event);
  }
}
```

**Este archivo es la única puerta de entrada de otros módulos a `realtime`.** No hay
`import { MessagingService }` en ninguna parte. Es la pieza que hace que el monolito sea
modular de verdad.

## 5. Cliente de prueba

`public/realtime-client.html`: una página con el CDN de socket.io, un input para el token,
un botón para suscribirse a una room y un `<pre>` donde se van imprimiendo los eventos.

Sirve para demostrar la feature sin escribir frontend, y mañana funciona como referencia de
**cómo se conecta un cliente** (que es lo que preguntan).

Se sirve con `app.useStaticAssets()` de `NestExpressApplication`, o simplemente se abre el
archivo directo desde el disco (por eso el CORS abierto).

---

## Verificación

1. Abrir `public/realtime-client.html`, pegar el token del plan 02, conectar.
   → en los logs del servidor aparece `handleConnection` con el `userId`.
2. Conectar **sin** token o con uno inválido → el servidor desconecta al instante.
3. Suscribirse a la room `notifications`.
4. `POST /messaging/publish` (plan 03) → el mensaje aparece en la página **en vivo**.
5. Abrir una segunda pestaña sin suscribirse a la room → **no** recibe nada
   (prueba de que el room-scoping funciona y no es un broadcast a todos).
6. Matar el servidor y volver a levantarlo → el cliente se reconecta solo.
