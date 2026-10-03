# 📄 SPEC-001: Multi-Tenant Digital Loyalty Cards Platform (SaaS)

## 1. Stack Tecnológico
- **Frontend / Dashboard B2B:** Next.js 16 (App Router, TypeScript), Tailwind CSS, Shadcn UI.
- **Staff Validation App (Cajero):** Next.js 16 PWA con lector QR `@zxing/browser` (reemplaza a `html5-qrcode`, sin mantenimiento desde 2023).
- **Backend API Layer:** Node.js (TypeScript) + Fastify (`@fastify/jwt`, `@fastify/cors`) + Zod para validación.
- **Database & ORM:** PostgreSQL (Multi-tenant isolation por `tenant_id`) + Drizzle ORM.
- **Queue & Background Jobs:** Redis + BullMQ.
- **Core Wallet Engines:**
  - Apple Wallet: `passkit-generator` + Certificados Apple WWDR + APNs.
  - Google Wallet: `@googleapis/walletobjects` + Service Account Credentials.

## 2. Reglas de Negocio Clave
1. **Modelos de Emisión de Sellos:**
   - Por Monto Gastado: 1 sello por cada $X consumidos.
   - Por Visita: 1 sello por visita (opción a umbral mínimo de compra).
2. **Premios y Canje:**
   - Definición de producto/servicio gratis o crédito de descuento aplicable.
3. **Mantenimiento Multi-Tenant:**
   - Todos los registros obligatoriamente enlazados a `tenant_id`.