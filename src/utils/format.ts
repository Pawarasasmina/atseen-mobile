export function compact(value = 0) {
  const number = Number(value) || 0;
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return String(number);
}

export function relativeTime(value?: string | null) {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] || name || 'Account';
}

export function userName(user?: { displayName?: string; name?: string; username?: string }) {
  return user?.displayName || user?.name || user?.username || 'Account';
}

export function userAvatar(user?: { avatar?: string; avatarUrl?: string | null }) {
  return user?.avatar || user?.avatarUrl || '';
}

export function newClientMessageId() {
  return `rn-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
