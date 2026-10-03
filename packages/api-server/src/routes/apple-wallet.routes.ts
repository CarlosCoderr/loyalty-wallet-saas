import type { FastifyInstance } from 'fastify';
import {
  appleLogBodySchema,
  deviceRegistrationParamsSchema,
  getLatestPassParamsSchema,
  getSerialNumbersParamsSchema,
  getSerialNumbersQuerySchema,
  registerDeviceBodySchema,
} from '../schemas/apple-wallet.schema.js';
import {
  assertPassType,
  getLatestPassFile,
  getUpdatablePassSerials,
  registerDeviceForPass,
  unregisterDeviceForPass,
} from '../services/apple-wallet.service.js';

// PassKit Web Service. Se monta con prefijo /api/apple, que es el webServiceURL del pase.
// Rutas públicas: Apple se autentica con "Authorization: ApplePass <token>", no con JWT.
// Los errores (Zod → 400, HttpError → su status) los resuelve el error handler global.
export async function appleWalletRoutes(app: FastifyInstance) {
  // 1. Registrar un dispositivo para recibir push de un pase
  app.post('/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber', async (request, reply) => {
    const params = deviceRegistrationParamsSchema.parse(request.params);
    assertPassType(params.passTypeIdentifier);
    const { pushToken } = registerDeviceBodySchema.parse(request.body);

    const status = await registerDeviceForPass(
      params.deviceLibraryIdentifier,
      params.serialNumber,
      pushToken,
      request.headers.authorization,
    );
    return reply.status(status).send();
  });

  // 2. Seriales de los pases del dispositivo que cambiaron desde passesUpdatedSince
  app.get('/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier', async (request, reply) => {
    const params = getSerialNumbersParamsSchema.parse(request.params);
    assertPassType(params.passTypeIdentifier);
    const { passesUpdatedSince } = getSerialNumbersQuerySchema.parse(request.query);

    const result = await getUpdatablePassSerials(params.deviceLibraryIdentifier, passesUpdatedSince);
    if (!result) return reply.status(204).send();
    return result;
  });

  // 3. Descargar la versión actual del .pkpass
  app.get('/v1/passes/:passTypeIdentifier/:serialNumber', async (request, reply) => {
    const params = getLatestPassParamsSchema.parse(request.params);
    assertPassType(params.passTypeIdentifier);

    const result = await getLatestPassFile(
      params.serialNumber,
      request.headers.authorization,
      request.headers['if-modified-since'],
    );

    reply.header('Last-Modified', result.updatedAt.toUTCString());
    if (result.notModified) return reply.status(304).send();
    return reply.type('application/vnd.apple.pkpass').send(result.buffer);
  });

  // 4. El usuario eliminó el pase del iPhone
  app.delete('/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber', async (request, reply) => {
    const params = deviceRegistrationParamsSchema.parse(request.params);
    assertPassType(params.passTypeIdentifier);

    await unregisterDeviceForPass(params.deviceLibraryIdentifier, params.serialNumber, request.headers.authorization);
    return reply.status(200).send();
  });

  // 5. Logs de diagnóstico que envía iOS cuando algo falla con nuestro web service
  app.post('/v1/log', { bodyLimit: 128 * 1024 }, async (request, reply) => {
    const { logs } = appleLogBodySchema.parse(request.body);
    request.log.warn({ appleLogs: logs }, '📱 Log de diagnóstico desde Apple Wallet');
    return reply.status(200).send();
  });
}
