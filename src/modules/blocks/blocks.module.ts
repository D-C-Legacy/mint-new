import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module';
import { AuthModule } from '../../platform/auth/auth.module';
import { RateLimitModule } from '../../platform/rate-limit/rate-limit.module';
import { ReportsModule } from '../reports/reports.module';
import { USER_BLOCK_REPOSITORY } from './domain/ports/user-block.repository.port';
import { UserBlockPrismaRepository } from './infra/repositories/user-block.prisma.repository';
import { BlocksService } from './application/blocks.service';
import { BlocksController } from './api/http/blocks.controller';

@Module({
  imports: [DatabaseModule, AuthModule, RateLimitModule, ReportsModule],
  controllers: [BlocksController],
  providers: [
    { provide: USER_BLOCK_REPOSITORY, useClass: UserBlockPrismaRepository },
    BlocksService,
  ],
  exports: [BlocksService],
})
export class BlocksModule {}
