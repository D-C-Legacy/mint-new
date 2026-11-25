export interface UserBlock {
  readonly blockerUserId: string;
  readonly blockedUserId: string;
  readonly createdAt: Date;
}
