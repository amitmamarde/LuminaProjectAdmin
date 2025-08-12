import { Timestamp } from 'firebase/firestore';

export enum ArticleStatus {
  Draft = 'Draft',
  AwaitingExpertReview = 'AwaitingExpertReview',
  AwaitingAdminReview = 'AwaitingAdminReview',
  NeedsRevision = 'NeedsRevision',
  Published = 'Published',
}

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
  category: string;
  flashContent?: string;
  deepDiveContent?: string;
  imagePrompt?: string;
  imageUrl?: string;
  status: ArticleStatus;
  createdAt: Timestamp;
  publishedAt?: Timestamp;
  expertId?: string;
  expertDisplayName?: string;
  adminRevisionNotes?: string;
  likeCount?: number;
}
