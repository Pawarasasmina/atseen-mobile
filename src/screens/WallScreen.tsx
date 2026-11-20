import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { SeenVoiceComment } from '../components/SeenVoiceComment';
import { SeenAudio, SeenMedia } from '../components/SeenMedia';
import { initialWallFilters, mergeWallPosts, normalizeWallPost, updateWallPost, wallNeeds, wallQuery, wallTopics, wallTopicOptions } from '../utils/wall';
import type { WallFilters } from '../utils/wall';
import { Avatar } from '../components/Avatar';
import { BottomNav } from '../components/BottomNav';
import { ScreenState, SkeletonRows } from '../components/ScreenState';
import { api, resolveMediaUrl, WEB_BASE_URL } from '../services/api';
import { colors } from '../theme';
import { compact, firstName, relativeTime, userAvatar, userName } from '../utils/format';
import type { CreateTarget, MainTab, SawYouToday, Session, StoryGroup, WallComment, WallPost } from '../types';

const contextLabels: Record<string, string> = { RIGHT_NOW: 'Right now', COFFEE: 'Coffee', NEED_HELP: 'Need help', PLACE: 'Places', RESTAURANT: 'Food', BOOK: 'Book', MOVIE: 'Movie', TRAVEL: 'Travel', BUSINESS: 'Business', FITNESS: 'Fitness', WELLNESS: 'Wellness', LIFESTYLE: 'Lifestyle', BEAUTY: 'Beauty' };
const reactionIcons: Record<string, string> = { like: 'thumbs-up', love: 'heart', care: 'sparkles', fire: 'flame' };

function StoryPresenceRow({ onOpenStory, onStatus, onSeen, session, stories }: { onOpenStory: (group: StoryGroup) => void; onStatus: () => void; onSeen: () => void; session: Session; stories: StoryGroup[] }) {
  const viewer = stories.find(group => String(group.user?.id || group.user?._id) === String(session.user.id || session.user._id)) || { user: session.user, activeStatus: session.user.activeStatus };
  const rows = [viewer, ...stories.filter((item) => String(item.user?.id || item.user?._id) !== String(session.user.id || session.user._id))];
  return <ScrollView contentContainerStyle={styles.storyRow} horizontal showsHorizontalScrollIndicator={false}>
    <Pressable onPress={onSeen} accessibilityLabel="@seen" accessibilityRole="button" style={styles.storyItem}><View style={styles.seenBubble}><Ionicons color={colors.blue} name="eye" size={25} /></View><Text numberOfLines={1} style={styles.storyName}>seen ✓</Text></Pressable>
    {rows.map((group, index) => {
      const active = Boolean(group.activeStatus?.label || group.hasUnseenStories);
      const name = index === 0 ? 'Your story' : firstName(userName(group.user));
      return <Pressable accessibilityLabel={name} accessibilityRole="button" key={`${group.user?.id || group.user?._id || index}`} onPress={() => index === 0 && !group.stories?.length ? onStatus() : onOpenStory(group)} style={styles.storyItem}>
        <View style={[styles.storyAvatar, active && styles.storyAvatarActive]}><Avatar size={52} user={group.user} />{index === 0 ? <View style={styles.storyBadge}><Ionicons name="add" size={12} color={colors.blue} /></View> : group.activeStatus?.emoji ? <View style={styles.storyBadge}><Text style={{ fontSize: 11 }}>{group.activeStatus.emoji}</Text></View> : null}</View>
        <Text numberOfLines={1} style={styles.storyName}>{name}</Text>
        {group.activeStatus?.label ? <Text numberOfLines={1} style={[styles.storyStatus, group.activeStatus.color ? { color: group.activeStatus.color } : null]}>{group.activeStatus.label}</Text> : <Text numberOfLines={1} style={styles.storyStatus}>{' '}</Text>}
      </Pressable>;
    })}
  </ScrollView>;
}

function StoryModal({ group, onClose, session }: { group: StoryGroup | null; onClose: () => void; session: Session }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [group]);
  const story = group?.stories?.[index];
  const url = resolveMediaUrl(story?.mediaUrl || story?.thumbnailUrl || userAvatar(group?.user) || '');
  useEffect(() => { if (story?.id) api.markStoryViewed(story.id, session.accessToken).catch(() => undefined); }, [session.accessToken, story?.id]);
  return <Modal animationType="fade" visible={Boolean(group)} onRequestClose={onClose}><SafeAreaView style={styles.storyViewer}><Pressable accessibilityLabel="Close story" onPress={onClose} style={styles.storyClose}><Ionicons color={colors.text} name="close" size={24} /></Pressable><View style={styles.storyViewerHeader}><Avatar size={34} user={group?.user} /><View><Text style={styles.storyViewerName}>{userName(group?.user)}</Text>{group?.activeStatus?.label ? <Text style={styles.storyViewerStatus}>{group.activeStatus.label}</Text> : null}<Text style={styles.metaText}>{group?.stories?.length ? `${index + 1} / ${group.stories.length}` : ''}</Text></View></View>{url ? <View style={styles.storyImage}>{story?.mediaType === 'video' || story?.type === 'video' ? <SeenMedia key={story.id} active={Boolean(group)} media={{ url, mediaType: 'video' }} /> : <Image resizeMode="contain" source={{ uri: url }} style={{ width: '100%', height: '100%' }} />}</View> : <ScreenState icon="eye-outline" title="No story media" message="This person has a status but no active story media." />}{story?.caption ? <Text style={styles.storyCaption}>{story.caption}</Text> : null}<View style={styles.storyControls}><Pressable accessibilityLabel="Previous story" disabled={!index} onPress={() => setIndex(current => current - 1)}><Ionicons name="chevron-back" size={28} color={index ? colors.text : colors.faint} /></Pressable><Pressable accessibilityLabel="Next story" onPress={() => index + 1 < (group?.stories?.length || 0) ? setIndex(current => current + 1) : onClose()}><Ionicons name="chevron-forward" size={28} color={colors.text} /></Pressable></View></SafeAreaView></Modal>;
}

