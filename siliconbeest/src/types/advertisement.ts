import type { Status } from './mastodon';

export type AdvertisementFormat = 'text' | 'image' | 'text_image' | 'status';

export interface Advertisement {
  id: string;
  format: AdvertisementFormat;
  text: string | null;
  image_url: string | null;
  image_alt_text: string;
  link_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: Status | null;
}

export interface AdminAdvertisement extends Omit<Advertisement, 'status'> {
  image_media_attachment_id: string | null;
  status_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type AdvertisementFeedItem =
  | { kind: 'status'; key: string; status: Status }
  | { kind: 'advertisement'; key: string; advertisement: Advertisement };
