import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** Hex-encoded scrypt hash and its salt, as stored in `credentials`. */
export interface PasswordHash {
  hash: string;
  salt: string;
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES);
  return { hash: key.toString('hex'), salt: salt.toString('hex') };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const expected = Buffer.from(stored.hash, 'hex');
  const actual = await scryptAsync(password, Buffer.from(stored.salt, 'hex'), expected.length);
  // Constant-time comparison so response timing doesn't leak how much of the hash matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