function ComposerModal({ onClose, onCreated, session, visible }: { onClose: () => void; onCreated: (post: WallPost) => void; session: Session; visible: boolean }) {
  const [text, setText] = useState('');
  const [context, setContext] = useState<string>('Need Help');
  const [topic, setTopic] = useState('');
  const [rightNow, setRightNow] = useState(false);
  const [price, setPrice] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voice, setVoice] = useState<{ uri: string; waveform: number[] } | null>(null);
  useEffect(() => { if (!visible) setVoiceOpen(false); }, [visible]);
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const publishKey = useRef(`wall-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const lock = useRef(false);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if ((!text.trim() && !voice) || voiceOpen || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries({ text: text.trim(), postType: context, context: '', topic, rightNow: String(rightNow || context === 'Right Now'), location: location.trim(), entityRefs: '[]', ...(context === 'Buy & Sell' && price ? { price } : {}) }).forEach(([key, value]) => body.append(key, value));
      images.forEach(image => body.append('media', { uri: image.uri, type: image.mimeType || 'image/jpeg', name: image.fileName || 'wall-photo.jpg' } as unknown as Blob));
      if (voice) { body.append('voice', { uri: voice.uri, name: 'wall-voice.m4a', type: 'audio/mp4' } as unknown as Blob); body.append('waveform', JSON.stringify(voice.waveform)); }
      const { post } = await api.publishWallNote(body, publishKey.current, session.accessToken);
      onCreated(post);
      setText('');
      setLocation('');
      setImages([]); setVoice(null); setVoiceOpen(false); setPrice(''); setTopic(''); setRightNow(false);
      publishKey.current = `wall-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      onClose();
    } catch (error) {
      Alert.alert('Could not publish', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const pickImages = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 4, quality: .85 });
      if (!result.canceled) setImages(result.assets.slice(0, 4));
    } catch (error) { Alert.alert('Could not select photos', error instanceof Error ? error.message : 'Please try again.'); }
  };
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={() => { if (!busy) onClose(); }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>What do you need today?</Text><Pressable disabled={busy} accessibilityLabel="Close composer" onPress={onClose}><Ionicons color={colors.muted} name="close" size={24} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled"><View style={styles.composerIdentity}><Avatar size={36} user={session.user} /><Text style={styles.composerName}>{userName(session.user)}</Text></View><TextInput editable={!busy} maxLength={2000} multiline onChangeText={setText} placeholder="Write your note…" placeholderTextColor={colors.faint} style={styles.composerInput} value={text} /><Text style={styles.metaText}>{text.length}/2000</Text><ScrollView contentContainerStyle={styles.contextRow} horizontal showsHorizontalScrollIndicator={false}>{wallNeeds.filter(item => item.field === 'type').map((item) => <Pressable disabled={busy} key={item.key} onPress={() => setContext(item.value)} style={[styles.contextPick, context === item.value && styles.contextPickActive]}><Text style={[styles.contextPickText, context === item.value && styles.contextPickTextActive]}>{item.value}</Text></Pressable>)}</ScrollView><ScrollView contentContainerStyle={styles.contextRow} horizontal showsHorizontalScrollIndicator={false}>{wallTopics.map(item => <Pressable disabled={busy} key={item} onPress={() => setTopic(topic === item ? '' : item)} style={[styles.contextPick, topic === item && styles.contextPickActive]}><Text style={styles.contextPickText}>{item}</Text></Pressable>)}</ScrollView><TextInput editable={!busy} maxLength={120} onChangeText={setLocation} placeholder="Place or city" placeholderTextColor={colors.faint} style={styles.locationInput} value={location} />{context === 'Buy & Sell' ? <TextInput editable={!busy} keyboardType="number-pad" onChangeText={setPrice} placeholder="Price (optional)" placeholderTextColor={colors.faint} style={styles.locationInput} value={price} /> : null}<View style={styles.contextRow}><Pressable disabled={busy} onPress={() => setVoiceOpen(true)}><Text style={styles.activeText}>Voice note</Text></Pressable><Pressable disabled={busy} onPress={() => setRightNow(!rightNow)}><Text style={styles.activeText}>{rightNow ? '◉' : '○'} Right now</Text></Pressable><Pressable disabled={busy} onPress={pickImages}><Text style={styles.activeText}>＋ Photos ({images.length}/4)</Text></Pressable></View>{images.length ? <ScrollView horizontal>{images.map(image => <Pressable disabled={busy} accessibilityLabel="Remove photo" key={image.uri} onPress={() => setImages(images.filter(item => item.uri !== image.uri))}><Image source={{ uri: image.uri }} style={{ width: 72, height: 72, borderRadius: 12, margin: 4 }} /></Pressable>)}</ScrollView> : null}{voiceOpen ? <SeenVoiceComment onCancel={() => setVoiceOpen(false)} onError={message => Alert.alert('Voice note', message)} onSend={async (uri, waveform) => { setVoice({ uri, waveform }); setVoiceOpen(false); }} /> : voice ? <View><SeenAudio active={visible} uri={voice.uri} /><Pressable disabled={busy} onPress={() => setVoice(null)}><Text style={styles.searchNotice}>Remove voice note</Text></Pressable></View> : null}</ScrollView><Pressable accessibilityRole="button" disabled={busy || voiceOpen || (!text.trim() && !voice)} onPress={submit} style={[styles.publishButton, ((!text.trim() && !voice) || busy || voiceOpen) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.publishText}>Publish note</Text>}</Pressable></View></KeyboardAvoidingView></Modal>;
}

