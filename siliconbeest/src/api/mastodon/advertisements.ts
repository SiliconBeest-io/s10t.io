import { apiFetch } from '../client';
import type { AdminAdvertisement, Advertisement, AdvertisementFormat } from '@/types/advertisement';

export interface AdvertisementInput {
  format: AdvertisementFormat;
  text?: string | null;
  image_media_attachment_id?: string | null;
  image_alt_text?: string;
  status_ref?: string | null;
  link_url?: string | null;
  enabled?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

export function getAdvertisements(token?: string) {
  return apiFetch<Advertisement[]>('/v1/ads', { token });
}

export function getAdminAdvertisements(token: string) {
  return apiFetch<AdminAdvertisement[]>('/v1/admin/ads', { token });
}

export function createAdvertisement(input: AdvertisementInput, token: string) {
  return apiFetch<AdminAdvertisement>('/v1/admin/ads', {
    method: 'POST',
    token,
    body: { ...input },
  });
}

export function updateAdvertisement(id: string, input: AdvertisementInput, token: string) {
  return apiFetch<AdminAdvertisement>(`/v1/admin/ads/${id}`, {
    method: 'PUT',
    token,
    body: { ...input },
  });
}

export function deleteAdvertisement(id: string, token: string) {
  return apiFetch<Record<string, never>>(`/v1/admin/ads/${id}`, {
    method: 'DELETE',
    token,
  });
}
