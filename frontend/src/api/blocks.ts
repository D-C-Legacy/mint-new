import { api } from './index';

// /v1/me/blocks — not in 05-API-SPEC.md, a user-directed addition (Apple guideline 1.2: a viewer
// must be able to block an abusive user in live chat). Blocking is enforced client-side: a blocked
// user's messages are filtered out of the chat render, see useLiveChat.ts.
export function listBlockedUserIds(): Promise<string[]> {
  return api.request<{ blockedUserIds: string[] }>('/me/blocks').then((res) => res.blockedUserIds);
}

export function blockUser(userId: string): Promise<unknown> {
  return api.request('/me/blocks', { method: 'POST', body: { userId } });
}

export function unblockUser(userId: string): Promise<unknown> {
  return api.request(`/me/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
