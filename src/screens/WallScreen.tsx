import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { BottomNav } from '../components/BottomNav';
import { ScreenState, SkeletonRows } from '../components/ScreenState';
import { api, resolveMediaUrl, WEB_BASE_URL } from '../services/api';
import { colors } from '../theme';
import { compact, firstName, relativeTime, userAvatar, userName } from '../utils/format';
import type { Engagement, MainTab, SawYouToday, Session, StoryGroup, WallComment, WallPost } from '../types';

const filters = [
  { key: 'all', label: 'All', contexts: [] },
  { key: 'right_now', label: 'Right now', contexts: ['RIGHT_NOW'] },
  { key: 'places', label: 'Places', contexts: ['PLACE', 'RESTAURANT', 'COFFEE', 'TRAVEL'] },
  { key: 'events', label: 'Events', contexts: ['LIFESTYLE', 'BUSINESS'] },
  { key: 'things_to_do', label: 'Things to do', contexts: ['NEED_HELP', 'FITNESS', 'WELLNESS', 'BEAUTY', 'BOOK', 'MOVIE'] },
] as const;

const contextLabels: Record<string, string> = { RIGHT_NOW: 'Right now', COFFEE: 'Coffee', NEED_HELP: 'Need help', PLACE: 'Places', RESTAURANT: 'Food', BOOK: 'Book', MOVIE: 'Movie', TRAVEL: 'Travel', BUSINESS: 'Business', FITNESS: 'Fitness', WELLNESS: 'Wellness', LIFESTYLE: 'Lifestyle', BEAUTY: 'Beauty' };
const contextOptions = ['RIGHT_NOW', 'PLACE', 'RESTAURANT', 'TRAVEL', 'FITNESS', 'LIFESTYLE'] as const;
const reactionIcons: Record<string, string> = { like: 'thumbs-up', love: 'heart', care: 'sparkles', fire: 'flame' };

function StoryPresenceRow({ onOpenStory, onStatus, session, stories }: { onOpenStory: (group: StoryGroup) => void; onStatus: () => void; session: Session; stories: StoryGroup[] }) {
  const viewer = stories[0]?.user?.id === session.user.id ? stories[0] : { user: session.user, activeStatus: session.user.activeStatus };
  const rows = [viewer, ...stories.filter((item) => String(item.user?.id || item.user?._id) !== String(session.user.id || session.user._id))];
  return <ScrollView contentContainerStyle={styles.storyRow} horizontal showsHorizontalScrollIndicator={false}>
    <Pressable accessibilityLabel="@seen" accessibilityRole="button" style={styles.storyItem}><View style={styles.seenBubble}><Ionicons color={colors.blue} name="eye" size={25} /></View><Text numberOfLines={1} style={styles.storyName}>seen ✓</Text></Pressable>
    {rows.map((group, index) => {
      const active = Boolean(group.activeStatus?.label || group.hasUnseenStories);
      const name = index === 0 ? 'Your story' : firstName(userName(group.user));
      return <Pressable accessibilityLabel={name} accessibilityRole="button" key={`${group.user?.id || group.user?._id || index}`} onPress={index === 0 ? onStatus : () => onOpenStory(group)} style={styles.storyItem}>
        <View style={[styles.storyAvatar, active && styles.storyAvatarActive]}><Avatar size={52} user={group.user} /></View>
        <Text numberOfLines={1} style={styles.storyName}>{name}</Text>
        {group.activeStatus?.label ? <Text numberOfLines={1} style={[styles.storyStatus, group.activeStatus.color ? { color: group.activeStatus.color } : null]}>{group.activeStatus.label}</Text> : <Text numberOfLines={1} style={styles.storyStatus}>{group.storyCount ? `${group.storyCount} live` : 'At seen'}</Text>}
      </Pressable>;
    })}
  </ScrollView>;
}

