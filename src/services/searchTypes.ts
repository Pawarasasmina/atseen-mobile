import type { User } from '../types';

export type SearchType = 'all' | 'people' | 'seens' | 'experiences' | 'worlds' | 'wall_notes';
export type SearchHit = {
  id: string; type: string; title: string; subtitle?: string; description?: string;
  image?: string; route?: string; verified?: boolean;
  metadata?: { username?: string; orbitStatus?: string; creator?: User; author?: User; kind?: string };
};
export type SearchSection = { items: SearchHit[]; total?: number; nextCursor?: string | null };
export type SearchResults = SearchSection & { sections?: Partial<Record<SearchType, SearchSection>> };
export type SearchDefaults = { sections?: Partial<Record<SearchType, SearchSection>>; trending?: { label: string }[]; recent?: { id: string; query: string; selectedType?: SearchType }[] };
