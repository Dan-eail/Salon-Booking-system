import argon2 from 'argon2';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../db/schema.js';

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);

export type AccessPayload = { sub: string; role: Role };

export function signAccessToken(p: AccessPayload): string {
  return jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] });
}
export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

/** Human-friendly unique booking reference, e.g. BE-7K3Q9M2X */
export function bookingReference(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `BE-${out}`;
}