function StoryModal({ group, onClose, session }: { group: StoryGroup | null; onClose: () => void; session: Session }) {
  const story = group?.stories?.[0];
  const url = resolveMediaUrl(story?.mediaUrl || story?.thumbnailUrl || userAvatar(group?.user) || '');
  useEffect(() => {
    if (story?.id) api.markStoryViewed(story.id, session.accessToken).catch(() => undefined);
  }, [session.accessToken, story?.id]);
  return <Modal animationType="fade" visible={Boolean(group)} onRequestClose={onClose}><SafeAreaView style={styles.storyViewer}><Pressable accessibilityLabel="Close story" onPress={onClose} style={styles.storyClose}><Ionicons color={colors.text} name="close" size={24} /></Pressable><View style={styles.storyViewerHeader}><Avatar size={34} user={group?.user} /><View><Text style={styles.storyViewerName}>{userName(group?.user)}</Text>{group?.activeStatus?.label ? <Text style={styles.storyViewerStatus}>{group.activeStatus.label}</Text> : null}</View></View>{url ? <Image resizeMode="contain" source={{ uri: url }} style={styles.storyImage} /> : <ScreenState icon="eye-outline" title="No story media" message="This person has a status but no active story media." />}{story?.caption ? <Text style={styles.storyCaption}>{story.caption}</Text> : null}</SafeAreaView></Modal>;
}

