import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    // Validate database connectivity on startup
    await this.$connect();
  }

  /**
   * Safely disconnect Prisma on application shutdown.
   * Registered automatically via NestJS lifecycle hooks.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
