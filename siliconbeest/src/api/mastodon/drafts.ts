import { apiFetch } from '../client';
import type { ComposeDraftInput, ServerComposeDraft } from '@/types/drafts';

export function getDrafts(token: string) {
  return apiFetch<ServerComposeDraft[]>('/v1/drafts', { token });
}

export function putDraft(
  id: string,
  revision: number,
  draft: ComposeDraftInput,
  token: string,
) {
  return apiFetch<ServerComposeDraft>(`/v1/drafts/${encodeURIComponent(id)}`, {
    token,
    method: 'PUT',
    body: { revision, draft },
  });
}

export function deleteDraft(id: string, token: string) {
  return apiFetch<Record<string, never>>(`/v1/drafts/${encodeURIComponent(id)}`, {
    token,
    method: 'DELETE',
  });
}
