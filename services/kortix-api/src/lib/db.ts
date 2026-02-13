import { createDb } from '@kortix/db';
import { config } from '../config';

if (!config.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export const db = createDb(config.DATABASE_URL);
