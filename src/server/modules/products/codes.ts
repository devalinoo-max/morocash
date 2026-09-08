import { z } from 'zod';
import { scoped } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

export const addCodeSchema = z.object({
  code: z.string().trim().min(1).max(64),
  format: z.enum([
    'EAN13',
    'EAN8',
    'UPCA',
    'UPCE',
    'CODE128',
    'CODE39',
    'ITF14',
    'QR',
    'DATAMATRIX',
    'INTERNE',
  ]),
  origine: z.enum(['GENERE', 'SCANNE', 'PHOTO', 'MANUEL']),
  estPrincipal: z.boolean().default(false),
});

export type AddCodeInput = z.infer<typeof addCodeSchema>;

export async function listCodes(businessId: string, productId: string) {
  const repo = scoped(businessId);
  const product = await repo.products.findById(productId);
  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
  }
  return repo.productCodes.findByProduct(productId);
}

export async function addCode(businessId: string, productId: string, input: AddCodeInput) {
  const repo = scoped(businessId);
  const product = await repo.products.findById(productId);
  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
  }

  const existing = await repo.productCodes.findByCode(input.code);
  if (existing) {
    throw new AppError('CODE_ALREADY_USED', 'Ce code est déjà utilisé dans cette boutique.');
  }

  return repo.productCodes.create({ productId, ...input });
}

export async function removeCode(businessId: string, productId: string, codeId: string) {
  const repo = scoped(businessId);
  const codes = await repo.productCodes.findByProduct(productId);
  if (!codes.some((c) => c.id === codeId)) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Code introuvable pour ce produit.');
  }
  await repo.productCodes.delete(codeId);
}

export async function findProductByCode(businessId: string, code: string) {
  const repo = scoped(businessId);
  const match = await repo.productCodes.findByCode(code);
  if (!match) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Aucun produit ne correspond à ce code.');
  }
  return repo.products.findById(match.productId);
}
