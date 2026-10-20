import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, resolveMediaUrl } from '../services/api';
import { colors } from '../theme';
import type { Engagement, SeenComment } from '../types';

export const reactions = [
  { key: 'LIKE', label: 'Support', icon: '🤝' },
  { key: 'LOVE', label: 'Love', icon: '❤️' },
  { key: 'FIRE', label: 'Fire', icon: '🔥' },
  { key: 'CLAP', label: 'Clap', icon: '👏' },
  { key: 'LAUGH', label: 'Laugh', icon: '😂' },
  { key: 'SEE_YOU', label: 'I see you', icon: '👁️' },
  { key: 'WOW', label: 'Surprised', icon: '😮' },
  { key: 'TEARY', label: 'Moved', icon: '🥹' },
  { key: 'ADMIRE', label: 'Adore', icon: '😍' },
  { key: 'SAD', label: 'Sad', icon: '😢' },
  { key: 'HUG', label: 'Hug', icon: '🫂' },
  { key: 'STRONG', label: 'Strong', icon: '💪' },
  { key: 'PRAY', label: 'Respect', icon: '🙏' },
  { key: 'HUNDRED', label: 'One hundred', icon: '💯' },
  { key: 'SPARKLES', label: 'Sparkles', icon: '✨' },
] as const;

export function ReactionSummary({ engagement }: { engagement: Engagement }) {
  const keys = (engagement.topReactions?.length ? engagement.topReactions : ['LIKE']).slice(0, 3);
  return <View style={summaryStyles.row}>{keys.map((key, index) => <View key={`${key}-${index}`} style={[summaryStyles.bubble, index > 0 && summaryStyles.overlap]}><Text style={summaryStyles.icon}>{reactions.find((item) => item.key === key)?.icon || '🤝'}</Text></View>)}<Text style={[summaryStyles.count, engagement.viewerReaction ? summaryStyles.selected : null]}>{engagement.reactionCount || 0}</Text></View>;
}

type Props = { accessToken: string; engagement: Engagement; id: string; inlineComments?: boolean; mode: 'comments' | 'reactions' | null; onClose: () => void; onUpdate: (engagement: Engagement) => void; title?: string };

