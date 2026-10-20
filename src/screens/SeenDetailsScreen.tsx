import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { EngagementSheet, reactions } from '../components/EngagementSheet';
import { ScreenState } from '../components/ScreenState';
import { ShareSheet } from '../components/ShareSheet';
import { api, resolveMediaUrl } from '../services/api';
import { colors } from '../theme';
import { compact, relativeTime, userName } from '../utils/format';
import type { Engagement, Seen, SeenBlock, SeenChapter, Session } from '../types';

const emptyEngagement: Engagement = { reactionCount: 0, commentCount: 0, shareCount: 0, saveCount: 0, viewCount: 0, viewerReaction: null, viewerShared: false, viewerSaved: false, comments: [] };

const seenId = (item?: Seen | null) => String(item?.id || item?._id || '');
const mediaUrl = (media?: { secureUrl?: string; url?: string }) => resolveMediaUrl(media?.secureUrl || media?.url || '');
const chapterTitle = (chapter: SeenChapter, index: number) => chapter.title || `Chapter ${index + 1}`;
const chapterKey = (chapter: SeenChapter, index: number) => String(chapter.stableChapterId || chapter.id || index);
const titleFor = (seen?: Seen | null) => seen?.title || 'Untitled Seen';
const categoryFor = (seen?: Seen | null) => seen?.category || seen?.kind || 'Seen';
const wordsIn = (value?: string) => (value || '').trim().split(/\s+/).filter(Boolean).length;
const reactionIconsFor = (engagement: Engagement) => (engagement.topReactions?.length ? engagement.topReactions : ['LIKE', 'LOVE', 'FIRE']).slice(0, 3).map((key) => reactions.find((item) => item.key === key)?.icon || '').filter(Boolean).join(' ');

function readMinutes(chapters: SeenChapter[] = []) {
  const words = chapters.reduce((total, chapter) => total + (chapter.blocks || []).reduce((sum, block) => sum + wordsIn([block.text, block.label, block.url].filter(Boolean).join(' ')), 0), 0);
  return Math.max(1, Math.ceil(words / 220));
}

function metadataLine(seen: Seen | null, chapterIndex = 0) {
  const chapters = seen?.chapters || [];
  const count = chapters.length;
  const parts = [
    categoryFor(seen),
    `${count} ${count === 1 ? 'chapter' : 'chapters'}`,
    `~${readMinutes(chapters)} min`,
    count ? `${Math.min(chapterIndex + 1, count)}/${count}` : '0/0',
  ];
  return parts.filter(Boolean).join(' - ');
}

function bottomMeta(seen: Seen | null) {
  const chapters = seen?.chapters || [];
  const count = chapters.length;
  return [`${count} ${count === 1 ? 'chapter' : 'chapters'}`, `~${readMinutes(chapters)} min`, relativeTime(seen?.publishedAt)].filter(Boolean).join(' - ');
}

function sortedChapters(seen?: Seen | null) {
  return [...(seen?.chapters || [])].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
}

function DetailSkeleton() {
  return <View style={styles.skeleton}>
    <View style={styles.skeletonHeader}><View style={styles.skeletonPill} /><View style={styles.skeletonTitle} /></View>
    <View style={styles.skeletonHero}><View style={styles.skeletonCover} /><View style={styles.skeletonCopy}><View style={styles.skeletonLineWide} /><View style={styles.skeletonLine} /></View></View>
    <View style={styles.skeletonParagraph} /><View style={styles.skeletonParagraphSmall} />
    <View style={styles.skeletonChapter} /><View style={styles.skeletonChapter} />
  </View>;
}

function CoverImage({ seen, style }: { seen: Seen | null; style: object }) {
  const cover = mediaUrl(seen?.coverMedia || seen?.introMedia);
  if (cover) return <Image resizeMode="cover" source={{ uri: cover }} style={style} />;
  return <LinearGradient colors={['#263344', '#121820', '#090C10']} style={[style, styles.coverFallback]}><Ionicons color={colors.blue} name="eye-outline" size={28} /></LinearGradient>;
}

function ChapterPreview({ chapters, onOpen }: { chapters: SeenChapter[]; onOpen: (index: number) => void }) {
  if (!chapters.length) return <View style={styles.emptyChapters}><Text style={styles.emptyText}>No chapters are available for this Seen yet.</Text></View>;
  return <View style={styles.chapters}>{chapters.map((chapter, index) => (
    <Pressable accessibilityRole="button" key={chapterKey(chapter, index)} onPress={() => onOpen(index)} style={styles.chapterRow}>
      <Text style={styles.chapterNumber}>{String(index + 1).padStart(2, '0')}</Text>
      <Text numberOfLines={1} style={styles.chapterName}>{chapterTitle(chapter, index)}</Text>
    </Pressable>
  ))}</View>;
}

