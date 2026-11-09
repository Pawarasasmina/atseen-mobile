import { useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { api, WEB_BASE_URL } from '../../services/api';
import { colors } from '../../theme';
import { compact, relativeTime } from '../../utils/format';
import type { Engagement, Session, WallPost } from '../../types';
import { IconButton } from './ProfilePrimitives';
import { ProfileSheet, SheetRow } from './ProfileSheets';
const contexts: Record<string, string> = { RESTAURANT: 'Food', PLACE: 'Places', RIGHT_NOW: 'Right now', COFFEE: 'Coffee', TRAVEL: 'Travel', FITNESS: 'Fitness', LIFESTYLE: 'Lifestyle', BUSINESS: 'Business' };
const emojis: Record<string, string> = { like: '🤝', love: '❤️', fire: '🔥', care: '✨', LIKE: '🤝', LOVE: '❤️', FIRE: '🔥', CLAP: '👏' };
Object.assign(emojis, { clap: '👏', wow: '😮', laugh: '😂', see_you: '👁️', sad: '😢', phone: '📞', strong: '💪', pray: '🙏', useful: '💡' });
export function ProfileWallPreview({ post, session, onUpdate, onComments, openWeb }: { post: WallPost; session: Session; onUpdate: (post: WallPost) => void; onComments: (post: WallPost) => void; openWeb: (path: string) => void }) {
  const [menu, setMenu] = useState<'options' | 'reactions' | 'share' | 'edit' | null>(null);
  const [busy, setBusy] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const locked = useRef(false);
  const id = post.originalPostId || post.id;
  const run = async (action: () => Promise<{ engagement?: Engagement; post?: WallPost }>) => { if (locked.current) return; locked.current = true; setBusy(true); try { const result = await action(); onUpdate(result.post || { ...post, ...result.engagement }); setMenu(null); } catch (e) { Alert.alert('Could not update note', e instanceof Error ? e.message : 'Please retry.'); } finally { locked.current = false; setBusy(false); } };
  const legacy = Boolean(post.author);
  const topReactions = post.topReactions || post.reactions?.slice().sort((a, b) => b.count - a.count).map((item) => item.reaction) || [];
  const target = legacy ? `/posts/${id}` : `/profile/${post.creator?.username || session.user.username || ''}`;
  const isOwner = !post.shareId && String(post.creator?.id || post.author?.id || '') === String(session.user.id || session.user._id || '');
  const edit = async () => {
    if (!legacy || !isOwner || locked.current || !editText.trim()) return;
    locked.current = true; setBusy(true);
    try { onUpdate((await api.editFeedPost(post, editText.trim())).post); setMenu(null); }
    catch (e) { Alert.alert('Could not edit note', String(e)); }
    finally { locked.current = false; setBusy(false); }
  };
  const archive = () => { if (!legacy || !isOwner) return; Alert.alert('Archive note?', 'This note will stay in your existing Archive.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive', onPress: async () => {
    if (locked.current) return; locked.current = true; setBusy(true);
    try { await api.archiveFeedPost(id); onUpdate({ ...post, archived: true }); setMenu(null); }
    catch (e) { Alert.alert('Could not archive note', String(e)); }
    finally { locked.current = false; setBusy(false); }
  } }]); };
  return <View style={s.post}>
    <View style={s.metadata}><Text numberOfLines={1} style={s.meta}>{[contexts[post.context || ''] || post.context, post.location?.split(',')[0], relativeTime(post.createdAt)].filter(Boolean).join(' · ')}</Text><View accessibilityLabel={post.viewCount === undefined ? 'View count unavailable' : `${post.viewCount} views`} style={s.views}><Feather name="eye" size={11} color={colors.faint} /><Text style={s.meta}>{post.viewCount === undefined ? '—' : compact(post.viewCount)}</Text></View><IconButton label="Note options" icon="more-horizontal" onPress={() => setMenu('options')} size={14} /></View>
    <Pressable onPress={() => onComments(post)}><Text style={s.text}>{post.text}</Text></Pressable>
    <View style={s.bar}><Pressable disabled={busy} hitSlop={8} accessibilityLabel="Note reactions" onPress={() => setMenu('reactions')} style={s.reaction}><Text style={s.emoji}>{topReactions.slice(0, 3).map((r) => emojis[r] || '').join('') || '🤝'}</Text><Text style={s.count}>{compact(post.reactionCount ?? post.supportCount ?? 0)}</Text></Pressable><Pressable hitSlop={10} accessibilityLabel="Note comments" onPress={() => onComments(post)} style={s.comments}><Feather name="message-circle" color={colors.muted} size={16} /><Text style={s.count}>{compact(post.commentCount || 0)}</Text></Pressable><View style={s.flex} /><IconButton disabled={busy} label={post.viewerSaved ? 'Unsave note' : 'Save note'} icon="bookmark" color={post.viewerSaved ? colors.blue : colors.muted} onPress={() => run(() => legacy ? api.saveFeedPost(id) : api.toggleWallSave(id, post.shareId, session.accessToken))} /><IconButton label="Share note" icon="send" color={colors.muted} onPress={() => setMenu('share')} /></View>
    {menu ? <ProfileSheet title={menu === 'reactions' ? 'Reactions' : menu === 'share' ? 'Share note' : menu === 'edit' ? 'Edit note' : 'Your note'} onClose={() => { if (!busy) setMenu(null); }}>
      {menu === 'edit' ? <><TextInput accessibilityLabel="Note text" editable={!busy} multiline maxLength={legacy ? 2000 : 1200} value={editText} onChangeText={setEditText} style={{ color: colors.text, minHeight: 100, maxHeight: 200, fontSize: 14, textAlignVertical: 'top' }} /><SheetRow title="Save note" disabled={busy || !editText.trim()} onPress={edit} /></> : menu === 'reactions' ? ['like', 'love', 'care', 'fire'].map((r) => <SheetRow key={r} disabled={busy} title={`${emojis[r]} ${r}${post.viewerReaction === r ? ' · Selected' : ''}`} onPress={() => run(() => legacy ? api.reactToFeedPost(id, post.viewerReaction === r ? '' : r) : api.reactToWall(id, r, post.shareId, session.accessToken))} />) : menu === 'share' ? <><SheetRow title="Share link" onPress={() => Share.share({ message: `${post.text}\n${WEB_BASE_URL}${target}` }).catch((e) => Alert.alert('Could not share', String(e)))} /><SheetRow disabled={busy} title={post.viewerShared ? 'Remove repost' : 'Repost to your Wall'} onPress={() => run(() => legacy ? api.shareFeedPost(id) : api.toggleWallShare(id, '', session.accessToken))} /></> : <><SheetRow title="Open note" onPress={() => { setMenu(null); onComments(post); }} />{isOwner && legacy ? <><SheetRow title="Edit note" onPress={() => { setEditText(post.text); setMenu('edit'); }} /><SheetRow disabled={busy} title="Archive note" onPress={archive} /></> : legacy ? <SheetRow title="Manage note" onPress={() => { setMenu(null); openWeb(target); }} /> : null}</>}{busy ? <Text style={s.meta}>Saving…</Text> : null}
    </ProfileSheet> : null}
  </View>;
}
const s = StyleSheet.create({ post: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.045)' }, metadata: { flexDirection: 'row', alignItems: 'center', gap: 8 }, meta: { fontSize: 10.5, color: colors.faint, flexShrink: 1 }, views: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }, text: { color: 'rgba(255,255,255,.92)', fontSize: 13.5, lineHeight: 20.25, marginTop: 5 }, bar: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 9 }, reaction: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(255,255,255,.04)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: -10 }, emoji: { fontSize: 11 }, count: { fontSize: 11, color: colors.muted, fontWeight: '600' }, comments: { flexDirection: 'row', alignItems: 'center', gap: 5 }, flex: { flex: 1 } });