export function CommentsModal({ onClose, post, session, updatePost }: { onClose: () => void; post: WallPost | null; session: Session; updatePost: (post: WallPost) => void }) {
  const postingLocked = useRef(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const revision = useRef(0);
  const [loadError, setLoadError] = useState('');
  const [comments, setComments] = useState<WallComment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const id = post?.originalPostId || post?.id || '';
  const detailAction = async (action: () => Promise<{ post: WallPost }>) => {
    if (postingLocked.current) return;
    postingLocked.current = true; setPosting(true);
    try { updatePost((await action()).post); }
    catch (reason) { Alert.alert('Could not update note', reason instanceof Error ? reason.message : 'Please retry.'); }
    finally { postingLocked.current = false; setPosting(false); }
  };
  const load = useCallback(async () => {
    if (!post) return;
    const request = ++revision.current;
    setLoading(true); setLoadError('');
    try { const rows = post.author ? (await api.getFeedPost(id)).post.comments || [] : (await api.getWallComments(id, post.shareId, session.accessToken)).comments || []; if (request === revision.current) setComments(rows); } catch (e) { if (request === revision.current) setLoadError(e instanceof Error ? e.message : 'Comments could not load.'); } finally { if (request === revision.current) setLoading(false); }
  }, [id, post, session.accessToken]);
  useEffect(() => { load(); return () => { revision.current++; }; }, [load]);
  useEffect(() => { setText(''); setComments([]); setVoiceOpen(false); }, [id]);
  useEffect(() => { if (!post) setVoiceOpen(false); }, [post]);
  const send = async () => {
    if (!post || !text.trim() || postingLocked.current) return;
    postingLocked.current = true;
    setPosting(true);
    try {
      if (post.author) updatePost((await api.commentOnFeedPost(id, text.trim())).post);
      else {
        const { engagement } = await api.commentOnWall(id, text.trim(), post.shareId, session.accessToken);
        updatePost({ ...post, ...engagement });
      }
      setText('');
      await load();
    } catch (error) {
      Alert.alert('Comment failed', error instanceof Error ? error.message : 'Please retry.');
    } finally {
      postingLocked.current = false;
      setPosting(false);
    }
  };
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={Boolean(post)} onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Comments</Text><Pressable accessibilityLabel="Close comments" onPress={onClose}><Ionicons color={colors.muted} name="close" size={24} /></Pressable></View>{post && (post.text || post.media?.length) ? <ScrollView style={{ maxHeight: 260 }}><View style={styles.composerIdentity}><Avatar size={30} user={post.author || post.creator} /><Text style={styles.composerName}>{userName(post.author || post.creator)}</Text><Text style={styles.metaText}>{post.postType}</Text></View><Text style={styles.postText}>{post.text}</Text>{post.media?.map((media, index) => media.type === 'audio' ? <SeenAudio key={media.id || index} active={Boolean(post)} uri={media.url || ''} /> : <View style={styles.wallMedia} key={media.id || index}><SeenMedia media={{ ...media, mediaType: media.type }} /></View>)}{post.author ? <View style={styles.postActions}><Pressable disabled={posting} onPress={() => detailAction(() => api.reactToFeedPost(id, post.viewerReaction || 'like'))}><Ionicons name={post.viewerReaction ? 'heart' : 'heart-outline'} color={colors.blue} size={21} /></Pressable><Pressable disabled={posting} onPress={() => detailAction(() => api.saveFeedPost(id))}><Ionicons name={post.viewerSaved ? 'bookmark' : 'bookmark-outline'} color={colors.blue} size={21} /></Pressable><Pressable onPress={() => Share.share({ message: `${post.text}\n${WEB_BASE_URL}/posts/${id}` }).catch(() => undefined)}><Ionicons name="paper-plane-outline" color={colors.blue} size={21} /></Pressable></View> : null}</ScrollView> : null}{loadError ? <Pressable onPress={load}><Text style={{ color: colors.danger, fontSize: 12, paddingVertical: 10 }}>{loadError} · Retry</Text></Pressable> : null}{loading ? <ActivityIndicator color={colors.blue} /> : <FlatList data={comments} keyExtractor={(item) => item.id} ListEmptyComponent={loadError ? undefined : <Text style={styles.emptySmall}>No comments yet.</Text>} renderItem={({ item }) => <View style={styles.commentRow}><Avatar size={28} user={item.author} /><View style={styles.commentBubble}><Text style={styles.commentName}>{userName(item.author)}</Text><Text style={styles.commentText}>{item.text}</Text>{item.audio?.url ? <SeenAudio active={Boolean(post)} uri={item.audio.url} /> : null}</View></View>} style={styles.commentsList} />}{voiceOpen && post?.author ? <SeenVoiceComment onCancel={() => setVoiceOpen(false)} onError={message => Alert.alert('Voice comment', message)} onSend={async (uri, waveform) => { if (postingLocked.current) return; postingLocked.current = true; setPosting(true); try { updatePost((await api.voiceCommentOnFeedPost(id, uri, waveform, text.trim())).post); setText(''); setVoiceOpen(false); await load(); } finally { postingLocked.current = false; setPosting(false); } }} /> : null}<View style={styles.commentInputRow}>{post?.author ? <Pressable accessibilityLabel="Record voice comment" disabled={posting} onPress={() => setVoiceOpen(!voiceOpen)}><Ionicons name="mic-outline" size={22} color={colors.blue} /></Pressable> : null}<TextInput maxLength={500} onChangeText={setText} placeholder="Add a comment" placeholderTextColor={colors.faint} style={styles.commentInput} value={text} /><Pressable accessibilityLabel="Send comment" disabled={posting || !text.trim()} onPress={send} style={styles.sendCircle}>{posting ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons color={colors.bg} name="send" size={16} />}</Pressable></View></View></KeyboardAvoidingView></Modal>;
}

function WallPostCard({ onComment, onRemove, onEdit, post, session, updatePost, grid = false }: { onComment: (post: WallPost) => void; onRemove: (id: string, authorId?: string) => void; onEdit: (post: WallPost) => void; post: WallPost; session: Session; updatePost: (post: WallPost) => void; grid?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ title: string; items: { text: string; onPress?: () => void; style?: string }[] } | null>(null);
  const showMenu = (title: string, items: { text: string; onPress?: () => void; style?: string }[]) => setMenu({ title, items });
  const locked = useRef(false);
  const id = post.originalPostId || post.id;
  const author = post.author || post.creator;
  const isMine = String(author?.id || author?._id) === String(session.user.id || session.user._id);
  const run = async (action: () => Promise<{ post: WallPost }>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { updatePost((await action()).post); }
    catch (error) { Alert.alert('Action failed', error instanceof Error ? error.message : 'Please retry.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const action = async (kind: 'hide' | 'report' | 'block-author' | 'archive' | 'delete' | 'bump' | 'resolution', payload = {}) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const result = await api.wallPostAction(id, kind, payload);
      if (result.post) updatePost(result.post);
      if (['hide', 'block-author', 'archive', 'delete'].includes(kind)) onRemove(id, kind === 'block-author' ? String(author?.id || author?._id) : undefined);
      if (kind === 'report') Alert.alert('Report sent', 'Your report will be reviewed.');
    } catch (error) { Alert.alert('Action failed', error instanceof Error ? error.message : 'Please retry.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const options = () => showMenu('Note options', isMine ? [
    ...(post.canEdit ? [{ text: 'Edit note', onPress: () => onEdit(post) }] : []),
    ...(post.canResolve ? [{ text: post.resolvedAt ? 'Reopen note' : 'Mark as solved', onPress: () => action('resolution', { solved: !post.resolvedAt }) }] : []),
    ...(post.canBump ? [{ text: 'Bring back up', onPress: () => action('bump') }] : []),
    { text: 'Archive', onPress: () => action('archive') },
    { text: 'Delete', style: 'destructive' as const, onPress: () => Alert.alert('Delete note?', 'This permanently deletes your note.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => action('delete') }]) },
    { text: 'Cancel', style: 'cancel' },
  ] : [
    { text: 'Hide note', onPress: () => action('hide', { reason: 'NOT_USEFUL' }) },
    { text: 'Report note', onPress: () => showMenu('Report note', ['SPAM', 'SCAM', 'HARASSMENT', 'OTHER'].map(reason => ({ text: reason.toLowerCase(), onPress: () => { action('report', { reason }); } })).concat([{ text: 'Cancel', onPress: () => undefined }])) },
    { text: 'Block author', style: 'destructive', onPress: () => Alert.alert('Block author?', 'Their posts will be removed from your feed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: () => action('block-author') }]) },
    { text: 'Cancel', style: 'cancel' },
  ]);
  const nativeShare = () => Share.share({ title: '@seen Wall note', message: `${post.text}\n${WEB_BASE_URL}/posts/${id}` }).catch(() => undefined);
  if (grid) return <Pressable accessibilityLabel={`Open note by ${userName(author)}`} onPress={() => onComment(post)} style={styles.gridCard}><View style={styles.gridMedia}>{post.media?.[0] ? <SeenMedia active={false} media={{ ...post.media[0], mediaType: post.media[0].type }} /> : <Text numberOfLines={7} style={styles.gridText}>{post.text}</Text>}</View><Text style={styles.gridPrice}>{post.price != null ? `${post.currency || ''} ${post.price}` : post.postType || post.context || 'Note'}</Text><Text numberOfLines={2} style={styles.gridCaption}>{post.text}</Text><Text numberOfLines={1} style={styles.metaText}>{userName(author)} &#183; {post.location || 'Worldwide'}</Text></Pressable>;
  return <><Modal transparent animationType="fade" visible={Boolean(menu)} onRequestClose={() => setMenu(null)}><View style={styles.modalBackdrop}><View style={styles.sheet}><Text style={styles.sheetTitle}>{menu?.title}</Text><ScrollView>{menu?.items.map((item, index) => <Pressable key={index} accessibilityRole="button" onPress={() => { setMenu(null); item.onPress?.(); }} style={{ paddingVertical: 16 }}><Text style={{ color: item.style === 'destructive' ? colors.danger : colors.text, fontSize: 15 }}>{item.text}</Text></Pressable>)}</ScrollView><Pressable onPress={() => setMenu(null)}><Text style={styles.searchNotice}>Close</Text></Pressable></View></View></Modal><View style={styles.postCard}>
    {post.sharedBy ? <Text style={styles.sharedLine}>{userName(post.sharedBy)} reposted</Text> : null}
    <View style={styles.postTop}><Avatar size={36} user={author} /><View style={styles.postMeta}><View style={styles.authorLine}><Text numberOfLines={1} style={styles.authorName}>{isMine ? 'You' : userName(author)}</Text>{author?.verified || author?.isVerified ? <Ionicons color={colors.blue} name="checkmark-circle" size={12} /> : null}</View><Text numberOfLines={1} style={styles.metaText}><Text style={styles.activeText}>{post.postType || contextLabels[post.context || ''] || post.context || 'Note'}</Text>{post.rightNow ? ' \u00b7 now' : ''} &#183; {relativeTime(post.feedCreatedAt || post.createdAt)}{post.location ? ` \u00b7 ${post.location}` : ''}</Text></View><Ionicons name="eye-outline" size={12} color={colors.faint} /><Text style={styles.metaText}>{compact(post.viewCount)}</Text><Pressable disabled={busy} accessibilityLabel="Note options" onPress={options} hitSlop={12}><Ionicons color={colors.faint} name="ellipsis-horizontal" size={18} /></Pressable></View>
    <View style={styles.postBody}>{post.shareCaption ? <Text style={styles.shareCaption}>{post.shareCaption}</Text> : null}<Text style={styles.postText}>{post.text}</Text>{post.price != null ? <Text style={styles.gridPrice}>{post.currency} {post.price}</Text> : null}
    {post.media?.map((media, index) => media.type === 'audio' ? <SeenAudio key={media.id || index} active uri={media.url || ''} /> : <View key={media.id || index} style={styles.wallMedia}><SeenMedia media={{ ...media, mediaType: media.type }} /></View>)}
    {post.isClosed ? <Text style={styles.metaText}>Closed</Text> : null}
    <View style={styles.postActions}>
      <Pressable accessibilityLabel="React to note; hold to choose reaction" disabled={busy} onLongPress={() => showMenu('Choose reaction', ['like', 'love', 'care', 'fire'].map(reaction => ({ text: reaction, onPress: () => run(() => api.reactToFeedPost(id, reaction)) })))} onPress={() => run(() => api.reactToFeedPost(id, post.viewerReaction || 'like'))} style={styles.statButton}><Ionicons color={post.viewerReaction ? colors.blue : colors.faint} name={(reactionIcons[post.viewerReaction || ''] || 'heart-outline') as keyof typeof Ionicons.glyphMap} size={18} /><Text style={styles.statText}>{compact(post.reactionCount)}</Text></Pressable>
      <Pressable accessibilityLabel="Comments" onPress={() => onComment(post)} style={styles.statButton}><Ionicons color={colors.faint} name="chatbubble-outline" size={18} /><Text style={styles.statText}>{compact(post.commentCount)}</Text></Pressable>
      {!isMine ? <Pressable accessibilityLabel="Repost note" disabled={busy} onPress={() => run(() => api.shareFeedPost(id))} style={styles.statButton}><Ionicons color={post.viewerShared ? colors.blue : colors.faint} name="repeat" size={19} /><Text style={styles.statText}>{compact(post.shareCount)}</Text></Pressable> : null}<View style={styles.spacer} /><Pressable accessibilityLabel={post.viewerSaved ? 'Unsave note' : 'Save note'} disabled={busy} onPress={() => run(() => api.saveFeedPost(id))} hitSlop={8}><Ionicons color={post.viewerSaved ? colors.blue : colors.faint} name={post.viewerSaved ? 'bookmark' : 'bookmark-outline'} size={18} /></Pressable><Pressable accessibilityLabel="Share note" onPress={nativeShare} hitSlop={8}><Ionicons color={colors.faint} name="paper-plane-outline" size={18} /></Pressable>
    </View></View>
  </View></>;
}

export function WallScreen({ createIntent, onCreateIntentHandled, onNavigate, session }: { createIntent?: CreateTarget | null; onCreateIntentHandled?: () => void; onNavigate: (key: MainTab) => void; session: Session }) {
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [sawYou, setSawYou] = useState<SawYouToday | null>(null);
  const [filters, setFilters] = useState<WallFilters>(initialWallFilters);
  const [view, setView] = useState<'feed' | 'grid'>('feed');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentPost, setCommentPost] = useState<WallPost | null>(null);
  const [storyGroup, setStoryGroup] = useState<StoryGroup | null>(null);
  const [sheet, setSheet] = useState<'needs' | 'location' | 'search' | null>(null);
  const [locationDraft, setLocationDraft] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [editPost, setEditPost] = useState<WallPost | null>(null);
  const [editText, setEditText] = useState('');
  const [editing, setEditing] = useState(false);
  const generation = useRef(0);
  const paging = useRef(false);
  const viewed = useRef(new Set<string>());
  const viewability = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 1000 }).current;
  const onVisible = useRef(({ viewableItems }: { viewableItems: { item: WallPost }[] }) => {
    viewableItems.forEach(({ item }) => {
      const id = item.originalPostId || item.id;
      if (viewed.current.has(id)) return;
      viewed.current.add(id);
      api.markWallViewed(id).then(result => setPosts(current => current.map(post => (post.originalPostId || post.id) === id ? { ...post, viewCount: result.viewCount } : post))).catch(() => viewed.current.delete(id));
    });
  }).current;
  const query = wallQuery(filters);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setError('');
    try {
      const result = await api.listWallFeed(query, session.accessToken);
      if (request !== generation.current) return;
      setPosts((result.items || []).map(normalizeWallPost)); setPage(1); setHasMore(result.pagination.page < (result.pagination.pages || 0));
    } catch (reason) { if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Wall is unavailable.'); }
    finally { if (request === generation.current) { setLoading(false); setRefreshing(false); } }
  }, [query, session.accessToken]);
  const loadExtras = useCallback(async () => {
    const results = await Promise.allSettled([api.listWallStories(session.accessToken), api.getSawYouToday(session.accessToken)]);
    if (results[0].status === 'fulfilled') {
      const data = results[0].value;
      setStories([...(data.viewer ? [{ user: data.viewer, activeStatus: data.viewer.activeStatus, stories: data.viewer.stories, storyCount: data.viewer.storyCount, hasUnseenStories: data.viewer.hasUnseenStories }] : []), ...(data.items || [])]);
    }
    if (results[1].status === 'fulfilled') setSawYou(results[1].value);
  }, [session.accessToken]);
  useEffect(() => { setLoading(true); setPosts([]); setHasMore(false); load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => { loadExtras(); api.getWallView().then(result => setView(result.view)).catch(() => undefined); }, [loadExtras]);
  useEffect(() => { if (createIntent === 'note') { setComposerOpen(true); onCreateIntentHandled?.(); } }, [createIntent, onCreateIntentHandled]);
  const loadMore = async () => {
    if (!hasMore || paging.current || loading || refreshing) return;
    paging.current = true; setLoadingMore(true);
    const request = generation.current;
    try { const result = await api.listWallFeed(wallQuery(filters, page + 1), session.accessToken); if (request !== generation.current) return; setPosts(current => mergeWallPosts(current, result.items.map(normalizeWallPost))); setPage(result.pagination.page); setHasMore(result.pagination.page < (result.pagination.pages || 0)); setError(''); }
    catch (reason) { if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Could not load more notes.'); }
    finally { paging.current = false; setLoadingMore(false); }
  };
  const updatePost = (updated: WallPost) => { setPosts(current => updateWallPost(current, updated)); setCommentPost(current => current && (current.originalPostId || current.id) === (updated.originalPostId || updated.id) ? { ...updated, id: current.id } : current); };
  const removePost = (id: string, authorId?: string) => setPosts(current => current.filter(post => (post.originalPostId || post.id) !== id && (!authorId || String((post.author || post.creator)?.id || (post.author || post.creator)?._id) !== authorId)));
  const toggle = (key: string) => setFilters(current => ({ ...current, selected: current.selected.includes(key) ? current.selected.filter(item => item !== key) : [...current.selected, key] }));
  const saveView = async (next: 'feed' | 'grid') => { const previous = view; setView(next); try { await api.setWallView(next); } catch (reason) { setView(previous); Alert.alert('Could not save view', reason instanceof Error ? reason.message : 'Please retry.'); } };
  const edit = async () => { if (!editPost || editing || !editText.trim()) return; setEditing(true); try { updatePost((await api.editFeedPost(editPost, editText.trim())).post); setEditPost(null); } catch (reason) { Alert.alert('Could not edit note', reason instanceof Error ? reason.message : 'Please retry.'); } finally { setEditing(false); } };
  const needButton = (item: typeof wallNeeds[number]) => { const selected = filters.selected.includes(item.key); return <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={item.key} onPress={() => toggle(item.key)} style={styles.needItem}><LinearGradient colors={selected ? ['#304356', '#172431'] : ['#292B2D', '#101214']} style={[styles.needCircle, selected && styles.needSelected]}><Ionicons name={item.icon} size={22} color={selected ? colors.blue : '#E5E5E5'} />{item.key === 'right_now' ? <View style={styles.liveDot} /> : null}</LinearGradient><Text numberOfLines={1} style={[styles.needLabel, selected && styles.activeText]}>{item.label}</Text></Pressable>; };
  const header = <>
    <View style={styles.wallHeader}><Text style={styles.wallTitle}>Wall</Text><View style={styles.spacer} /><Pressable accessibilityLabel="Search Wall" onPress={() => { setSearchDraft(filters.q); setSheet('search'); }} style={styles.headerCircle}><Ionicons name="search-outline" size={21} color={colors.muted} /></Pressable><Pressable accessibilityLabel="Create a note" onPress={() => setComposerOpen(true)} style={styles.headerCircle}><Ionicons name="add" size={22} color={colors.muted} /></Pressable></View>
    <Pressable accessibilityLabel="Choose Wall location" onPress={() => { setLocationDraft(filters.location); setSheet('location'); }} style={styles.locationButton}><Ionicons name="earth" size={13} color={colors.blue} /><Text style={styles.locationLabel}>{filters.location || 'Worldwide'}</Text><Ionicons name="chevron-down" size={11} color={colors.faint} /></Pressable>
    <StoryPresenceRow onSeen={() => onNavigate('seen')} onOpenStory={setStoryGroup} onStatus={() => onNavigate('profile')} session={session} stories={stories} />
    <Pressable accessibilityRole="button" onPress={() => setComposerOpen(true)} style={styles.inlineComposer}><Avatar size={30} user={session.user} /><Text style={styles.inlinePlaceholder}>What do you need today?</Text><View style={styles.composerPlus}><Ionicons name="add" color={colors.blue} size={18} /></View></Pressable>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Explore needs</Text><Pressable onPress={() => setSheet('needs')} hitSlop={10}><Text style={styles.allText}>All &#8250;</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.needsRow}>{wallNeeds.slice(0, 6).map(needButton)}<Pressable onPress={() => setSheet('needs')} style={styles.needItem}><View style={styles.needCircle}><Ionicons name="ellipsis-horizontal" color={colors.muted} size={22} /></View><Text style={styles.needLabel}>More</Text></Pressable></ScrollView>
    {sawYou && sawYou.count > 0 ? <Pressable onPress={() => onNavigate('profile')} style={styles.sawYou}><Text style={styles.sawYouText}>{sawYou.count} saw you today &#8250;</Text></Pressable> : null}
    <View style={styles.feedHeader}><Text numberOfLines={1} style={styles.feedHeading}>{filters.selected.length ? [...wallNeeds, ...wallTopicOptions.filter(item => item.key !== 'meet_people')].filter(item => filters.selected.includes(item.key)).map(item => item.label).join(' \u00b7 ') : 'For you'}<Text style={styles.feedLocation}> ? {filters.location || 'Worldwide'}</Text></Text><View style={styles.viewSwitch}>{(['feed', 'grid'] as const).map(mode => <Pressable key={mode} accessibilityLabel={`${mode} view`} accessibilityState={{ selected: view === mode }} onPress={() => saveView(mode)} style={[styles.viewButton, view === mode && styles.viewActive]}><Ionicons name={mode === 'feed' ? 'list-outline' : 'grid-outline'} color={view === mode ? colors.text : colors.faint} size={16} /></Pressable>)}</View></View>
    {filters.q ? <Pressable onPress={() => setFilters(current => ({ ...current, q: '' }))}><Text style={styles.searchNotice}>Search: {filters.q} &#215;</Text></Pressable> : null}
    {loading ? <SkeletonRows count={3} /> : null}
  </>;
  return <SafeAreaView style={styles.safe}><View style={styles.screen}><FlatList onViewableItemsChanged={onVisible} viewabilityConfig={viewability} key={view} numColumns={view === 'grid' ? 2 : 1} columnWrapperStyle={view === 'grid' ? styles.gridRow : undefined} contentContainerStyle={styles.list} data={loading ? [] : posts} keyExtractor={item => item.id} ListHeaderComponent={header} ListEmptyComponent={loading ? undefined : <ScreenState icon="easel-outline" title={error ? 'Wall could not load' : 'No notes here yet'} action={error ? 'Retry' : 'Clear filters'} message={error || 'Try another need or location, or share the first note.'} onPress={error ? load : () => setFilters(initialWallFilters)} />} ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.blue} style={{ padding: 20 }} /> : posts.length && error ? <Pressable onPress={load}><Text style={styles.searchNotice}>{error} &#183; Retry</Text></Pressable> : undefined} onEndReached={() => { if (!error) loadMore(); }} onEndReachedThreshold={.4} refreshControl={<RefreshControl onRefresh={() => { setRefreshing(true); load(); loadExtras(); }} refreshing={refreshing} tintColor={colors.blue} />} renderItem={({ item }) => <WallPostCard grid={view === 'grid'} onEdit={post => { setEditPost(post); setEditText(post.text); }} onRemove={removePost} onComment={post => { setCommentPost(post); api.markWallViewed(post.originalPostId || post.id).catch(() => undefined); }} post={item} session={session} updatePost={updatePost} />} />
    <Modal transparent animationType="slide" visible={Boolean(sheet)} onRequestClose={() => setSheet(null)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{sheet === 'needs' ? 'Explore needs' : sheet === 'location' ? 'Choose location' : 'Search Wall'}</Text><Pressable accessibilityLabel="Close" onPress={() => setSheet(null)}><Ionicons name="close" color={colors.muted} size={24} /></Pressable></View>{sheet === 'needs' ? <><ScrollView><View style={styles.allNeeds}>{wallNeeds.map(needButton)}</View><Pressable onPress={() => setFilters(current => ({ ...current, selected: [] }))}><Text style={styles.searchNotice}>Clear selection</Text></Pressable><Text style={styles.sectionTitle}>Topics</Text><View style={[styles.contextRow, { flexWrap: 'wrap' }]}>{wallTopicOptions.map(item => <Pressable key={item.key} accessibilityState={{ selected: filters.selected.includes(item.key) }} onPress={() => toggle(item.key)} style={[styles.contextPick, filters.selected.includes(item.key) && styles.contextPickActive]}><Text style={styles.contextPickText}>{item.label}</Text></Pressable>)}</View><Text style={styles.sectionTitle}>Sort by</Text><View style={styles.contextRow}>{['recent', 'popular'].map(sort => <Pressable key={sort} onPress={() => setFilters(current => ({ ...current, sort }))} style={[styles.contextPick, filters.sort === sort && styles.contextPickActive]}><Text style={styles.contextPickText}>{sort === 'recent' ? 'Recent' : 'Popular'}</Text></Pressable>)}</View></ScrollView><Pressable onPress={() => setSheet(null)} style={styles.publishButton}><Text style={styles.publishText}>Done</Text></Pressable></> : sheet === 'location' ? <><TextInput maxLength={120} value={locationDraft} onChangeText={setLocationDraft} placeholder="City or country" placeholderTextColor={colors.faint} style={[styles.locationInput, { marginTop: 20 }]} /><View style={styles.contextRow}>{['city', 'country', 'nearby'].map(scope => <Pressable key={scope} disabled={!locationDraft.trim()} onPress={() => { setFilters(current => ({ ...current, scope, location: locationDraft.trim() })); setSheet(null); }} style={styles.contextPick}><Text style={styles.contextPickText}>{scope}</Text></Pressable>)}</View><Pressable onPress={() => { setFilters(current => ({ ...current, scope: 'worldwide', location: '' })); setSheet(null); }} style={styles.publishButton}><Text style={styles.publishText}>Worldwide</Text></Pressable></> : <><TextInput autoFocus maxLength={120} value={searchDraft} onChangeText={setSearchDraft} placeholder="Search notes" placeholderTextColor={colors.faint} style={[styles.locationInput, { marginTop: 20 }]} onSubmitEditing={() => { setFilters(current => ({ ...current, q: searchDraft })); setSheet(null); }} /><Pressable onPress={() => { setFilters(current => ({ ...current, q: searchDraft })); setSheet(null); }} style={styles.publishButton}><Text style={styles.publishText}>Search</Text></Pressable></>}</View></KeyboardAvoidingView></Modal>
    <Modal visible={Boolean(editPost)} transparent animationType="slide" onRequestClose={() => { if (!editing) setEditPost(null); }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View style={styles.sheet}><Text style={styles.sheetTitle}>Edit note</Text><TextInput editable={!editing} multiline maxLength={2000} value={editText} onChangeText={setEditText} style={styles.composerInput} /><Pressable disabled={editing || !editText.trim()} onPress={edit} style={styles.publishButton}>{editing ? <ActivityIndicator /> : <Text style={styles.publishText}>Save changes</Text>}</Pressable><Pressable disabled={editing} onPress={() => setEditPost(null)}><Text style={styles.searchNotice}>Cancel</Text></Pressable></View></KeyboardAvoidingView></Modal>
    <StoryModal group={storyGroup} onClose={() => setStoryGroup(null)} session={session} /><ComposerModal onClose={() => setComposerOpen(false)} onCreated={() => { setFilters(initialWallFilters); load(); }} session={session} visible={composerOpen} /><CommentsModal onClose={() => setCommentPost(null)} post={commentPost} session={session} updatePost={updatePost} /><BottomNav compactProfile active="wall" avatar={session.user.avatar} name={session.user.name || session.user.username} onSelect={onNavigate} /></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  storyBadge: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.blue, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  storyControls: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
  wallHeader: { paddingHorizontal: 20, paddingTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  wallTitle: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -.6 },
  headerCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#191B1D', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginTop: 6, marginBottom: 4 },
  locationLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  composerPlus: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(156,203,255,.12)', alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { paddingHorizontal: 20, marginTop: 20, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -.3 },
  allText: { color: colors.blue, fontSize: 12, fontWeight: '600' },
  needsRow: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, gap: 14 },
  needItem: { width: 60, alignItems: 'center' },
  needCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,.17)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#191B1D' },
  needSelected: { borderColor: colors.blue },
  needLabel: { color: colors.muted, fontSize: 10.5, fontWeight: '600', marginTop: 7 },
  liveDot: { position: 'absolute', right: 2, top: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#F17878', borderWidth: 2, borderColor: colors.bg },
  allNeeds: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingVertical: 24 },
  feedHeader: { paddingHorizontal: 20, marginTop: 8, marginBottom: 6, flexDirection: 'row', gap: 10, alignItems: 'center' },
  feedHeading: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  feedLocation: { color: colors.faint, fontSize: 12, fontWeight: '400' },
  viewSwitch: { flexDirection: 'row', padding: 3, borderRadius: 18, backgroundColor: '#191B1D', borderWidth: 1, borderColor: colors.line },
  viewButton: { width: 30, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  viewActive: { backgroundColor: 'rgba(255,255,255,.12)' },
  searchNotice: { color: colors.blue, padding: 14, textAlign: 'center', fontSize: 12 },
  gridRow: { paddingHorizontal: 20, gap: 10 },
  gridCard: { flex: 1, maxWidth: '50%', marginTop: 14, marginBottom: 8 },
  gridMedia: { width: '100%', aspectRatio: 1, overflow: 'hidden', borderRadius: 15, backgroundColor: '#191B1D', justifyContent: 'center' },
  gridText: { padding: 14, color: colors.text, fontSize: 14, lineHeight: 21 },
  gridPrice: { color: colors.blue, fontWeight: '700', fontSize: 13, marginTop: 8 },
  gridCaption: { color: colors.text, fontSize: 13, lineHeight: 18, marginVertical: 4 },
  postBody: { marginLeft: 44 },
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: 10 },
  storyRow: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, gap: 14 },
  storyItem: { width: 64, alignItems: 'center' },
  seenBubble: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  storyAvatar: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  storyAvatarActive: { borderColor: colors.blue },
  storyName: { color: colors.blue, fontSize: 9, fontWeight: '400', marginTop: 6, maxWidth: 64 },
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
  inlineComposer: { minHeight: 58, marginHorizontal: 20, marginTop: 4, marginBottom: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 20, backgroundColor: '#151719', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  inlinePlaceholder: { color: colors.muted, fontSize: 14, flex: 1 },
  postCard: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  sharedLine: { color: colors.faint, fontSize: 10, marginBottom: 8, marginLeft: 38 },
  postTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  postMeta: { flex: 1, minWidth: 0 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  authorName: { color: colors.text, fontSize: 13, fontWeight: '700', maxWidth: 150 },
  metaText: { color: colors.faint, fontSize: 10, flexShrink: 1 },
  postChip: { maxWidth: 98, borderRadius: 99, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, paddingHorizontal: 9, paddingVertical: 4 },
  postChipText: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  shareCaption: { color: colors.blue, fontSize: 12, lineHeight: 18, marginTop: 10 },
  postText: { color: colors.text, fontSize: 16, lineHeight: 24, marginTop: 7 },
  wallMedia: { marginTop: 10, width: 168, height: 168, borderRadius: 15, overflow: 'hidden', backgroundColor: colors.surface2 },
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
