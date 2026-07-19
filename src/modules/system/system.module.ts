import { Global, Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Global()
@Module({
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
