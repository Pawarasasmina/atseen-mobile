import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Animated, FlatList, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { Avatar } from './Avatar';
import { SeenAudio } from './SeenMedia';
import { SeenVoiceComment } from './SeenVoiceComment';
import { colors } from '../theme';
import { compact, firstName, userName } from '../utils/format';
import { appendCommentEmoji, commentEmojis, commentRows } from '../utils/seenComments';
import type { Engagement, SeenComment, User } from '../types';

type Props = { visible: boolean; id: string; accessToken: string; engagement: Engagement; onUpdate: (next: Engagement) => void; onClose: () => void };

export function SeenCommentsSheet({ visible, id, accessToken, engagement, onUpdate, onClose }: Props) {
  const [text, setText] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(''), [loading, setLoading] = useState(false);
  const [viewer, setViewer] = useState<User>(), [reply, setReply] = useState<SeenComment | null>(null), [voiceOpen, setVoiceOpen] = useState(false), [retry, setRetry] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null), list = useRef<FlatList<ReturnType<typeof commentRows>[number]>>(null);
  const locked = useRef(false), revision = useRef(0), scrollAfterPost = useRef(false);
  const insets = useSafeAreaInsets();
  const dragY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(() => {});
  const rows = useMemo(() => commentRows(engagement.comments || []), [engagement.comments]);
  const close = () => { if (!locked.current) { setVoiceOpen(false); Keyboard.dismiss(); onClose(); } };
  closeRef.current = close;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => dragY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => { if (gesture.dy > 90) closeRef.current(); Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(); },
    onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
  }), [dragY]);
  useEffect(() => {
    if (!visible) { setVoiceOpen(false); setReply(null); return; }
    let alive = true; const readVersion = revision.current; setLoading(true); setError(''); dragY.setValue(0);
    api.getSeenEngagement(id, accessToken).then((result) => { if (alive && revision.current === readVersion) onUpdate(result.engagement); }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : 'Could not load comments.'); }).finally(() => { if (alive) setLoading(false); });
    api.me(accessToken).then((result) => { if (alive) setViewer(result.user); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, id, accessToken, retry, dragY]);
  useEffect(() => { if (scrollAfterPost.current) { scrollAfterPost.current = false; requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true })); } }, [rows.length]);
  useEffect(() => { setText(''); setReply(null); setVoiceOpen(false); }, [id]);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const commit = async (key: string, action: () => Promise<{ engagement: Engagement }>, posted = false) => {
    if (locked.current) return false;
    locked.current = true; revision.current++; setPending(key); setError('');
    try {
      const result = await action(); scrollAfterPost.current = posted; onUpdate(result.engagement);
      if (posted) { setText(''); setReply(null); setVoiceOpen(false); }
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update comments. Please try again.'); return false; }
    finally { locked.current = false; setPending(''); }
  };
  const post = () => { if (text.trim()) commit('post', () => api.commentOnSeen(id, text.trim(), accessToken, reply?.id), true); };
  const beginReply = (comment: SeenComment) => { if (locked.current) return; setReply(comment); setVoiceOpen(false); input.current?.focus(); };
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={close} presentationStyle="overFullScreen" statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.layer}>
      <Pressable accessibilityLabel="Close comments" onPress={close} style={s.scrim} />
      <Animated.View accessibilityViewIsModal style={[s.sheet, { transform: [{ translateY: dragY }] }]}>
        <View {...pan.panHandlers} accessibilityLabel="Comments. Drag down to dismiss" style={s.heading}><View style={s.handle} /><Text style={s.title}>Comments</Text></View>
        {error ? <Pressable onPress={() => { if (!pending) setRetry(retry + 1); }} style={s.errorBox}><Text accessibilityRole="alert" style={s.error}>{error}</Text>{!pending ? <Text style={s.retry}>Tap to refresh comments</Text> : null}</Pressable> : null}
        {loading && !rows.length ? <View style={s.loading}><ActivityIndicator color={colors.blue} /></View> : <FlatList ref={list} style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" data={rows} keyExtractor={({ comment }) => String(comment.id)} ListEmptyComponent={<View style={s.empty}><Text style={s.emptyTitle}>No comments yet</Text><Text style={s.emptyText}>Start the conversation.</Text></View>} renderItem={({ item: row }) => {
          const comment = row.comment, reacted = Boolean(comment.viewerReaction), author = firstName(userName(comment.author));
          return <View style={[s.comment, row.nested && s.nested]}><Avatar size={row.nested ? 20 : 24} user={comment.author} /><View style={s.copy}>
            <Text style={s.commentText}><Text style={s.author}>{author}</Text>{'  '}{row.nested && row.parentAuthor?.username ? <Text style={s.mention}>@{row.parentAuthor.username} </Text> : null}{comment.text}</Text>
            {comment.audio?.url ? <SeenAudio uri={comment.audio.url} active={visible} /> : null}
            <View style={s.commentActions}><Pressable accessibilityRole="button" accessibilityLabel={`${reacted ? 'Unlike' : 'Like'} comment by ${author}`} accessibilityState={{ selected: reacted, disabled: Boolean(pending) }} disabled={Boolean(pending)} hitSlop={6} onPress={() => commit(comment.id, () => api.reactToSeenComment(id, comment.id, reacted, accessToken))} style={s.like}>{pending === comment.id ? <ActivityIndicator color={colors.blue} size="small" /> : <Ionicons name={reacted ? 'heart' : 'heart-outline'} color={reacted ? '#E54859' : colors.faint} size={12} />}<Text style={[s.count, reacted && s.liked]}>{comment.reactionCount ? compact(comment.reactionCount) : ''}</Text></Pressable><Pressable accessibilityLabel={`Reply to ${author}`} disabled={Boolean(pending)} hitSlop={6} onPress={() => beginReply(comment)}><Text style={s.reply}>Reply</Text></Pressable></View>
          </View></View>;
        }} />}
        <View style={[s.footer, { paddingBottom: 14 + (keyboardVisible ? 0 : insets.bottom) }]}>
          {reply ? <View style={s.replying}><Text numberOfLines={1} style={s.replyingText}>Replying to <Text style={s.mention}>@{reply.author?.username || firstName(userName(reply.author))}</Text></Text><Pressable accessibilityLabel="Cancel reply" disabled={Boolean(pending)} onPress={() => setReply(null)} hitSlop={8}><Feather name="x" size={15} color={colors.faint} /></Pressable></View> : null}
          <View accessibilityLabel="Quick emoji" style={s.emojis}>{commentEmojis.map((emoji) => <Pressable key={emoji} accessibilityLabel={`Add ${emoji} to comment`} disabled={Boolean(pending) || voiceOpen} onPress={() => { setText((old) => appendCommentEmoji(old, emoji)); input.current?.focus(); }} style={s.emojiButton}><Text style={s.emoji}>{emoji}</Text></Pressable>)}</View>
          {voiceOpen ? <SeenVoiceComment onCancel={() => setVoiceOpen(false)} onError={setError} onSend={async (uri, waveform) => { const sent = await commit('voice', () => api.voiceCommentOnSeen(id, uri, text, waveform, accessToken, reply?.id), true); if (!sent) throw new Error('Could not post voice comment.'); }} /> : <View style={s.composer}><Avatar user={viewer} size={34} /><View style={s.inputWrap}><TextInput ref={input} accessibilityLabel={reply ? 'Add a reply' : 'Add a comment'} maxLength={500} multiline editable={!pending} placeholder="Add a comment…" placeholderTextColor={colors.faint} style={s.input} value={text} onChangeText={setText} /><Pressable accessibilityLabel="Record voice comment" disabled={Boolean(pending)} hitSlop={6} onPress={() => { Keyboard.dismiss(); setError(''); setVoiceOpen(true); }} style={s.mic}><Feather name="mic" color={colors.faint} size={16} /></Pressable></View><Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={!text.trim() || Boolean(pending)} onPress={post} style={s.postButton}>{pending === 'post' ? <ActivityIndicator color={colors.blue} size="small" /> : <Text style={[s.post, (!text.trim() || Boolean(pending)) && s.postDisabled]}>Post</Text>}</Pressable></View>}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}
