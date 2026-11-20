import type { Seen } from '../types';

export function ownsSeen(item: Seen, viewerId: string) {
  const creatorId = String(item.creator?.id || item.creator?._id || '');
  if (viewerId && creatorId) return creatorId === viewerId;
  return Boolean(viewerId && item.access === 'OWNER');
}

export function seenMenuActions(item: Seen, own: boolean, saved: boolean) {
  return own ? [
    { key: 'share', icon: 'share', title: 'Share' },
    { key: 'story', icon: 'plus-circle', title: 'Add to your story' },
    { key: 'insights', icon: 'bar-chart-2', title: 'Insights' },
    { key: 'offline', icon: 'download', title: 'Save offline', subtitle: item.allowDownload ? 'owners can download it too' : 'only you — downloads are off for others' },
    { key: 'edit', icon: 'edit-3', title: 'Edit' },
    { key: 'cover', icon: 'image', title: 'Change cover' },
    { key: 'pin', icon: 'map-pin', title: item.isPinned ? 'Unpin' : 'Pin to profile' },
    { key: 'series', icon: 'copy', title: item.series?.name ? `Series: ${item.series.name}` : 'Add to a series' },
    { key: 'archive', icon: 'archive', title: 'Archive', subtitle: 'hidden from profile, stats stay' },
    { key: 'delete', icon: 'trash-2', title: 'Delete', subtitle: 'gone for everyone', danger: true },
  ] : [
    { key: 'save', icon: 'bookmark', title: saved ? 'Remove from library' : 'Save to library' },
    { key: 'share', icon: 'send', title: 'Share' },
    { key: 'more', icon: 'eye', title: 'Show more like this', subtitle: 'tunes your feed' },
    { key: 'hide', icon: 'eye-off', title: 'Not interested' },
    { key: 'report', icon: 'flag', title: 'Report' },
    { key: 'block', icon: 'slash', title: `Block ${(item.creator?.name || item.creator?.displayName || item.creator?.username || 'creator').trim().split(/\s+/)[0]}`, danger: true },
  ];
}

export const escapeSeenHtml = (text = '') => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
