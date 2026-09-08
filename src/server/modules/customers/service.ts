import { z } from 'zod';
import { scoped } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

export const createCustomerSchema = z.object({
  nom: z.string().trim().min(1).max(200),
  telephone: z.string().trim().max(20).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  archive: z.boolean().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export async function createCustomer(businessId: string, input: CreateCustomerInput) {
  const repo = scoped(businessId);
  return repo.customers.create(input);
}

export async function listCustomers(businessId: string, opts: { archive?: boolean } = {}) {
  const repo = scoped(businessId);
  return repo.customers.findMany({
    where: opts.archive === undefined ? undefined : { archive: opts.archive },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCustomer(businessId: string, id: string) {
  const repo = scoped(businessId);
  const customer = await repo.customers.findById(id);
  if (!customer) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Client introuvable.');
  }
  return customer;
}

export async function updateCustomer(businessId: string, id: string, input: UpdateCustomerInput) {
  const repo = scoped(businessId);
  const existing = await repo.customers.findById(id);
  if (!existing) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Client introuvable.');
  }
  await repo.customers.update(id, input);
  return repo.customers.findById(id);
}
