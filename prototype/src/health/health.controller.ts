import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

// Hand-rolled instead of @nestjs/terminus: its latest release doesn't
// support Nest 12 yet (peer @nestjs/common ^10 || ^11).
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(@Res() res: Response) {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    const healthy = Object.values(checks).every((result) => result === 'ok');
    const status = healthy ? 'ok' : 'degraded';
    const httpStatus = healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(httpStatus).json({ status, checks });
  }
}
