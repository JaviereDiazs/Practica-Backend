import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppConfigModule } from './shared/config/app-config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { EventsModule } from './shared/events/events.module.js';
import { LoggingInterceptor } from './shared/presentation/interceptors/logging.interceptor.js';
import { HealthController } from './shared/presentation/health.controller.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, EventsModule],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
})
export class AppModule {}
