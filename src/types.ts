import type { Timestamp } from 'firebase/firestore';

export enum ArticleStatus {
  Draft = 'Draft',
  Queued = 'Queued',
  GenerationFailed = 'GenerationFailed',
  AwaitingExpertReview = 'AwaitingExpertReview',
  AwaitingAdminReview = 'AwaitingAdminReview',
  NeedsRevision = 'NeedsRevision',
  Published = 'Published',
}

export type ArticleType = 'Trending Topic' | 'Positive News' | 'Misinformation';

export interface UserProfile {
  uid: string;
  email: string;
  role: 'Admin' | 'Expert';
  displayName: string;
  showNameToPublic: boolean;
  categories?: string[]; // Experts can be in multiple categories
  status: 'active' | 'disabled'; // Added for enabling/disabling users
}

export interface Article {
  id: string;
  title: string;
  articleType: ArticleType; // New field to categorize content
  categories: string[];
  region?: string;
  shortDescription?: string;
  flashContent?: string;
  deepDiveContent?: string;
  imagePrompt?: string;
  imageUrl?: string;
  status: ArticleStatus;
  createdAt: Timestamp;
  publishedAt?: Timestamp;
  discoveredAt?: Timestamp;
  expertId?: string;
  expertDisplayName?: string;
  expertShowNameToPublic?: boolean;
  adminRevisionNotes?: string;
  likeCount?: number;
  sourceUrl?: string; // For Positive News attribution
  sourceTitle?: string; // For Positive News attribution
}

export interface SuggestedTopic {
    id: string;
    title: string;
    shortDescription: string;
    categories: string[];
    articleType: ArticleType;
    region: string;
    createdAt: Timestamp;
    sourceUrl?: string;
    sourceTitle?: string;
}
