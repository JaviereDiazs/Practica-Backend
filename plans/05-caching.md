# 05 — US4: Manejo de caché

> Los **dos** estilos de caché de Nest en un mismo módulo, a propósito, porque son los dos
> que te pueden pedir: la declarativa con interceptor y la manual con `CACHE_MANAGER`.

**Depende de**: [00](00-project-setup.md), [01](01-shared-kernel.md)

---

## Ojo: la API cambió en Nest 11/12

`@nestjs/cache-manager@12` corre sobre `cache-manager@7`, que se reescribió encima de
**Keyv**. Lo que uno recuerda de versiones viejas ya no aplica:

| Antes (cache-manager 5) | Ahora (cache-manager 7) |
|---|---|
| `store: redisStore` | `stores: [new KeyvRedis(url)]` |
| `ttl` en **segundos** | `ttl` en **milisegundos** |
| `cacheManager.reset()` | `cacheManager.clear()` |
| un solo store | **array** de stores en cascada (L1 → L2) |

## Configuración — `src/shared/cache/cache.module.ts`

```ts
CacheModule.registerAsync({
  isGlobal: true,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    stores: [
      new Keyv({ store: new KeyvCacheableMemory({ ttl: 60_000, lruSize: 5000 }) }),
      new KeyvRedis(config.get('REDIS_URL')),
    ],
    ttl: config.get('CACHE_TTL_MS'),
  }),
})
```

Los dos stores en cascada son **L1 en memoria + L2 en Redis**: lee de memoria primero y
solo pega a Redis si falla. Vale la pena señalarlo — es gratis y se nota.

`isGlobal: true` porque el caché es infraestructura transversal, va en el shared kernel.

---

## Módulo de demostración

Un CRUD mínimo de productos. Lo importante no es el CRUD sino el caché encima.

```
src/modules/catalog/
├── catalog.module.ts
├── domain/
│   ├── entities/product.ts
│   └── repositories/product.repository.ts
├── application/
│   ├── dto/{create-product,product-response}.dto.ts
│   ├── mappers/product.mapper.ts
│   └── services/catalog.service.ts          # ← caché MANUAL
├── infrastructure/persistence/typeorm/
│   ├── product.orm-entity.ts
│   └── typeorm-product.repository.ts
└── presentation/catalog.controller.ts       # ← caché DECLARATIVA
```

## Estilo A — declarativa (en el controller)

```ts
@Get('products/:id')
@UseInterceptors(CacheInterceptor)
@CacheKey('product')
@CacheTTL(30_000)
findOne(@Param('id') id: string) { ... }
```

Cero código, ideal para GETs simples.

**Limitaciones que hay que saber** (salen en el code review):
- Solo cachea `GET`.
- No funciona si el handler inyecta `@Res()`.
- La clave por defecto es la URL; con `@CacheKey` fija se pierde el parámetro, así que para
  rutas con `:id` hay que extender `CacheInterceptor` y sobrescribir `trackBy()`.
- **No se invalida sola** al escribir.

## Estilo B — manual (en el service)

Es el que se usa para `GET /catalog/products` y el que da control real:

```ts
async findAll(): Promise<ProductResponseDto[]> {
  const cached = await this.cache.get<ProductResponseDto[]>(PRODUCTS_CACHE_KEY);
  if (cached) {
    this.logger.debug('cache HIT products:all');
    this.metrics.cacheHit('products');
    return cached;
  }

  this.logger.debug('cache MISS products:all');
  this.metrics.cacheMiss('products');
  const products = (await this.repository.findAll()).map(ProductMapper.toDto);
  await this.cache.set(PRODUCTS_CACHE_KEY, products, this.ttl);
  return products;
}

async create(dto: CreateProductDto): Promise<ProductResponseDto> {
  const saved = await this.repository.save(ProductMapper.fromDto(dto));
  await this.cache.del(PRODUCTS_CACHE_KEY);      // ← invalidación explícita
  return ProductMapper.toDto(saved);
}
```

Inyección:

```ts
constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}
```

(`Cache` se importa de `'cache-manager'`, no de `@nestjs/cache-manager`.)

Los logs de HIT/MISS existen para poder **mostrar** que el caché funciona durante la demo.

### La decisión que hay que poder defender

> "Uso el interceptor para lecturas simples de un recurso, y el `CACHE_MANAGER` cuando
> necesito invalidar al escribir o cachear algo que no es una respuesta HTTP completa. La
> invalidación es el problema difícil, y el interceptor no la resuelve."

---

## Verificación

```bash
docker compose up -d redis

curl localhost:3000/catalog/products     # 1ª vez → MISS en los logs, ~50ms
curl localhost:3000/catalog/products     # 2ª vez → HIT, ~2ms

curl -X POST localhost:3000/catalog/products \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Laptop","price":1200}'

curl localhost:3000/catalog/products     # → MISS de nuevo (se invalidó), con el producto nuevo
```

En Redis:

```bash
docker compose exec redis redis-cli KEYS '*'
docker compose exec redis redis-cli TTL 'products:all'   # el TTL va bajando
```

Prueba del L1: apagar Redis (`docker compose stop redis`) y comprobar que las lecturas
recientes **siguen respondiendo** desde el store en memoria.