function ComposerModal({ onClose, onCreated, session, visible }: { onClose: () => void; onCreated: (post: WallPost) => void; session: Session; visible: boolean }) {
  const [text, setText] = useState('');
  const [context, setContext] = useState<typeof contextOptions[number]>('RIGHT_NOW');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const { post } = await api.createWallPost({ text: text.trim(), context, location: location.trim() }, session.accessToken);
      onCreated(post);
      setText('');
      setLocation('');
      onClose();
    } catch (error) {
      Alert.alert('Could not publish', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Share what you have seen</Text><Pressable accessibilityLabel="Close composer" onPress={onClose}><Ionicons color={colors.muted} name="close" size={24} /></Pressable></View><View style={styles.composerIdentity}><Avatar size={36} user={session.user} /><Text style={styles.composerName}>{userName(session.user)}</Text></View><TextInput autoFocus multiline onChangeText={setText} placeholder="Share what you've seen..." placeholderTextColor={colors.faint} style={styles.composerInput} value={text} /><ScrollView contentContainerStyle={styles.contextRow} horizontal showsHorizontalScrollIndicator={false}>{contextOptions.map((item) => <Pressable key={item} onPress={() => setContext(item)} style={[styles.contextPick, context === item && styles.contextPickActive]}><Text style={[styles.contextPickText, context === item && styles.contextPickTextActive]}>{contextLabels[item]}</Text></Pressable>)}</ScrollView><TextInput onChangeText={setLocation} placeholder="Location optional" placeholderTextColor={colors.faint} style={styles.locationInput} value={location} /><Pressable accessibilityRole="button" disabled={busy || !text.trim()} onPress={submit} style={[styles.publishButton, (!text.trim() || busy) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.publishText}>Publish</Text>}</Pressable></View></KeyboardAvoidingView></Modal>;
}

function CommentsModal({ onClose, post, session, updatePost }: { onClose: () => void; post: WallPost | null; session: Session; updatePost: (post: WallPost) => void }) {
  const [comments, setComments] = useState<WallComment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const id = post?.originalPostId || post?.id || '';
  const load = useCallback(async () => {
    if (!post) return;
    setLoading(true);
    try { setComments((await api.getWallComments(id, post.shareId, session.accessToken)).comments || []); } catch { setComments([]); } finally { setLoading(false); }
  }, [id, post, session.accessToken]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    if (!post || !text.trim()) return;
    setPosting(true);
    try {
      const { engagement } = await api.commentOnWall(id, text.trim(), post.shareId, session.accessToken);
      updatePost({ ...post, ...engagement });
      setText('');
      await load();
    } catch (error) {
      Alert.alert('Comment failed', error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setPosting(false);
    }
  };
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={Boolean(post)} onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Comments</Text><Pressable accessibilityLabel="Close comments" onPress={onClose}><Ionicons color={colors.muted} name="close" size={24} /></Pressable></View>{loading ? <ActivityIndicator color={colors.blue} /> : <FlatList data={comments} keyExtractor={(item) => item.id} ListEmptyComponent={<Text style={styles.emptySmall}>No comments yet.</Text>} renderItem={({ item }) => <View style={styles.commentRow}><Avatar size={28} user={item.author} /><View style={styles.commentBubble}><Text style={styles.commentName}>{userName(item.author)}</Text><Text style={styles.commentText}>{item.text}</Text></View></View>} style={styles.commentsList} />}<View style={styles.commentInputRow}><TextInput onChangeText={setText} placeholder="Add a comment" placeholderTextColor={colors.faint} style={styles.commentInput} value={text} /><Pressable accessibilityLabel="Send comment" disabled={posting || !text.trim()} onPress={send} style={styles.sendCircle}>{posting ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons color={colors.bg} name="send" size={16} />}</Pressable></View></View></KeyboardAvoidingView></Modal>;
}

function WallPostCard({ onComment, post, session, updatePost }: { onComment: (post: WallPost) => void; post: WallPost; session: Session; updatePost: (post: WallPost) => void }) {
  const [busy, setBusy] = useState('');
  const id = post.originalPostId || post.id;
  const media = post.media?.[0];
  const mediaUrl = resolveMediaUrl(media?.url || media?.secureUrl || '');
  const author = post.creator;
  const isMine = String(post.creator?.id || post.creator?._id) === String(session.user.id || session.user._id);
  const applyEngagement = (engagement: Engagement) => updatePost({ ...post, ...engagement });
  const run = async (name: string, action: () => Promise<{ engagement: Engagement }>) => {
    if (busy) return;
    setBusy(name);
    try { applyEngagement((await action()).engagement); } catch (error) { Alert.alert('Action failed', error instanceof Error ? error.message : 'Please retry.'); } finally { setBusy(''); }
  };
  const nativeShare = () => Share.share({ title: '@seen Wall post', message: `${post.text}\n${WEB_BASE_URL}/posts/${id}` }).catch(() => undefined);
  return <View style={styles.postCard}>
    {post.sharedBy ? <Text style={styles.sharedLine}>{userName(post.sharedBy)} reposted</Text> : null}
    <View style={styles.postTop}><Avatar size={28} user={author} /><View style={styles.postMeta}><View style={styles.authorLine}><Text numberOfLines={1} style={styles.authorName}>{isMine ? 'You' : userName(author)}</Text>{post.creator?.verified ? <Ionicons color={colors.blue} name="checkmark-circle" size={12} /> : null}<Text style={styles.metaText}>· {post.location || 'At seen'} · {relativeTime(post.feedCreatedAt || post.createdAt)}</Text></View></View>{post.context ? <View style={styles.postChip}><Text numberOfLines={1} style={styles.postChipText}>{contextLabels[post.context] || post.context}</Text></View> : null}<Pressable accessibilityLabel="Post options" onPress={() => Alert.alert('Post options', isMine ? 'Edit and delete can be managed from the web profile for now.' : 'Report, block, and hide use the existing web safety tools.') }><Ionicons color={colors.faint} name="ellipsis-horizontal" size={18} /></Pressable></View>
    {post.shareCaption ? <Text style={styles.shareCaption}>{post.shareCaption}</Text> : null}
    <Text style={styles.postText}>{post.text}</Text>
    {mediaUrl ? <Image resizeMode="cover" source={{ uri: mediaUrl }} style={styles.wallMedia} /> : null}
    <View style={styles.postActions}>
      <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => run('react', () => api.reactToWall(id, 'like', post.shareId, session.accessToken))} style={styles.statButton}><Ionicons color={post.viewerReaction ? colors.blue : colors.faint} name={(reactionIcons[post.viewerReaction || ''] || 'heart-outline') as keyof typeof Ionicons.glyphMap} size={18} /><Text style={[styles.statText, post.viewerReaction ? styles.activeText : null]}>{compact(post.reactionCount)}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => onComment(post)} style={styles.statButton}><Ionicons color={colors.faint} name="chatbubble-outline" size={18} /><Text style={styles.statText}>{compact(post.commentCount)}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => run('share', () => api.toggleWallShare(id, '', session.accessToken))} style={styles.statButton}><Ionicons color={post.viewerShared ? colors.blue : colors.faint} name="repeat" size={19} /><Text style={[styles.statText, post.viewerShared ? styles.activeText : null]}>{compact(post.shareCount)}</Text></Pressable>
      {Number.isFinite(post.viewCount) ? <View style={styles.statButton}><Ionicons color={colors.faint} name="eye-outline" size={18} /><Text style={styles.statText}>{compact(post.viewCount)}</Text></View> : null}
      <View style={styles.spacer} />
      <Pressable accessibilityLabel="Save post" disabled={Boolean(busy)} onPress={() => run('save', () => api.toggleWallSave(id, post.shareId, session.accessToken))}><Ionicons color={post.viewerSaved ? colors.blue : colors.faint} name={post.viewerSaved ? 'bookmark' : 'bookmark-outline'} size={20} /></Pressable>
      <Pressable accessibilityLabel="Share post" onPress={nativeShare}><Ionicons color={colors.faint} name="paper-plane-outline" size={20} /></Pressable>
    </View>
  </View>;
}

