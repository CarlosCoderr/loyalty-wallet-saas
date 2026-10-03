# Loyalty Wallet SaaS

Plataforma multi-tenant de tarjetas de lealtad digitales para Apple Wallet y Google Wallet.
Especificación en [.spec/spec.md](.spec/spec.md).

## Estructura

```
packages/
  api-server/   API Fastify + Drizzle (PostgreSQL)
  dashboard/    Dashboard B2B (Next.js), pendiente
  staff-pwa/    PWA del cajero (Next.js), pendiente
  pass-engine/  Generación de pases Apple/Google, pendiente
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
```

## Scripts (raíz)

| Script | Qué hace |
|---|---|
| `dev:api` | API en modo watch |
| `build` | Compila todos los paquetes |
| `typecheck` | Revisa tipos en todos los paquetes |
| `db:generate` | Genera una migración a partir de `packages/api-server/src/db/schema.ts` |
| `db:migrate` | Aplica las migraciones pendientes |
| `db:push` | Sincroniza el esquema sin migración (solo desarrollo) |
| `db:studio` | Abre Drizzle Studio |

## Base de datos

El diseño vive en [.spec/database-schema.dbml](.spec/database-schema.dbml) y su implementación en
[schema.ts](packages/api-server/src/db/schema.ts). Si cambias uno, actualiza el otro y corre `npm run db:generate`.
