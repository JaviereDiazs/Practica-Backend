# 02 — US1: Autenticación y autorización

> `POST /auth/register`, `POST /auth/login` y `GET /auth/me` protegido con JWT.
> Es también el módulo **de referencia** para la arquitectura limpia: los otros cuatro
> repiten esta misma forma.

**Depende de**: [00](00-project-setup.md), [01](01-shared-kernel.md)

---

## Estructura completa (plantilla para el resto de módulos)

```
src/modules/auth/
├── auth.module.ts
├── domain/
│   ├── entities/user.ts                    # clase pura, SIN decoradores de TypeORM
│   ├── repositories/user.repository.ts     # interface + Symbol USER_REPOSITORY
│   ├── services/password-hasher.ts         # interface + Symbol PASSWORD_HASHER
│   └── errors/
│       ├── invalid-credentials.error.ts
│       └── email-already-registered.error.ts
├── application/
│   ├── dto/
│   │   ├── register.dto.ts                 # class-validator
│   │   ├── login.dto.ts
│   │   ├── auth-response.dto.ts
│   │   └── user-profile.dto.ts
│   ├── mappers/user.mapper.ts              # domain ↔ DTO
│   ├── ports/auth-service.interface.ts
│   └── services/auth.service.ts
├── infrastructure/
│   ├── persistence/typeorm/
│   │   ├── user.orm-entity.ts              # @Entity — el mapeo vive AQUÍ
│   │   └── typeorm-user.repository.ts      # implements UserRepository
│   └── crypto/bcrypt-password-hasher.ts    # implements PasswordHasher
└── presentation/
    ├── auth.controller.ts
    ├── guards/jwt-auth.guard.ts
    └── decorators/
        ├── public.decorator.ts
        └── current-user.decorator.ts
```

### La idea que hay que poder explicar

**Entidad de dominio ≠ entidad de TypeORM.** `domain/entities/user.ts` es una clase de
TypeScript sin dependencias: no sabe que existe una base de datos. `user.orm-entity.ts`
tiene los `@Entity()`/`@Column()` y vive en `infrastructure/`. El repositorio traduce entre
las dos.

Cuesta un mapper más, y a cambio: el dominio es testeable sin base de datos, y cambiar de
TypeORM a Prisma toca **un solo archivo**. En el plan 08 se aprovecha esto para correr el
e2e sin Postgres.

La dirección de las dependencias siempre apunta hacia adentro:
`presentation → application → domain ← infrastructure`.

---

## 1. Domain

`user.ts`: `id`, `email`, `passwordHash`, `createdAt`. Sin decoradores.

`user.repository.ts`:

```ts
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
}
```

Se usa un `Symbol` como token porque **las interfaces de TypeScript no existen en runtime**
y no se pueden inyectar. Es la pregunta clásica del code review.

`password-hasher.ts`: mismo patrón, `hash(plain)` / `compare(plain, hash)`. Se mete detrás
de un puerto para que `AuthService` no dependa de `bcrypt`.

## 2. Application

`AuthService` depende **solo de las interfaces de `domain/`** más `JwtService`:

```ts
constructor(
  @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  private readonly jwt: JwtService,
) {}
```

- `register(dto)` → si el email existe, `EmailAlreadyRegisteredError` (→ 409 por el filtro
  del plan 01). Hashea, guarda, devuelve token.
- `login(dto)` → busca por email, compara hash. Si falla cualquiera de los dos,
  `InvalidCredentialsError` con **el mismo mensaje genérico** en ambos casos, para no filtrar
  qué emails están registrados.
- `getProfile(userId)` → `UserProfileDto` vía mapper.

Los DTOs de entrada llevan `class-validator` (`@IsEmail()`, `@MinLength(8)`) y
`@ApiProperty()` para Swagger. Los DTOs de salida **nunca** exponen `passwordHash` — de eso
se encarga el mapper, no un `delete` a mano.

## 3. Infrastructure

`TypeOrmUserRepository`: inyecta `@InjectRepository(UserOrmEntity)` y traduce
ORM entity ↔ domain entity.

`BcryptPasswordHasher`: `bcrypt.hash(plain, 10)` / `bcrypt.compare(...)`.
⚠️ ESM: `bcrypt` es CJS, se importa como `import bcrypt from 'bcrypt'`
(`esModuleInterop` ya está activo en el tsconfig del scaffold).

## 4. Presentation — el guard

**Sin Passport.** La documentación actual de Nest usa un guard propio, que es menos
dependencias y mucho más fácil de explicar.

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) throw new UnauthorizedException();
    try {
      request.user = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

Se registra **global** con `APP_GUARD`, y `register`/`login` se abren con `@Public()`:

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

**Por qué global y no por endpoint**: seguro por defecto. Un endpoint nuevo nace protegido;
hay que abrirlo a propósito. Al revés, se olvida y queda un agujero.

`@CurrentUser()` con `createParamDecorator` para sacar `request.user` sin repetir
`@Req()` en cada handler.

## 5. Módulo

`JwtModule.registerAsync({ global: true, inject: [ConfigService], useFactory })` leyendo
`JWT_SECRET` y `JWT_EXPIRES_IN`.

Wiring de puertos → implementaciones:

```ts
providers: [
  AuthService,
  { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
  { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
]
```

---

## Verificación

```bash
# 1. Registro
curl -X POST localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"javier@test.com","password":"Secret123!"}'
# → 201 { accessToken }

# 2. Registro duplicado
# → 409 { code: "EMAIL_ALREADY_REGISTERED" }

# 3. Login
TOKEN=$(curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"javier@test.com","password":"Secret123!}' | jq -r .accessToken)

# 4. Password incorrecto → 401, mismo mensaje que con email inexistente

# 5. Endpoint protegido
curl localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"   # → 200
curl localhost:3000/auth/me                                     # → 401
curl localhost:3000/auth/me -H "Authorization: Bearer basura"   # → 401
```

Además: confirmar en la base que `password_hash` está hasheado y que **ninguna** respuesta
del API lo devuelve.
