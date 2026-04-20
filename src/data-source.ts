import 'dotenv/config';
import { DataSource } from 'typeorm';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error('DATABASE_URL is not set');
}

const u = new URL(dbUrl);

export default new DataSource({
  type: 'postgres',
  host: u.hostname,
  port: Number(u.port || 5432),
  username: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace('/', '') || 'postgres',
  ssl: { rejectUnauthorized: false },
  extra: { ssl: { rejectUnauthorized: false } },
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
