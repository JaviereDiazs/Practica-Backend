import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  authConfig,
  databaseConfig,
  jobsConfig,
  otelConfig,
  rabbitmqConfig,
  redisConfig,
} from './configuration.js';
import { validate } from './env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate,
      cache: true,
      load: [appConfig, databaseConfig, authConfig, redisConfig, rabbitmqConfig, jobsConfig, otelConfig],
    }),
  ],
})
export class AppConfigModule {}
