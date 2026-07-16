import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global PrismaModule — makes PrismaService injectable in all modules
 * without needing to import it explicitly in each feature module.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
