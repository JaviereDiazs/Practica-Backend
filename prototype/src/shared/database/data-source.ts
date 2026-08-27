import 'dotenv/config';
import { DataSource } from 'typeorm';

// Standalone DataSource for the TypeORM CLI (migration:generate/run/revert).
// Nest's TypeOrmModule (see database.module.ts) is configured separately —
// this file only exists because the CLI can't read Nest's DI container.
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['src/**/*.orm-entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
