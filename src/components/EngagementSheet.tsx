import { SeenReactionPicker } from './SeenReactionPicker';
import { SeenCommentsSheet } from './SeenCommentsSheet';
import type { Engagement } from '../types';

export { seenReactions as reactions } from '../utils/seenReactions';
type Props = { accessToken: string; engagement: Engagement; id: string; mode: 'comments' | 'reactions' | null; onClose: () => void; onUpdate: (engagement: Engagement) => void };

export function EngagementSheet({ accessToken, engagement, id, mode, onClose, onUpdate }: Props) {
  if (mode === 'reactions') return <SeenReactionPicker visible id={id} accessToken={accessToken} engagement={engagement} onClose={onClose} onUpdate={onUpdate} />;
  return <SeenCommentsSheet visible={mode === 'comments'} id={id} accessToken={accessToken} engagement={engagement} onClose={onClose} onUpdate={onUpdate} />;
}
