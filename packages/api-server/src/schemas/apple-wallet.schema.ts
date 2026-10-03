import { z } from 'zod';

// Longitudes alineadas con las columnas de la BD (un valor más largo sería un 500 en el insert)
const deviceLibraryIdentifier = z.string().min(1).max(255);
const passTypeIdentifier = z.string().min(1).max(255);
const serialNumber = z.string().min(1).max(100);

export const deviceRegistrationParamsSchema = z.object({
  deviceLibraryIdentifier,
  passTypeIdentifier,
  serialNumber,
});

export const registerDeviceBodySchema = z.object({
  pushToken: z.string().min(1, 'El pushToken es requerido').max(512),
});

export const getSerialNumbersParamsSchema = z.object({
  deviceLibraryIdentifier,
  passTypeIdentifier,
});

export const getSerialNumbersQuerySchema = z.object({
  // Tag opaco que devolvimos antes: microsegundos epoch (entero)
  passesUpdatedSince: z.string().regex(/^\d{1,19}$/, 'passesUpdatedSince inválido').optional(),
});

export const getLatestPassParamsSchema = z.object({
  passTypeIdentifier,
  serialNumber,
});

// Endpoint público: se limita para que nadie pueda inundar los logs
export const appleLogBodySchema = z.object({
  logs: z.array(z.string().max(2000)).max(50),
});