function ReaderBlock({ block, seenTitle }: { block: SeenBlock; seenTitle: string }) {
  const type = String(block.type || '').toUpperCase();
  const url = mediaUrl(block.media);
  if (type === 'IMAGE' && url) return <Image resizeMode="cover" source={{ uri: url }} style={styles.readerImage} />;
  if (['VIDEO', 'AUDIO', 'VOICE'].includes(type)) return <View style={styles.mediaNotice}><Ionicons color={colors.blue} name={type === 'VIDEO' ? 'play-circle-outline' : 'volume-medium-outline'} size={22} /><Text style={styles.mediaNoticeText}>{type === 'VIDEO' ? 'Video' : 'Audio'} media is attached to this chapter.</Text></View>;
  if (type === 'LINK' && block.url) return <View style={styles.linkBlock}><Ionicons color={colors.blue} name="link-outline" size={18} /><Text style={styles.linkText}>{block.label || block.url}</Text></View>;
  if (type === 'LIST' || type === 'KEY_POINT') {
    const items = Array.isArray(block.metadata?.listItems) ? block.metadata.listItems : [];
    if (items.length) return <View style={styles.listBlock}>{items.map((item, index) => <Text key={`${seenTitle}-${index}`} style={styles.readerText}>- {String(item)}</Text>)}</View>;
  }
  return block.text ? <Text style={styles.readerText}>{block.text}</Text> : null;
}

function EngagementBar({ accessToken, engagement, id, onComment, onReact, onRun, onShare, pending }: { accessToken: string; engagement: Engagement; id: string; onComment: () => void; onReact: () => void; onRun: (name: string, action: () => Promise<{ engagement: Engagement }>) => void; onShare: () => void; pending: string }) {
  return <View style={styles.engagement}>
    <Pressable disabled={Boolean(pending)} onPress={onReact} style={styles.engagementItem}><Text style={[styles.reactionIcons, engagement.viewerReaction && styles.activeText]}>{reactionIconsFor(engagement)}</Text><Text style={[styles.stat, engagement.viewerReaction && styles.activeText]}>{compact(engagement.reactionCount)}</Text></Pressable>
    <Pressable onPress={onComment} style={styles.engagementItem}><Ionicons name="chatbubble-outline" color={colors.faint} size={18} /><Text style={styles.stat}>{compact(engagement.commentCount)}</Text></Pressable>
    <Pressable disabled={Boolean(pending)} onPress={() => onRun('share', () => api.toggleSeenShare(id, Boolean(engagement.viewerShared), accessToken))} style={styles.engagementItem}><Ionicons name="repeat" color={engagement.viewerShared ? colors.blue : colors.faint} size={18} /><Text style={[styles.stat, engagement.viewerShared && styles.activeText]}>{compact(engagement.shareCount)}</Text></Pressable>
    <View style={styles.engagementItem}><Ionicons name="eye-outline" color={colors.faint} size={18} /><Text style={styles.stat}>{compact(engagement.viewCount)}</Text></View>
    <View style={styles.spacer} />
    <Pressable disabled={Boolean(pending)} onPress={() => onRun('save', () => api.toggleSeenSave(id, accessToken))}>{pending === 'save' ? <ActivityIndicator color={colors.blue} size="small" /> : <Ionicons name={engagement.viewerSaved ? 'bookmark' : 'bookmark-outline'} color={engagement.viewerSaved ? colors.blue : colors.muted} size={21} />}</Pressable>
    <Pressable accessibilityLabel="Share this Seen" onPress={onShare}><Ionicons name="paper-plane-outline" color={colors.muted} size={21} /></Pressable>
  </View>;
}

