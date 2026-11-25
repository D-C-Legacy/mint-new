import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../platform/database/prisma.service';
import { UserBlockRepositoryPort } from '../../domain/ports/user-block.repository.port';
import { UserBlock } from '../../domain/entities/user-block.entity';
import { toDomainUserBlock } from '../mappers/user-block.mapper';

@Injectable()
export class UserBlockPrismaRepository implements UserBlockRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(blockerUserId: string, blockedUserId: string): Promise<UserBlock> {
    const row = await this.prisma.userBlock.upsert({
      where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } },
      create: { blockerUserId, blockedUserId },
      update: {},
    });
    return toDomainUserBlock(row);
  }

  async remove(blockerUserId: string, blockedUserId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({ where: { blockerUserId, blockedUserId } });
  }

  async listBlockedIds(blockerUserId: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerUserId },
      select: { blockedUserId: true },
    });
    return rows.map((row) => row.blockedUserId);
  }
}
