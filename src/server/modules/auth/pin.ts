import bcrypt from 'bcryptjs';

const PIN_HASH_COST = 12;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_HASH_COST);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
