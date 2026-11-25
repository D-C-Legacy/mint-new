import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { BlocksService } from '../../application/blocks.service';
import { ZodValidationPipe } from '../../../../platform/validation/zod-validation.pipe';
import { JwtGuard, AuthenticatedUser } from '../../../../platform/auth/jwt.guard';
import { CurrentUser } from '../../../../platform/auth/current-user.decorator';
import { DefaultRateLimitGuard } from '../../../../platform/rate-limit/default-rate-limit.guard';
import { toHttpException } from '../../../../shared/errors/to-http-exception';
import { BlockUserSchema, BlockUserDto } from './dto/block-user.dto';

// Not in 05-API-SPEC.md — user-directed addition (Apple guideline 1.2: a viewer must be able to
// block an abusive user in live chat, not just report content). Paths sit under /me, same as
// account-deletion. Enforcement is client-side: a client fetches GET /me/blocks once and filters
// its own chat render off the id list — see useLiveChat.ts on the frontend.
@Controller('me/blocks')
@UseGuards(JwtGuard, DefaultRateLimitGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  async list(@CurrentUser() current: AuthenticatedUser): Promise<{ data: unknown }> {
    const blockedUserIds = await this.blocks.listBlockedIds(current.id);
    return { data: { blockedUserIds } };
  }

  @Post()
  @HttpCode(200)
  async block(
    @Body(new ZodValidationPipe(BlockUserSchema)) dto: BlockUserDto,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<{ data: unknown }> {
    const result = await this.blocks.block(current.id, dto.userId);
    if (!result.ok) throw toHttpException(result.error);
    return { data: { blocked: true } };
  }

  @Delete(':userId')
  async unblock(
    @Param('userId') userId: string,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<{ data: unknown }> {
    await this.blocks.unblock(current.id, userId);
    return { data: { blocked: false } };
  }
}
