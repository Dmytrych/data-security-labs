import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random bearer token. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored, so a leaked sessions table can't be replayed as live tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
