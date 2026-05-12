import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export const prisma = new PrismaClient();

const ADJECTIVES = ['Dark', 'Light', 'Fast', 'Silent', 'Golden', 'Silver', 'Iron', 'Crystal', 'Shadow', 'Neon'];
const NOUNS = ['Wolf', 'Tiger', 'Eagle', 'Falcon', 'Panther', 'Dragon', 'Shark', 'Viper', 'Ghost', 'Phantom'];

export function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = crypto.randomInt(1000, 9999);
  return `#${adj}${noun}${num}`;
}

export function generateAccessKey(): string {
  return crypto.randomBytes(12).toString('hex');
}
