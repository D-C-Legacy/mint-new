import { z } from 'zod';

export const BlockUserSchema = z
  .object({
    userId: z.string().min(1),
  })
  .strict();

export type BlockUserDto = z.infer<typeof BlockUserSchema>;