export function WallScreen({ onNavigate, session }: { onNavigate: (key: MainTab) => void; session: Session }) {
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [sawYou, setSawYou] = useState<SawYouToday | null>(null);
  const [filter, setFilter] = useState<typeof filters[number]['key']>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentPost, setCommentPost] = useState<WallPost | null>(null);
  const [storyGroup, setStoryGroup] = useState<StoryGroup | null>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      const [wall, storyData, today] = await Promise.all([api.listWall(40, session.accessToken), api.listWallStories(session.accessToken), api.getSawYouToday(session.accessToken)]);
      setPosts(wall.items || []);
      setStories([...(storyData.viewer ? [{ user: storyData.viewer, activeStatus: storyData.viewer.activeStatus, stories: storyData.viewer.stories, storyCount: storyData.viewer.storyCount, hasUnseenStories: storyData.viewer.hasUnseenStories }] : []), ...(storyData.items || [])]);
      setSawYou(today);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Wall is unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.accessToken]);
  useEffect(() => { load(); }, [load]);
  const visiblePosts = useMemo(() => {
    const selected = filters.find((item) => item.key === filter);
    if (!selected?.contexts.length) return posts;
    return posts.filter((post) => selected.contexts.includes(post.context as never));
  }, [filter, posts]);
  const updatePost = (updated: WallPost) => setPosts((current) => current.map((item) => item.id === updated.id ? updated : item));
  const addPost = (post: WallPost) => setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
  const header = <><StoryPresenceRow onOpenStory={setStoryGroup} onStatus={() => onNavigate('profile')} session={session} stories={stories} /><ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>{filters.map((item) => <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.filterChip, filter === item.key && styles.filterChipActive]}><Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text></Pressable>)}</ScrollView>{sawYou && sawYou.count > 0 ? <Pressable onPress={() => onNavigate('profile')} style={styles.sawYou}><Text style={styles.sawYouText}>{sawYou.count} saw you today ›</Text></Pressable> : null}<Pressable accessibilityRole="button" onPress={() => setComposerOpen(true)} style={styles.inlineComposer}><Avatar size={28} user={session.user} /><Text style={styles.inlinePlaceholder}>Share what you've seen...</Text><Ionicons color={colors.faint} name="image-outline" size={18} /></Pressable></>;
  return <SafeAreaView style={styles.safe}><View style={styles.screen}>{loading ? <><StoryPresenceRow onOpenStory={() => undefined} onStatus={() => undefined} session={session} stories={[]} /><SkeletonRows count={5} /></> : <FlatList contentContainerStyle={styles.list} data={visiblePosts} keyExtractor={(item) => item.id} ListEmptyComponent={<ScreenState icon="easel-outline" title={error ? 'Wall could not load' : 'No posts here yet'} message={error || (filter === 'all' ? 'Real Wall posts will appear here.' : 'Try another filter.')} onPress={error ? load : undefined} />} ListHeaderComponent={header} refreshControl={<RefreshControl onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing} tintColor={colors.blue} />} renderItem={({ item }) => <WallPostCard onComment={setCommentPost} post={item} session={session} updatePost={updatePost} />} /> }<StoryModal group={storyGroup} onClose={() => setStoryGroup(null)} session={session} /><ComposerModal onClose={() => setComposerOpen(false)} onCreated={addPost} session={session} visible={composerOpen} /><CommentsModal onClose={() => setCommentPost(null)} post={commentPost} session={session} updatePost={updatePost} /><BottomNav active="wall" avatar={session.user.avatar} name={session.user.name || session.user.username} onSelect={onNavigate} /></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: 10 },
  storyRow: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10, gap: 14 },
  storyItem: { width: 64, alignItems: 'center' },
  seenBubble: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  storyAvatar: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  storyAvatarActive: { borderColor: colors.blue },
  storyName: { color: colors.text, fontSize: 10, fontWeight: '800', marginTop: 6, maxWidth: 64 },
  storyStatus: { color: colors.blue, fontSize: 9, fontWeight: '800', marginTop: 2, maxWidth: 70 },
  storyViewer: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  storyViewerHeader: { position: 'absolute', left: 16, top: 48, right: 70, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 },
  storyViewerName: { color: colors.text, fontSize: 13, fontWeight: '900' },
  storyViewerStatus: { color: colors.blue, fontSize: 10, marginTop: 2 },
  storyClose: { position: 'absolute', right: 16, top: 45, zIndex: 3, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.08)' },
  storyImage: { width: '100%', height: '72%' },
  storyCaption: { color: colors.text, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28 },
  filters: { paddingHorizontal: 18, paddingVertical: 7, gap: 7 },
  filterChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 99, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  filterChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: '900' },
  filterTextActive: { color: colors.bg },
  sawYou: { paddingHorizontal: 18, paddingVertical: 4 },
  sawYouText: { color: colors.muted, fontSize: 11 },
  inlineComposer: { minHeight: 50, marginHorizontal: 18, marginTop: 4, marginBottom: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  inlinePlaceholder: { color: colors.muted, fontSize: 12, flex: 1 },
  postCard: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  sharedLine: { color: colors.faint, fontSize: 10, marginBottom: 8, marginLeft: 38 },
  postTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  postMeta: { flex: 1, minWidth: 0 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  authorName: { color: colors.text, fontSize: 12, fontWeight: '900', maxWidth: 82 },
  metaText: { color: colors.faint, fontSize: 10, flexShrink: 1 },
  postChip: { maxWidth: 98, borderRadius: 99, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, paddingHorizontal: 9, paddingVertical: 4 },
  postChipText: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  shareCaption: { color: colors.blue, fontSize: 12, lineHeight: 18, marginTop: 10 },
  postText: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 10 },
  wallMedia: { marginTop: 12, width: 104, height: 104, borderRadius: 12, backgroundColor: colors.surface2 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 13 },
  statButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34 },
  statText: { color: colors.faint, fontSize: 11, fontWeight: '700' },
  activeText: { color: colors.blue },
  spacer: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.58)' },
  sheet: { maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.25)', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  composerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 },
  composerName: { color: colors.text, fontSize: 13, fontWeight: '900' },
  composerInput: { minHeight: 116, color: colors.text, fontSize: 16, lineHeight: 23, textAlignVertical: 'top', marginTop: 14 },
  contextRow: { gap: 7, paddingVertical: 10 },
  contextPick: { borderRadius: 99, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 11, paddingVertical: 7 },
  contextPickActive: { borderColor: colors.blue, backgroundColor: 'rgba(156,203,255,.12)' },
  contextPickText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  contextPickTextActive: { color: colors.blue },
  locationInput: { height: 44, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 12, fontSize: 13 },
  publishButton: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue, marginTop: 12 },
  publishText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  disabled: { opacity: .55 },
  emptySmall: { color: colors.muted, textAlign: 'center', paddingVertical: 28 },
  commentsList: { maxHeight: 360, marginTop: 12 },
  commentRow: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  commentBubble: { flex: 1, backgroundColor: colors.surface2, borderRadius: 13, padding: 10 },
  commentName: { color: colors.text, fontSize: 11, fontWeight: '900' },
  commentText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  commentInput: { flex: 1, height: 42, borderRadius: 21, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 14 },
  sendCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue },
});
