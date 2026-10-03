# Loyalty Wallet SaaS

Plataforma multi-tenant de tarjetas de lealtad digitales para Apple Wallet y Google Wallet.
Especificación en [.spec/spec.md](.spec/spec.md).

## Estructura

```
packages/
  api-server/   API Fastify + Drizzle (PostgreSQL)
  dashboard/    Dashboard B2B (Next.js), pendiente
  staff-pwa/    PWA del cajero (Next.js 16): escanear QR, sellos, premios, inscribir clientes
  pass-engine/  Reservado (la generación de pases vive hoy en api-server)
.spec/          Spec, esquema DBML y contrato OpenAPI
```

## Requisitos

- Node.js 24+
- Docker Desktop (para PostgreSQL de desarrollo)

## Puesta en marcha

```bash
npm install
docker compose up -d   # PostgreSQL 18 en localhost:5433 (usuario/clave/db: loyalty)
cp .env.example .env   # ya apunta al contenedor
npm run db:migrate     # aplica las migraciones de packages/api-server/drizzle
npm run dev:api        # http://localhost:4000/health
npm run dev:staff      # PWA del cajero en http://localhost:3001 (otra terminal)
```

### PWA del cajero (`packages/staff-pwa`)

- Login con contraseña o PIN → escanear el QR de la tarjeta (cámara trasera) o escribir su número →
  registrar la compra (suma sellos) y entregar premios → inscribir clientes nuevos y mostrarles un QR
  para agregar la tarjeta a Apple Wallet.
- La API se configura con `NEXT_PUBLIC_API_URL` en `packages/staff-pwa/.env.local`
  (por defecto `http://localhost:4000`). Al cambiarla hay que volver a compilar.
- La cámara solo funciona en `https` o en `localhost`. Para probar desde un teléfono usa un túnel https
  (p. ej. ngrok) y agrega ese origen a `CORS_ORIGIN` de la API.
- `npm run typecheck` revisa los tipos con `tsc`: TypeScript 7 no expone la API que usa `next build`
  para revisarlos, así que ese chequeo está desactivado en `next.config.ts`.

## Scripts (raíz)

| Script | Qué hace |
|---|---|
| `dev:api` | API en modo watch |
| `build` | Compila todos los paquetes |
| `typecheck` | Revisa tipos en todos los paquetes (código y pruebas) |
| `test` | Ejecuta las pruebas (Vitest) |
| `db:generate` | Genera una migración a partir de `packages/api-server/src/db/schema.ts` |
| `db:migrate` | Aplica las migraciones pendientes |
| `db:push` | Sincroniza el esquema sin migración (solo desarrollo) |
| `db:studio` | Abre Drizzle Studio |
| `db:seed` | Recrea el tenant demo (solo BD local y fuera de producción) |

## Pruebas

```bash
docker compose up -d   # el mismo PostgreSQL de desarrollo
npm test               # o, dentro de packages/api-server: npm run test:watch
```

- Usan una BD propia, `loyalty_test`, que se crea y migra sola. **Nunca tocan la BD de desarrollo**:
  se niegan a correr si el nombre de la BD no termina en `_test`. Otra BD: `TEST_DATABASE_URL`.
- Prueban la API completa con `app.inject()` (hooks, validación, errores, BD real) sin abrir puertos.
- Cada archivo recrea los datos demo (`seedDemoData`) y los archivos corren de uno en uno.
- La prueba de firma del `.pkpass` genera certificados de prueba con `openssl`; si no está instalado, se omite.
- CI (`.github/workflows/ci.yml`) ejecuta `typecheck` y `test` en cada push y pull request.

Antes de dar un cambio por terminado: `npm run typecheck && npm test`.

## Base de datos

El diseño vive en [.spec/database-schema.dbml](.spec/database-schema.dbml) y su implementación en
[schema.ts](packages/api-server/src/db/schema.ts). Si cambias uno, actualiza el otro y corre `npm run db:generate`.
