import { UserBlock } from '../entities/user-block.entity';

export const USER_BLOCK_REPOSITORY = Symbol('UserBlockRepositoryPort');

export interface UserBlockRepositoryPort {
  create(blockerUserId: string, blockedUserId: string): Promise<UserBlock>;
  remove(blockerUserId: string, blockedUserId: string): Promise<void>;
  listBlockedIds(blockerUserId: string): Promise<string[]>;
}
