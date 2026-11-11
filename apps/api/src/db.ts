import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required. See .env.example.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 10 }) });
}
