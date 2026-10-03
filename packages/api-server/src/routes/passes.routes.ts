import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getApplePassDownload } from '../services/pass-download.service.js';

const paramsSchema = z.object({ serialNumber: z.string().min(1).max(100) });
const querySchema = z.object({ sig: z.string().max(64).default('') });

// Descarga pública de la tarjeta (sin JWT): la autorización es la firma del enlace.
// Los errores (Zod → 400, HttpError → su status) los resuelve el error handler global.
export async function passesRoutes(app: FastifyInstance) {
  // GET /api/v1/passes/:serialNumber/apple?sig=...
  app.get('/:serialNumber/apple', async (request, reply) => {
    const { serialNumber } = paramsSchema.parse(request.params);
    const { sig } = querySchema.parse(request.query);

    const pass = await getApplePassDownload(serialNumber, sig);

    // Con este Content-Type Safari en iOS abre la hoja nativa "Agregar a Apple Wallet"
    return reply
      .type('application/vnd.apple.pkpass')
      .header('Content-Disposition', `attachment; filename="${pass.serialNumber}.pkpass"`)
      .header('Last-Modified', pass.updatedAt.toUTCString())
      // Contiene datos del cliente y el token del pase: que no lo guarde ningún proxy/caché
      .header('Cache-Control', 'no-store, private')
      .header('X-Content-Type-Options', 'nosniff')
      .send(pass.buffer);
  });
}
