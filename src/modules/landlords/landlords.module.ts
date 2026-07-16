import { Module } from '@nestjs/common';
import { LandlordsService } from './landlords.service';

@Module({
  providers: [LandlordsService],
  exports: [LandlordsService],
})
export class LandlordsModule {}
