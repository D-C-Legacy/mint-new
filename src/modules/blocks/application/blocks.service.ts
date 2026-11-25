import { Inject, Injectable } from '@nestjs/common';
import { Result, Ok, Err } from '../../../shared/result/result';
import {
  USER_BLOCK_REPOSITORY,
  UserBlockRepositoryPort,
} from '../domain/ports/user-block.repository.port';
import { CannotBlockSelfError } from '../domain/errors/blocks.errors';
import { ReportsService } from '../../reports/application/reports.service';

// Standalone apart from ReportsService (one-directional: blocks imports reports, reports never
// imports blocks back, so no circular DI) — no import of identity/chat otherwise. Enforcement
// (hiding a blocked user's chat messages) happens client-side off `listBlockedIds`, not server-side
// fan-out filtering — real but light-weight, matching this app's current scale
// (06-REALTIME-AND-CONCURRENCY.md never specs per-socket filtered emits, and adding that is a
// bigger realtime change than this ticket needs).
@Injectable()
export class BlocksService {
  constructor(
    @Inject(USER_BLOCK_REPOSITORY) private readonly blocks: UserBlockRepositoryPort,
    private readonly reports: ReportsService,
  ) {}

  async block(
    blockerUserId: string,
    blockedUserId: string,
  ): Promise<Result<void, CannotBlockSelfError>> {
    if (blockerUserId === blockedUserId) {
      return Err(new CannotBlockSelfError());
    }
    await this.blocks.create(blockerUserId, blockedUserId);
    // Apple Guideline 1.2: blocking must be visible to the developer/moderation side, not only
    // enforced locally on the blocker's device. Reuses the existing report queue rather than a
    // separate admin surface — no action is required on this "report" (it's not user-submitted
    // and nothing in the UI resolves it the same way), it just makes the block discoverable.
    await this.reports.create({
      targetType: 'USER',
      targetId: blockedUserId,
      reporterUserId: blockerUserId,
      reason: 'User blocked by another user',
    });
    return Ok(undefined);
  }

  async unblock(blockerUserId: string, blockedUserId: string): Promise<void> {
    await this.blocks.remove(blockerUserId, blockedUserId);
  }

  async listBlockedIds(blockerUserId: string): Promise<string[]> {
    return this.blocks.listBlockedIds(blockerUserId);
  }
}
