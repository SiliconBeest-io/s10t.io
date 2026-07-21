import type {
  MediaAttachment,
  QuotePolicy,
  Status,
  StatusVisibility,
} from '@/types/mastodon';

export type ComposeDraftInput = {
  content: string;
  objectType: 'Note' | 'Article';
  articleTitle: string;
  articleSummary: string;
  spoilerText: string;
  showContentWarning: boolean;
  visibility: StatusVisibility;
  language: string;
  sensitive: boolean;
  quotePolicy: QuotePolicy;
  mediaAttachments: MediaAttachment[];
  showPoll: boolean;
  pollOptions: string[];
  pollExpiresIn: number;
  pollMultiple: boolean;
  inReplyToId: string | null;
  inReplyToStatus: Status | null;
  quoteId: string | null;
  quoteStatus: Status | null;
};

export type ServerComposeDraft = ComposeDraftInput & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ComposeDraft = ServerComposeDraft & {
  pendingSync: boolean;
};
