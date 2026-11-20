import type { WallPost } from '../types';

export const wallNeeds = [
  { key: 'right_now', label: 'Right now', value: 'Right Now', icon: 'radio-button-on', field: 'type' },
  { key: 'meet_people', label: 'Company', value: 'Meet people', icon: 'people-outline', field: 'topic' },
  { key: 'need_help', label: 'Need help', value: 'Need Help', icon: 'help-buoy-outline', field: 'type' },
  { key: 'looking_for', label: 'Looking for', value: 'Looking for', icon: 'search-outline', field: 'type' },
  { key: 'buy_sell', label: 'Buy & Sell', value: 'Buy & Sell', icon: 'pricetag-outline', field: 'type' },
  { key: 'recommendation', label: 'Tips', value: 'Recommendation', icon: 'star-outline', field: 'type' },
  { key: 'offering', label: 'Offering', value: 'Offering', icon: 'gift-outline', field: 'type' },
  { key: 'question', label: 'Question', value: 'Question', icon: 'help-circle-outline', field: 'type' },
  { key: 'event', label: 'Event', value: 'Event', icon: 'calendar-outline', field: 'type' },
] as const;
export const wallTopics = ['Meet people', 'Housing', 'Kids & Family', 'Places', 'Food', 'Travel', 'Work', 'Wellness', 'Learning', 'Lifestyle', 'Services', 'Community'];
export const wallTopicOptions = wallTopics.map(label => ({ label, key: label.toLowerCase().replace(' & ', '_').replaceAll(' ', '_') }));
export type WallFilters = { selected: string[]; location: string; scope: string; sort: string; q: string };
export const initialWallFilters: WallFilters = { selected: [], location: '', scope: 'worldwide', sort: 'recent', q: '' };
export function wallQuery(filters: WallFilters, page = 1) {
  const params = new URLSearchParams({ page: String(page), limit: '20', matchMode: 'any', sort: filters.sort, scope: filters.scope });
  const selected = wallNeeds.filter(item => filters.selected.includes(item.key));
  params.set('type', selected.filter(item => item.field === 'type' && item.key !== 'right_now').map(item => item.key).join(',') || 'all');
  params.set('topic', wallTopicOptions.filter(item => filters.selected.includes(item.key)).map(item => item.key).join(',') || 'all');
  if (filters.selected.includes('right_now')) params.set('rightNow', 'true');
  if (filters.location) { params.set('location', filters.location); params.set('near', filters.location); }
  if (filters.q.trim()) params.set('q', filters.q.trim());
  return params.toString();
}
export function mergeWallPosts(current: WallPost[], next: WallPost[]) {
  const rows = new Map(current.map(post => [post.id, post]));
  next.forEach(post => rows.set(post.id, post));
  return [...rows.values()];
}
export function normalizeWallPost(post: WallPost): WallPost {
  return { ...post, reactionCount: post.reactionCount ?? post.supportCount ?? post.reactions?.reduce((total, item) => total + item.count, 0) ?? 0 };
}
export function updateWallPost(current: WallPost[], updated: WallPost) {
  const id = updated.originalPostId || updated.id;
  return current.map(post => (post.originalPostId || post.id) === id
    ? { ...post, ...normalizeWallPost(updated), id: post.id, shareId: post.shareId, sharedBy: post.sharedBy, shareCaption: post.shareCaption, feedCreatedAt: post.feedCreatedAt } : post);
}
