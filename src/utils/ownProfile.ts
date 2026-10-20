import type { ActiveStatus, Dream, ExperiencePublication, ProfileGift } from '../types';

export function profileStatusText(status?: ActiveStatus | null) {
  const label = status?.label || 'Right now…';
  return status?.emoji && !label.startsWith(status.emoji) ? `${status.emoji} ${label}` : label;
}

export function visibleProfileSeen(item: ExperiencePublication) {
  return !['DRAFT', 'ARCHIVED', 'REMOVED'].includes(item.status || '') && item.visibility !== 'LINK_ONLY';
}
export function featuredExperiences(items: ExperiencePublication[]) {
  return items.filter((item) => item.kind === 'EXPERIENCE' && !['ARCHIVED', 'REMOVED', 'DRAFT'].includes(item.status || ''))
    .sort((a, b) => Number(b.pricing?.mode === 'ONE_TIME') - Number(a.pricing?.mode === 'ONE_TIME')).slice(0, 2);
}
export function dreamProgress(dream: Dream) {
  if (!dream.goalStars || dream.goalStars <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((dream.receivedStars || 0) / dream.goalStars * 100)));
}
export function profileGiftPreviews(gifts: ProfileGift[]) {
  const priority = (gift: ProfileGift) => gift.featuredOnProfile ? 1 : 0;
  return gifts.filter((gift) => !gift.hiddenFromProfile).sort((a, b) => priority(b) - priority(a)
    || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 3);
}
