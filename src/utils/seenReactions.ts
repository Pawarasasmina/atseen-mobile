export const seenReactions = [
  { key: 'SEE_YOU', icon: '👁️', label: 'I see you' },
  { key: 'LOVE', icon: '❤️', label: 'Love' },
  { key: 'FIRE', icon: '🔥', label: 'Fire' },
  { key: 'TEARY', icon: '🥹', label: 'Moved' },
  { key: 'LAUGH', icon: '😂', label: 'Laugh' },
  { key: 'LIKE', icon: '🤝', label: 'Support' },
  { key: 'CLAP', icon: '👏', label: 'Clap' },
  { key: 'WOW', icon: '😮', label: 'Surprised' },
  { key: 'ADMIRE', icon: '😍', label: 'Adore' },
  { key: 'SAD', icon: '😢', label: 'Sad' },
  { key: 'HUG', icon: '🫂', label: 'Hug' },
  { key: 'STRONG', icon: '💪', label: 'Strong' },
  { key: 'PRAY', icon: '🙏', label: 'Respect' },
  { key: 'HUNDRED', icon: '💯', label: 'One hundred' },
  { key: 'SPARKLES', icon: '✨', label: 'Sparkles' },
];
export const quickSeenReactions = seenReactions.slice(0, 6);
export const normalizeSeenReaction = (key?: string | null) => key === 'INSIGHTFUL' ? 'FIRE' : key === 'PHONE' ? 'SEE_YOU' : key || '';
export function seenReactionCount(breakdown: Record<string, number> = {}, key: string) {
  const normal = normalizeSeenReaction(key);
  return Math.max(0, Number(breakdown[normal]) || 0) + (normal === 'FIRE' ? Math.max(0, Number(breakdown.INSIGHTFUL) || 0) : normal === 'SEE_YOU' ? Math.max(0, Number(breakdown.PHONE) || 0) : 0);
}
