import type { Seen, SeenMedia } from '../types';

export const seenId = (seen: Seen) => String(seen.id || seen._id || '');
export const orderedChapters = (seen: Seen) => [...(seen.chapters || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
export const seenMediaSource = (media?: SeenMedia) => media?.secureUrl || media?.url || media?.playbackUrl || '';
export function isSeenVideo(media?: SeenMedia) {
  return /video/i.test(`${media?.mediaType || ''} ${media?.resourceType || ''}`) || /\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(seenMediaSource(media));
}
export function seenReadMinutes(seen: Seen) {
  const words = (seen.chapters || []).reduce((sum, chapter) => sum + (chapter.blocks || []).reduce((n, block) => n + (block.text || block.label || '').trim().split(/\s+/).filter(Boolean).length, 0), 0);
  return Math.max(1, Math.ceil(words / 220));
}
export function seenDuration(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