export function SeenDetailsScreen({ initialSeen, onClose, onFeedUpdate, session }: { initialSeen?: Seen | null; onClose: () => void; onFeedUpdate: (id: string, engagement: Engagement, publication?: Seen) => void; session: Session }) {
  const id = seenId(initialSeen);
  const [seen, setSeen] = useState<Seen | null>(initialSeen || null);
  const [engagement, setEngagement] = useState<Engagement>(initialSeen?.engagement || emptyEngagement);
  const [loading, setLoading] = useState(!initialSeen);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<'comments' | 'reactions' | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const [readerIndex, setReaderIndex] = useState<number | null>(null);
  const tracked = useRef('');

  const chapters = useMemo(() => sortedChapters(seen), [seen]);
  const activeChapter = readerIndex == null ? null : chapters[readerIndex] || null;
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const [publicationData, engagementData] = await Promise.all([api.getSeen(id, session.accessToken), api.getSeenEngagement(id, session.accessToken)]);
      setSeen(publicationData.publication);
      setEngagement(engagementData.engagement || emptyEngagement);
      onFeedUpdate(id, engagementData.engagement || emptyEngagement, publicationData.publication);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This Seen is not available.');
    } finally {
      setLoading(false);
    }
  }, [id, onFeedUpdate, session.accessToken]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!id || tracked.current === id) return;
    tracked.current = id;
    api.trackContentView(id, session.accessToken);
  }, [id, session.accessToken]);

  const updateEngagement = (next: Engagement) => {
    setEngagement(next);
    if (id) onFeedUpdate(id, next, seen || undefined);
  };
  const run = async (name: string, action: () => Promise<{ engagement: Engagement }>) => {
    if (pending || !id) return;
    setPending(name); setNotice('');
    try { updateEngagement((await action()).engagement); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Could not update this Seen.'); }
    finally { setPending(''); }
  };
  if (!id) return <SafeAreaView style={styles.safe}><ScreenState title="This Seen is not available." onPress={onClose} action="Back" /></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>SEEN</Text></View>
        <View style={styles.headerCopy}><Text numberOfLines={1} style={styles.headerTitle}>{readerIndex == null ? titleFor(seen) : chapterTitle(activeChapter || {}, readerIndex)}</Text><Text numberOfLines={1} style={styles.headerMeta}>{metadataLine(seen, readerIndex || 0)}</Text></View>
        <Pressable accessibilityLabel="Close Seen details" onPress={onClose} style={styles.close}><Ionicons color={colors.text} name="close" size={23} /></Pressable>
      </View>

      {loading ? <DetailSkeleton /> : error ? <ScreenState icon="eye-outline" title="Could not load Seen" message={error} onPress={load} /> : readerIndex == null ? (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.hero}>
              <CoverImage seen={seen} style={styles.heroCover} />
              <View style={styles.heroCopy}><Text numberOfLines={3} style={styles.heroTitle}>{titleFor(seen)}</Text><Text numberOfLines={2} style={styles.heroMeta}>{categoryFor(seen)} - {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} - ~{readMinutes(chapters)} min</Text>{seen?.creator ? <Text numberOfLines={1} style={styles.creator}>by {userName(seen.creator)}</Text> : null}</View>
            </View>
            <Text style={styles.description}>{seen?.description || seen?.summary || 'No description is available for this Seen yet.'}</Text>
            <ChapterPreview chapters={chapters} onOpen={setReaderIndex} />
          </ScrollView>
          <View style={styles.startRow}><Text style={styles.bottomMeta}>{bottomMeta(seen)}</Text><Pressable disabled={!chapters.length} onPress={() => setReaderIndex(0)} style={styles.startButton}><Text style={[styles.startText, !chapters.length && styles.disabledText]}>Tap to start</Text><Ionicons color={chapters.length ? colors.blue : colors.faint} name="chevron-forward" size={14} /></Pressable></View>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.readerContent}>
            <Text style={styles.readerKicker}>Chapter {readerIndex + 1} of {chapters.length}</Text>
            <Text style={styles.readerTitle}>{chapterTitle(activeChapter || {}, readerIndex)}</Text>
            {(activeChapter?.blocks || []).length ? activeChapter?.blocks?.map((block, index) => <ReaderBlock block={block} key={block.id || index} seenTitle={titleFor(seen)} />) : <View style={styles.emptyReader}><CoverImage seen={seen} style={styles.readerImage} /><Text style={styles.emptyText}>This chapter does not have readable content yet.</Text></View>}
          </ScrollView>
          <View style={styles.readerNav}><Pressable disabled={readerIndex <= 0} onPress={() => setReaderIndex(Math.max(0, readerIndex - 1))} style={styles.readerNavButton}><Ionicons color={readerIndex <= 0 ? colors.faint : colors.text} name="chevron-back" size={16} /><Text style={[styles.readerNavText, readerIndex <= 0 && styles.disabledText]}>Previous</Text></Pressable><Pressable onPress={() => readerIndex < chapters.length - 1 ? setReaderIndex(readerIndex + 1) : setReaderIndex(null)} style={styles.readerNavButton}><Text style={styles.readerNavText}>{readerIndex < chapters.length - 1 ? 'Next' : 'Overview'}</Text><Ionicons color={colors.text} name="chevron-forward" size={16} /></Pressable></View>
        </>
      )}

      <EngagementBar accessToken={session.accessToken} engagement={engagement} id={id} onComment={() => setSheet('comments')} onReact={() => setSheet('reactions')} onRun={(name, action) => run(name, () => action())} onShare={() => setShareOpen(true)} pending={pending} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <EngagementSheet accessToken={session.accessToken} engagement={engagement} id={id} mode={sheet} onClose={() => setSheet(null)} onUpdate={updateEngagement} />
      <ShareSheet accessToken={session.accessToken} item={seen || initialSeen || { id }} onClose={() => setShareOpen(false)} visible={shareOpen} />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 56, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBadge: { borderWidth: 1, borderColor: 'rgba(156,203,255,.5)', borderRadius: 999, backgroundColor: 'rgba(156,203,255,.12)', paddingHorizontal: 10, paddingVertical: 4 },
  headerBadgeText: { color: colors.blue, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  headerMeta: { color: colors.muted, fontSize: 8, marginTop: 1 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 130 },
  hero: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  heroCover: { width: 112, height: 140, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0 },
  heroTitle: { color: colors.text, fontSize: 21, lineHeight: 24, fontWeight: '900' },
  heroMeta: { color: colors.muted, fontSize: 10, marginTop: 8, lineHeight: 14 },
  creator: { color: colors.faint, fontSize: 10, marginTop: 6 },
  description: { color: colors.text, fontSize: 13, lineHeight: 20, marginTop: 20 },
  chapters: { marginTop: 18, gap: 9 },
  chapterRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  chapterNumber: { width: 22, color: colors.blue, fontSize: 10, fontWeight: '900' },
  chapterName: { flex: 1, color: colors.text, fontSize: 13 },
  emptyChapters: { marginTop: 20, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14 },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  startRow: { minHeight: 38, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomMeta: { color: colors.faint, fontSize: 10 },
  startButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 7, paddingLeft: 10 },
  startText: { color: colors.blue, fontSize: 10, fontWeight: '800' },
  engagement: { minHeight: 50, paddingHorizontal: 22, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 13 },
  engagementItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reactionIcons: { color: colors.faint, fontSize: 11 },
  stat: { color: colors.faint, fontSize: 10 },
  activeText: { color: colors.blue },
  spacer: { flex: 1 },
  notice: { color: colors.danger, fontSize: 11, paddingHorizontal: 22, paddingBottom: 7 },
  readerContent: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 130 },
  readerKicker: { color: colors.blue, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  readerTitle: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900', marginTop: 8, marginBottom: 18 },
  readerText: { color: 'rgba(255,255,255,.88)', fontSize: 15, lineHeight: 24, marginBottom: 14 },
  readerImage: { width: '100%', minHeight: 220, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface2, marginBottom: 16 },
  mediaNotice: { minHeight: 58, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, backgroundColor: colors.surface },
  mediaNoticeText: { color: colors.muted, fontSize: 12, flex: 1 },
  linkBlock: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderRadius: 13, backgroundColor: colors.surface, marginBottom: 14 },
  linkText: { color: colors.text, fontSize: 13, flex: 1 },
  listBlock: { marginBottom: 8 },
  emptyReader: { gap: 6 },
  readerNav: { minHeight: 42, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readerNavButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
  readerNavText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  disabledText: { color: colors.faint },
  skeleton: { paddingHorizontal: 22, paddingTop: 20, gap: 16 },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skeletonPill: { width: 52, height: 20, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.07)' },
  skeletonTitle: { flex: 1, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.07)' },
  skeletonHero: { flexDirection: 'row', gap: 14, marginTop: 14 },
  skeletonCover: { width: 112, height: 140, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.07)' },
  skeletonCopy: { flex: 1, justifyContent: 'center', gap: 10 },
  skeletonLineWide: { width: '90%', height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.07)' },
  skeletonLine: { width: '62%', height: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.05)' },
  skeletonParagraph: { height: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.07)' },
  skeletonParagraphSmall: { width: '70%', height: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.05)' },
  skeletonChapter: { height: 24, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.05)' },
});