const s = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' }, scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.65)' }, sheet: { height: '74%', backgroundColor: '#14171D', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.07)' }, heading: { alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.07)' }, handle: { width: 42, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.28)', marginTop: 9, marginBottom: 8 }, title: { color: colors.text, fontSize: 14.5, fontWeight: '700', letterSpacing: -.15, paddingBottom: 12 }, list: { flex: 1 }, listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 }, comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 7 }, nested: { marginLeft: 33, paddingTop: 4 }, copy: { flex: 1 }, commentText: { fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,.88)' }, author: { fontSize: 11.5, fontWeight: '800', color: colors.text }, mention: { color: colors.blue }, commentActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4, minHeight: 16 }, like: { flexDirection: 'row', alignItems: 'center', gap: 4 }, count: { color: colors.faint, fontSize: 10 }, liked: { color: colors.blue, fontWeight: '700' }, reply: { color: colors.faint, fontSize: 11, fontWeight: '700' }, footer: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.07)', paddingHorizontal: 14, paddingTop: 8 }, emojis: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8 }, emojiButton: { minWidth: 28, minHeight: 34, alignItems: 'center', justifyContent: 'center' }, emoji: { fontSize: 23, lineHeight: 29 }, composer: { flexDirection: 'row', alignItems: 'center', gap: 10 }, inputWrap: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', borderRadius: 99, backgroundColor: 'rgba(255,255,255,.04)', flexDirection: 'row', alignItems: 'center', paddingRight: 8 }, input: { flex: 1, minHeight: 40, maxHeight: 88, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontSize: 13 }, mic: { minWidth: 24, minHeight: 32, alignItems: 'center', justifyContent: 'center' }, postButton: { minWidth: 34, minHeight: 40, alignItems: 'center', justifyContent: 'center' }, post: { color: colors.blue, fontSize: 13, fontWeight: '700' }, postDisabled: { opacity: .4 }, replying: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8 }, replyingText: { flex: 1, color: colors.faint, fontSize: 11 }, errorBox: { paddingHorizontal: 16, paddingVertical: 9 }, error: { color: colors.danger, fontSize: 12, lineHeight: 18 }, retry: { color: colors.blue, fontSize: 11, marginTop: 4 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', paddingTop: 40, gap: 7 }, emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, emptyText: { color: colors.faint, fontSize: 12 },
});