export function EngagementSheet({ accessToken, engagement, id, inlineComments = false, mode, onClose, onUpdate, title = '' }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<SeenComment | null>(null);
  const [reactionTarget, setReactionTarget] = useState<SeenComment | null>(null);

  useEffect(() => {
    if (mode !== 'comments') { setReplyTo(null); setReactionTarget(null); if (mode) setError(''); return; }
    setLoading(true); setError('');
    api.getSeenEngagement(id, accessToken).then((result) => onUpdate(result.engagement)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load comments.')).finally(() => setLoading(false));
  }, [accessToken, id, mode]);

  const chooseReaction = async (key: string) => {
    if (busy) return;
    setBusy(key); setError('');
    try {
      const result = engagement.viewerReaction === key
        ? await api.removeSeenReaction(id, accessToken)
        : await api.reactToSeen(id, key, accessToken);
      onUpdate(result.engagement);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your reaction.');
    } finally { setBusy(''); }
  };

  const submitComment = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy('comment'); setError('');
    try {
      const result = await api.commentOnSeen(id, value, accessToken, replyTo?.id);
      onUpdate(result.engagement); setText(''); setReplyTo(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add your comment.');
    } finally { setBusy(''); }
  };

  if (inlineComments && mode === 'comments') return <View style={styles.inlineCommentPanel}>
    <View style={styles.inlineTitleRow}><Text style={styles.title}>Comments</Text><Text style={styles.total}>{engagement.commentCount || 0}</Text><View style={{ flex: 1 }} /><Pressable accessibilityLabel="Close comments" onPress={onClose} style={styles.close}><Ionicons color={colors.muted} name="close" size={20} /></Pressable></View>
    {loading ? <ActivityIndicator color={colors.blue} style={styles.inlineLoader} /> : <FlatList contentContainerStyle={styles.inlineComments} data={engagement.comments || []} keyExtractor={(item, index) => item.id || String(index)} ListEmptyComponent={<Text style={styles.inlineEmpty}>Be the first to comment.</Text>} nestedScrollEnabled={false} renderItem={({ item }) => <CommentRow item={item} onReact={setReactionTarget} onReply={setReplyTo} />} scrollEnabled={false} />}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {reactionTarget ? <View style={styles.commentReactionPicker}>{reactions.map((reaction) => <Pressable accessibilityLabel={`React with ${reaction.label}`} disabled={Boolean(busy)} key={reaction.key} onPress={async () => { if (busy) return; setBusy(`comment-${reaction.key}`); try { const result = reactionTarget.viewerReaction === reaction.key ? await api.removeSeenCommentReaction(id, reactionTarget.id, accessToken) : await api.reactToSeenComment(id, reactionTarget.id, reaction.key, accessToken); onUpdate(result.engagement); setReactionTarget(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not react to comment.'); } finally { setBusy(''); } }} style={[styles.commentReactionChoice, reactionTarget.viewerReaction === reaction.key && styles.commentReactionSelected]}><Text style={styles.commentReactionEmoji}>{reaction.icon}</Text></Pressable>)}</View> : null}
    {replyTo ? <View style={styles.replying}><Text numberOfLines={1} style={styles.replyingText}>Replying to <Text style={styles.replyingName}>{replyTo.author?.name || 'User'}</Text></Text><Pressable accessibilityLabel="Cancel reply" onPress={() => setReplyTo(null)}><Ionicons color={colors.faint} name="close" size={17} /></Pressable></View> : null}
    <View style={styles.composer}><TextInput maxLength={500} multiline onChangeText={setText} placeholder="Add a comment…" placeholderTextColor={colors.faint} style={styles.input} value={text} /><Pressable accessibilityLabel="Send comment" disabled={!text.trim() || Boolean(busy)} onPress={submitComment} style={[styles.send, (!text.trim() || Boolean(busy)) && styles.sendDisabled]}>{busy === 'comment' ? <ActivityIndicator color="#07101A" size="small" /> : <Ionicons color="#07101A" name="arrow-up" size={18} />}</Pressable></View>
  </View>;

  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={Boolean(mode)}>
    <SafeAreaView style={styles.overlay}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
      {mode === 'reactions' ? <View style={styles.reactionSheet}>
        <View style={styles.handle} />
        <View style={styles.reactionGrid}>
          {reactions.map((reaction) => {
            const selected = engagement.viewerReaction === reaction.key;
            const count = engagement.reactionBreakdown?.[reaction.key] || 0;
            return <Pressable accessibilityLabel={`${selected ? 'Remove' : 'React with'} ${reaction.label}`} disabled={Boolean(busy)} key={reaction.key} onPress={() => chooseReaction(reaction.key)} style={[styles.reaction, selected && styles.reactionSelected]}>
              {busy === reaction.key ? <ActivityIndicator color={colors.blue} size="small" /> : <Text style={styles.emoji}>{reaction.icon}</Text>}
              <Text style={[styles.reactionCount, selected && styles.reactionCountSelected, !count && styles.hiddenCount]}>{count || '•'}</Text>
            </Pressable>;
          })}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.hint}>One reaction — make it yours</Text>
      </View> : null}
      {mode === 'comments' ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.commentSheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}><Text style={styles.title}>Comments</Text><Text style={styles.total}>{engagement.commentCount || 0}</Text><Text numberOfLines={1} style={styles.sheetContext}>{title}</Text><Pressable accessibilityLabel="Close comments" onPress={onClose} style={styles.close}><Ionicons color={colors.muted} name="close" size={20} /></Pressable></View>
        {loading ? <ActivityIndicator color={colors.blue} style={styles.commentLoader} /> : <FlatList contentContainerStyle={styles.comments} data={engagement.comments || []} keyExtractor={(item, index) => item.id || String(index)} ListEmptyComponent={<Text style={styles.empty}>Be the first to comment.</Text>} renderItem={({ item }) => <CommentRow item={item} onReact={setReactionTarget} onReply={setReplyTo} />} />}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {reactionTarget ? <View style={styles.commentReactionPicker}>{reactions.map((reaction) => <Pressable accessibilityLabel={`React with ${reaction.label}`} disabled={Boolean(busy)} key={reaction.key} onPress={async () => { if (busy) return; setBusy(`comment-${reaction.key}`); try { const result = reactionTarget.viewerReaction === reaction.key ? await api.removeSeenCommentReaction(id, reactionTarget.id, accessToken) : await api.reactToSeenComment(id, reactionTarget.id, reaction.key, accessToken); onUpdate(result.engagement); setReactionTarget(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not react to comment.'); } finally { setBusy(''); } }} style={[styles.commentReactionChoice, reactionTarget.viewerReaction === reaction.key && styles.commentReactionSelected]}><Text style={styles.commentReactionEmoji}>{reaction.icon}</Text></Pressable>)}</View> : null}
        {replyTo ? <View style={styles.replying}><Text numberOfLines={1} style={styles.replyingText}>Replying to <Text style={styles.replyingName}>{replyTo.author?.name || 'User'}</Text></Text><Pressable accessibilityLabel="Cancel reply" onPress={() => setReplyTo(null)}><Ionicons color={colors.faint} name="close" size={17} /></Pressable></View> : null}
        <View style={styles.composer}><TextInput maxLength={500} multiline onChangeText={setText} placeholder="Add a comment…" placeholderTextColor={colors.faint} style={styles.input} value={text} /><Pressable accessibilityLabel="Send comment" disabled={!text.trim() || Boolean(busy)} onPress={submitComment} style={styles.send}>{busy === 'comment' ? <ActivityIndicator color="#07101A" size="small" /> : <Ionicons color="#07101A" name="arrow-up" size={18} />}</Pressable></View>
      </KeyboardAvoidingView> : null}
    </SafeAreaView>
  </Modal>;
}

function CommentRow({ item, nested = false, onReact, onReply }: { item: SeenComment; nested?: boolean; onReact: (item: SeenComment) => void; onReply: (item: SeenComment) => void }) {
  const name = item.author?.name || item.author?.username || 'User';
  const icons = (item.topReactions || []).slice(0, 3).map((key) => reactions.find((reaction) => reaction.key === key)?.icon).join('') || '🤝';
  return <View style={nested ? styles.replyIndent : undefined}><View style={styles.comment}>{item.author?.avatar ? <Image source={{ uri: resolveMediaUrl(item.author.avatar) }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.initial}>{name[0]?.toUpperCase()}</Text></View>}<View style={styles.commentCopy}><View style={styles.commentHead}><Text style={styles.commentName}>{name}</Text><Text style={styles.commentTime}>{relativeTime(item.createdAt)}</Text></View><Text style={styles.commentText}>{item.text}</Text><View style={styles.commentActions}><Pressable onPress={() => onReact(item)} style={styles.commentReaction}><Text style={styles.commentReactionSmall}>{icons}</Text><Text style={[styles.commentActionText, item.viewerReaction && styles.commentActionActive]}>{item.reactionCount || 0}</Text></Pressable>{nested ? null : <Pressable onPress={() => onReply(item)}><Text style={styles.commentActionText}>Reply</Text></Pressable>}</View></View></View>{(item.replies || []).map((reply) => <CommentRow item={reply} key={reply.id} nested onReact={onReact} onReply={onReply} />)}</View>;
}

function relativeTime(value?: string) { if (!value) return ''; const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return 'now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`; return `${Math.floor(seconds / 86400)}d`; }

const styles = StyleSheet.create({
  inlineCommentPanel: { marginHorizontal: 20, marginBottom: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.08)' }, inlineTitleRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center', gap: 7 }, inlineLoader: { minHeight: 70 }, inlineComments: { paddingBottom: 8 }, inlineEmpty: { color: colors.faint, fontSize: 11, textAlign: 'center', paddingVertical: 24 }, sendDisabled: { opacity: .45 },
  sheetContext: { flex: 1, color: colors.faint, fontSize: 10, marginLeft: 2 }, close: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  replying: { minHeight: 31, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 9, backgroundColor: 'rgba(156,203,255,.07)' }, replyingText: { flex: 1, color: colors.faint, fontSize: 10 }, replyingName: { color: '#FFF', fontWeight: '800' },
  commentReactionPicker: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.07)' }, commentReactionChoice: { width: '20%', height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, commentReactionSelected: { backgroundColor: 'rgba(156,203,255,.14)' }, commentReactionEmoji: { fontSize: 21 },
  avatarImage: { width: 31, height: 31, borderRadius: 16 }, commentHead: { flexDirection: 'row', alignItems: 'center', gap: 7 }, commentTime: { color: 'rgba(255,255,255,.28)', fontSize: 8.5 }, commentActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }, commentReaction: { flexDirection: 'row', alignItems: 'center', gap: 4 }, commentReactionSmall: { fontSize: 10 }, commentActionText: { color: colors.faint, fontSize: 9.5, fontWeight: '700' }, commentActionActive: { color: colors.blue }, replyIndent: { marginLeft: 31 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.62)' },
  reactionSheet: { minHeight: 306, paddingHorizontal: 17, paddingBottom: Platform.OS === 'ios' ? 18 : 14, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,.10)', backgroundColor: '#0C0F14' },
  commentSheet: { height: '72%', paddingHorizontal: 18, paddingBottom: Platform.OS === 'ios' ? 12 : 8, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,.10)', backgroundColor: '#0C0F14' },
  handle: { width: 40, height: 4, alignSelf: 'center', marginTop: 10, marginBottom: 13, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.24)' },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  reaction: { width: '20%', height: 69, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  reactionSelected: { backgroundColor: 'rgba(133,190,255,.15)', borderWidth: 1, borderColor: 'rgba(133,190,255,.38)' },
  emoji: { fontSize: 28, lineHeight: 34 },
  reactionCount: { height: 15, marginTop: 2, color: 'rgba(255,255,255,.42)', fontSize: 9, fontWeight: '700' },
  reactionCountSelected: { color: colors.blue }, hiddenCount: { opacity: 0 },
  hint: { marginTop: 4, color: 'rgba(255,255,255,.35)', fontSize: 10, textAlign: 'center' },
  error: { color: '#FF8D8D', fontSize: 10, textAlign: 'center', marginVertical: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, paddingBottom: 12 }, title: { color: '#FFF', fontSize: 18, fontWeight: '900' }, total: { color: colors.faint, fontSize: 11, fontWeight: '700' },
  comments: { flexGrow: 1, paddingBottom: 12 }, empty: { color: colors.faint, fontSize: 12, textAlign: 'center', marginTop: 50 },
  commentLoader: { flex: 1 },
  comment: { flexDirection: 'row', gap: 10, paddingVertical: 10 }, avatar: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 }, initial: { color: colors.blue, fontSize: 11, fontWeight: '900' }, commentCopy: { flex: 1 }, commentName: { color: '#FFF', fontSize: 11, fontWeight: '800' }, commentText: { color: 'rgba(255,255,255,.78)', fontSize: 12, lineHeight: 18, marginTop: 3 },
  composer: { minHeight: 52, flexDirection: 'row', alignItems: 'flex-end', gap: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.08)', paddingTop: 9 }, input: { flex: 1, maxHeight: 96, minHeight: 39, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: '#FFF', backgroundColor: 'rgba(255,255,255,.06)', fontSize: 12 }, send: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue },
});

const summaryStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' }, bubble: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#11151B', backgroundColor: '#252A31' }, overlap: { marginLeft: -5 }, icon: { fontSize: 10, lineHeight: 14 }, count: { marginLeft: 5, color: colors.faint, fontSize: 10, fontWeight: '700' }, selected: { color: colors.blue },
});
