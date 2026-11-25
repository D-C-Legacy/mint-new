import { UserBlock as PrismaUserBlock } from '@prisma/client';
import { UserBlock } from '../../domain/entities/user-block.entity';

export function toDomainUserBlock(row: PrismaUserBlock): UserBlock {
  return {
    blockerUserId: row.blockerUserId,
    blockedUserId: row.blockedUserId,
    createdAt: row.createdAt,
  };
}
