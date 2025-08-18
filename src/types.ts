import type firebase from 'firebase/app';

export enum ArticleStatus {
  Draft = 'Draft',
  AwaitingExpertReview = 'AwaitingExpertReview',
  AwaitingAdminReview = 'AwaitingAdminReview',
  NeedsRevision = 'NeedsRevision',
  Published = 'Published',
}

export type ArticleType = 'Trending Topic' | 'Positive News';

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
  createdAt: firebase.firestore.Timestamp;
  publishedAt?: firebase.firestore.Timestamp;
  expertId?: string;
  expertDisplayName?: string;
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
    createdAt: firebase.firestore.Timestamp;
    sourceUrl?: string;
    sourceTitle?: string;
}
