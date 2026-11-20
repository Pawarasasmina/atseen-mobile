import { useEffect, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, DeviceEventEmitter, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getCurrentViewerId, resolveMediaUrl, WEB_BASE_URL } from '../services/api';
import { colors } from '../theme';
import { compact, relativeTime, userName } from '../utils/format';
import { orderedChapters, seenId, seenMediaSource, seenReadMinutes } from '../utils/seenPresentation';
import { EngagementSheet } from './EngagementSheet';
import { ShareSheet } from './ShareSheet';
import { SeenAudio, SeenMedia } from './SeenMedia';
import { SeenPoll } from './SeenPoll';
import { SeenReactionButton } from './SeenReactionPicker';
import { SeenOptionsSheet } from './SeenOptionsSheet';
import { ownsSeen } from '../utils/seenMenu';
import { hideSeenArrows, showSeenArrows, seenArrowsVisible, subscribeSeenArrows } from '../utils/seenArrowVisibility';
import type { Engagement, Seen, SeenBlock } from '../types';

async function openLink(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  try { await Linking.openURL(url); } catch { Alert.alert('Could not open link', 'Please try again.'); }
}
function ChapterBlock({ block, active, id, chapterId, accessToken }: { block: SeenBlock; active: boolean; id: string; chapterId: string; accessToken: string }) {
  const type = String(block.type || 'TEXT').toUpperCase();
  const uri = seenMediaSource(block.media) || block.url || '';
  if (['IMAGE', 'PHOTO', 'VIDEO'].includes(type)) return uri ? <View style={[s.blockMedia, block.media?.width && block.media?.height ? { aspectRatio: block.media.width / block.media.height } : null]}><SeenMedia media={block.media || { url: uri, mediaType: type }} active={active} /></View> : null;
  if (['AUDIO', 'VOICE'].includes(type)) return uri ? <SeenAudio uri={uri} active={active} /> : null;
  if (type === 'LINK') return block.url ? <Pressable accessibilityRole="link" onPress={() => openLink(block.url!)} style={s.next}><Ionicons name="link-outline" color={colors.blue} size={18} /><Text style={s.linkText}>{block.label || block.url}</Text></Pressable> : null;
  if (type === 'POLL') return <SeenPoll id={id} chapterId={chapterId} block={block} active={active} accessToken={accessToken} />;
  const list = block.metadata?.listItems;
  if (Array.isArray(list) && list.length) return <View>{list.map((item, i) => <Text key={i} style={s.paragraph}>• {String(item)}</Text>)}</View>;
  return block.text || block.label ? <Text selectable style={[s.paragraph, ['QUOTE', 'HIGHLIGHT', 'KEY_POINT'].includes(type) && s.quote]}>{block.text || block.label}</Text> : null;
}

type Props = { accessToken?: string; item: Seen; viewerId?: string; active?: boolean; onEngagementChange?: (id: string, engagement: Engagement) => void; onOpen?: (item: Seen) => void; onHidden?: (id: string) => void; onPublicationChange?: (item: Seen) => void };

/** One presentation for feed, profile, saved and permalink Seens. Page zero is the overview. */
export function SeenCard(props: Props) {
  const [item, setItem] = useState(props.item);
  const [removed, setRemoved] = useState(false);
  const itemRef = useRef(item); itemRef.current = item;
  useEffect(() => {
    setRemoved(false);
    const subscription = DeviceEventEmitter.addListener('seen:removed', (event: { id: string; creatorId?: string }) => {
      if (event.id === seenId(props.item) || (event.creatorId && event.creatorId === String(itemRef.current.creator?.id || itemRef.current.creator?._id || ''))) setRemoved(true);
    });
    const changed = DeviceEventEmitter.addListener('seen:updated', (next: Seen) => { if (seenId(next) === seenId(props.item)) setItem((old) => ({ ...old, ...next })); });
    return () => { subscription.remove(); changed.remove(); };
  }, [props.item.id, props.item._id, props.item.creator?.id, props.item.creator?._id]);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true; setItem(props.item); setLoadError('');
    // Collection responses contain summaries; retrieve the same published chapter snapshot as the web reader.
    if (props.item.chapters === undefined && seenId(props.item)) {
      api.getSeen(seenId(props.item), props.accessToken).then(({ publication }) => {
        if (alive) setItem((old) => ({ ...old, ...publication }));
      }).catch((reason) => { if (alive) setLoadError(reason instanceof Error ? reason.message : 'Could not load chapters.'); });
    }
    return () => { alive = false; };
  }, [props.item, props.accessToken, retry]);
  if (removed) return null;
  return <View><SeenCardBody {...props} item={item} onPublicationChange={(next) => { setItem((old) => ({ ...old, ...next })); props.onPublicationChange?.(next); DeviceEventEmitter.emit('seen:updated', next); }} />{loadError ? <Pressable onPress={() => setRetry(retry + 1)} style={s.loadError}><Text style={s.notice}>{loadError} Tap to retry.</Text></Pressable> : null}</View>;
}

function SeenCardBody({ accessToken = '', item, viewerId, active = true, onEngagementChange, onOpen, onHidden, onPublicationChange }: Props) {
  const id = seenId(item), chapters = orderedChapters(item), title = item.title || 'Untitled Seen';
  const [page, setPage] = useState(0), [width, setWidth] = useState(0);
  const pageRef = useRef(0);
  const arrowsVisible = useSyncExternalStore(subscribeSeenArrows, seenArrowsVisible, seenArrowsVisible);
  const touch = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [engagement, setEngagement] = useState<Engagement>(item.engagement || {});
  const [sheet, setSheet] = useState<'comments' | 'reactions' | null>(null);
  const [shareOpen, setShareOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(''), [notice, setNotice] = useState('');
  const [repostFeedback, setRepostFeedback] = useState('');
  const engagementRevision = useRef(0);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null), tracked = useRef(''), busy = useRef(false);
  const own = ownsSeen(item, viewerId || getCurrentViewerId());
  const update = (next: Engagement) => {
    engagementRevision.current++; setEngagement(next); onEngagementChange?.(id, next);
    DeviceEventEmitter.emit('seen:engagement', { id, engagement: next });
  };
  const go = (next: number, animated = true) => {
    const safe = Math.max(0, Math.min(chapters.length, next));
    pageRef.current = safe;
    setPage(safe); pager.current?.scrollTo({ x: width * safe, animated });
    if (safe && tracked.current !== id) { tracked.current = id; api.trackContentView(id, accessToken); }
  };
  useEffect(() => { setEngagement(item.engagement || {}); }, [item.engagement, id]);
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('seen:engagement', (event: { id: string; engagement: Engagement }) => {
      if (event.id === id) { engagementRevision.current++; setEngagement(event.engagement); }
    });
    return () => subscription.remove();
  }, [id]);
  useEffect(() => {
    if (!repostFeedback) return;
    const timer = setTimeout(() => setRepostFeedback(''), 2600);
    return () => clearTimeout(timer);
  }, [repostFeedback]);
  useEffect(() => { setRepostFeedback(''); setNotice(''); }, [id]);
  useEffect(() => {
    if (!active || !id) return;
    let alive = true; const revision = engagementRevision.current;
    api.getSeenEngagement(id, accessToken).then((result) => { if (alive && engagementRevision.current === revision && !busy.current) setEngagement(result.engagement); }).catch(() => {});
    return () => { alive = false; };
  }, [active, id, accessToken]);
  useEffect(() => { pageRef.current = 0; setPage(0); setHeights({}); tracked.current = ''; pager.current?.scrollTo({ x: 0, animated: false }); }, [id]);
  useEffect(() => { if (!active) { pageRef.current = 0; setPage(0); pager.current?.scrollTo({ x: 0, animated: false }); } }, [active]);
  useEffect(() => { pager.current?.scrollTo({ x: width * page, animated: false }); }, [width]);
  const run = async (name: string, action: () => Promise<{ engagement: Engagement }>) => {
    if (busy.current) return;
    busy.current = true; engagementRevision.current++; setPending(name); setNotice(''); setRepostFeedback('');
    try {
      const next = (await action()).engagement;
      update(next);
      if (name === 'repost') {
        setRepostFeedback(next.viewerShared ? 'Reposted to your profile' : 'Repost removed');
        DeviceEventEmitter.emit('seen:repostChanged', { id });
      }
    }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update Seen.'); }
    finally { busy.current = false; setPending(''); }
  };
  const measure = (index: number, height: number) => setHeights((old) => Math.abs((old[index] || 0) - height) < 1 ? old : { ...old, [index]: height });
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={s.card}>
    <View style={s.creator}>
      {item.creator?.avatar ? <Image source={{ uri: resolveMediaUrl(item.creator.avatar) }} style={s.avatar} /> : <View style={[s.avatar, s.avatarFallback]}><Text style={s.initial}>{userName(item.creator)[0]}</Text></View>}
      <View style={s.creatorCopy}><View style={s.nameRow}><Text numberOfLines={1} style={s.name}>{userName(item.creator)}</Text>{own ? <Text style={s.you}>· you</Text> : null}{item.creator?.verified || item.creator?.isVerified ? <Ionicons name="checkmark-circle" color={colors.blue} size={12} /> : null}</View><Text style={s.time}>{[item.creator?.location?.split(',')[0], relativeTime(item.publishedAt)].filter(Boolean).join(' · ')}</Text></View>
      <View accessibilityLabel={`${compact(engagement.viewCount)} views`} style={s.views}><Ionicons name="eye-outline" color={colors.faint} size={12} /><Text style={s.viewCount}>{compact(engagement.viewCount)}</Text></View>
      <Pressable accessibilityLabel="Seen options" disabled={!item.creator?.id && !item.creator?._id && item.access !== 'OWNER'} hitSlop={10} onPress={() => setMenuOpen(true)}><Ionicons name="ellipsis-horizontal" color={colors.muted} size={19} /></Pressable>
    </View>
    {width > 0 ? <View style={s.carousel}
      onTouchStart={(event) => { touch.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, moved: false }; }}
      onTouchMove={(event) => {
        const start = touch.current;
        if (!start) return;
        const dx = Math.abs(event.nativeEvent.pageX - start.x), dy = Math.abs(event.nativeEvent.pageY - start.y);
        if (dx > 8 || dy > 8) start.moved = true;
        if (dy > 8 && dy > dx * 1.2) hideSeenArrows();
      }}
      onTouchEnd={() => { if (touch.current && !touch.current.moved) showSeenArrows(); touch.current = null; }}
      onTouchCancel={() => { touch.current = null; hideSeenArrows(); }}
    ><ScrollView ref={pager} horizontal pagingEnabled directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ height: heights[page] || heights[0] || 520 }} contentContainerStyle={s.pager} onMomentumScrollEnd={(event) => go(Math.round(event.nativeEvent.contentOffset.x / width), false)}>
      <View style={[s.page, { width }]} onLayout={(event) => measure(0, event.nativeEvent.layout.height)}>
        <View style={s.hero}><Pressable accessibilityLabel="Read first chapter" onPress={() => chapters.length ? go(1) : onOpen?.(item)} style={s.cover}><SeenMedia media={item.coverMedia || item.introMedia} cover active={active && page === 0} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Read ${title}`} onPress={() => chapters.length ? go(1) : onOpen?.(item)} style={s.copy}>{item.category ? <Text numberOfLines={1} style={s.category}>{item.category.toUpperCase()}</Text> : null}<Text style={s.title}>{title}</Text><Text style={s.meta}>{chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} · ~{seenReadMinutes(item)} min</Text>{item.summary || item.description ? <Text numberOfLines={4} style={s.summary}>{item.summary || item.description}</Text> : null}</Pressable></View>
        {chapters.length ? <View style={s.chapters}>{chapters.slice(0, 5).map((chapter, index) => <Pressable accessibilityRole="button" accessibilityLabel={`Read chapter ${index + 1}: ${chapter.title || 'Untitled'}`} key={chapter.stableChapterId || chapter.id || index} onPress={() => go(index + 1)} style={s.chapterRow}><Text style={s.chapterNumber}>{String(index + 1).padStart(2, '0')}</Text><Text numberOfLines={1} style={s.chapterTitle}>{chapter.title || `Chapter ${index + 1}`}</Text><Ionicons name={chapter.locked ? 'lock-closed-outline' : 'chevron-forward'} size={12} color={colors.faint} /></Pressable>)}{chapters.length > 5 ? <Pressable onPress={() => go(6)} style={s.chapterRow}><Text style={s.chapterNumber}>+{chapters.length - 5}</Text><Text style={s.more}>More inside</Text><Ionicons name="chevron-forward" size={12} color={colors.faint} /></Pressable> : null}</View> : <Text style={s.empty}>No chapters yet.</Text>}
      </View>
      {chapters.map((chapter, index) => <View key={chapter.stableChapterId || chapter.id || index} style={[s.page, { width }]} onLayout={(event) => measure(index + 1, event.nativeEvent.layout.height)}>
        <View style={s.chapterKicker}><Text style={s.chapterNumber}>{String(index + 1).padStart(2, '0')}</Text><Text style={s.more}>Chapter {index + 1} of {chapters.length}</Text></View><Text style={s.readerTitle}>{chapter.title || `Chapter ${index + 1}`}</Text><View style={s.accent} />
        {chapter.locked ? <View style={s.locked}><Ionicons name="lock-closed-outline" size={26} color={colors.blue} /><Text style={s.lockedTitle}>This chapter is locked</Text><Text style={s.paragraph}>Open this Seen to see its access options.</Text><Pressable onPress={() => openLink(`${WEB_BASE_URL}/seen/${id}`)} style={s.next}><Text style={s.linkText}>View access options</Text><Ionicons name="chevron-forward" size={15} color={colors.blue} /></Pressable></View> : (chapter.blocks?.length ? [...chapter.blocks].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map((block, i) => <ChapterBlock key={block.id || i} id={id} chapterId={String(chapter.stableChapterId || chapter.id || '')} accessToken={accessToken} block={block} active={active && page === index + 1} />) : <Text style={s.paragraph}>This chapter has no content yet.</Text>)}
        <Pressable accessibilityRole="button" onPress={() => go(index + 1 < chapters.length ? index + 2 : 0)} style={s.next}><Text style={s.nextLabel}>{index + 1 < chapters.length ? 'NEXT' : 'DONE'}</Text><Text numberOfLines={1} style={s.nextTitle}>{index + 1 < chapters.length ? `${String(index + 2).padStart(2, '0')} · ${chapters[index + 1].title || 'Next chapter'}` : 'Back to overview'}</Text><Ionicons name="chevron-forward" size={14} color={colors.faint} /></Pressable>
      </View>)}
    </ScrollView>
      {chapters.length > 0 && arrowsVisible && active ? <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous Seen page" accessibilityState={{ disabled: page === 0 }} disabled={page === 0} hitSlop={6} onPress={() => go(pageRef.current - 1)} style={[s.pageArrow, s.previousArrow]}><Ionicons name="chevron-back" color={page === 0 ? colors.faint : colors.text} size={14} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next Seen page" accessibilityState={{ disabled: page === chapters.length }} disabled={page === chapters.length} hitSlop={6} onPress={() => go(pageRef.current + 1)} style={[s.pageArrow, s.nextArrow]}><Ionicons name="chevron-forward" color={page === chapters.length ? colors.faint : colors.text} size={14} /></Pressable>
      </View> : null}
    </View> : null}
    {chapters.length ? <View style={s.pagination}><View accessibilityLabel={`Page ${page + 1} of ${chapters.length + 1}`} style={s.dots}>{Array.from({ length: chapters.length + 1 }, (_, index) => <Pressable key={index} accessibilityLabel={index === 0 ? 'Overview' : `Chapter ${index}`} hitSlop={5} onPress={() => go(index)} style={[s.dot, index === page && s.dotActive]} />)}</View><Pressable onPress={() => go(page ? 0 : 1)} style={s.swipe}><Text style={s.swipeText}>{page ? '‹ Overview' : 'Swipe for chapters ›'}</Text></Pressable></View> : null}
    {repostFeedback ? <Text accessibilityLiveRegion="polite" style={s.repostFeedback}>{repostFeedback}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={s.notice}>{notice}</Text> : null}
    <View style={s.actions}>{engagement.reactors?.some((entry) => entry.user?.avatar) ? <Pressable accessibilityLabel="View Seen reactions" onPress={() => setSheet('reactions')} style={s.reactors}>{engagement.reactors.filter((entry) => entry.user?.avatar).slice(0, 2).map((entry) => <Image key={entry.id} source={{ uri: resolveMediaUrl(entry.user!.avatar!) }} style={s.reactorAvatar} />)}</Pressable> : null}
      <SeenReactionButton id={id} accessToken={accessToken} engagement={engagement} onUpdate={update} disabled={Boolean(pending)} />
      <Pressable accessibilityLabel={`Comments, ${compact(engagement.commentCount)}`} onPress={() => setSheet('comments')} style={s.action}><Ionicons name="chatbubble-outline" color={colors.muted} size={19} /><Text style={s.stat}>{compact(engagement.commentCount)}</Text></Pressable>
      {!own ? <Pressable accessibilityRole="button" accessibilityLabel={engagement.viewerShared ? 'Remove repost' : 'Repost Seen'} accessibilityState={{ selected: Boolean(engagement.viewerShared), disabled: Boolean(pending) }} disabled={Boolean(pending)} onPress={() => run('repost', () => api.toggleSeenShare(id, Boolean(engagement.viewerShared), accessToken))} style={s.action}>{pending === 'repost' ? <ActivityIndicator color={colors.blue} size="small" /> : <Ionicons name="repeat" color={engagement.viewerShared ? colors.blue : colors.muted} size={19} />}{engagement.shareCount ? <Text style={[s.stat, engagement.viewerShared && s.active]}>{compact(engagement.shareCount)}</Text> : null}</Pressable> : null}
      <View style={s.spacer} /><Pressable accessibilityLabel={engagement.viewerSaved ? 'Unsave Seen' : 'Save Seen'} hitSlop={9} disabled={Boolean(pending)} onPress={() => run('save', () => api.toggleSeenSave(id, accessToken))}>{pending === 'save' ? <ActivityIndicator size="small" color={colors.blue} /> : <Ionicons name={engagement.viewerSaved ? 'bookmark' : 'bookmark-outline'} color={engagement.viewerSaved ? colors.blue : colors.muted} size={20} />}</Pressable><Pressable accessibilityLabel="Send Seen" hitSlop={9} onPress={() => setShareOpen(true)} style={s.action}><Ionicons name="paper-plane-outline" color={colors.muted} size={20} />{engagement.privateShareCount ? <Text style={s.stat}>{compact(engagement.privateShareCount)}</Text> : null}</Pressable>
    </View>
    <EngagementSheet accessToken={accessToken} engagement={engagement} id={id} mode={sheet} onClose={() => setSheet(null)} onUpdate={update} /><ShareSheet accessToken={accessToken} item={item} onClose={() => setShareOpen(false)} visible={shareOpen} />
    <SeenOptionsSheet visible={menuOpen} item={item} own={own} accessToken={accessToken} engagement={engagement} onClose={() => setMenuOpen(false)} onShare={() => setShareOpen(true)} onEngagement={update} onChange={(next) => onPublicationChange?.(next)} onRemoved={(creatorId) => { setMenuOpen(false); DeviceEventEmitter.emit('seen:removed', { id, creatorId }); onHidden?.(id); }} />
  </View>;
}

const s = StyleSheet.create({
  repostFeedback: { alignSelf: 'flex-start', marginHorizontal: 20, marginTop: 12, color: colors.blue, backgroundColor: 'rgba(156,203,255,.1)', borderRadius: 99, paddingVertical: 7, paddingHorizontal: 12, fontSize: 11, fontWeight: '600' },
  carousel: { position: 'relative' },
  pageArrow: { position: 'absolute', top: 96, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(10,13,18,.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  previousArrow: { left: 6 }, nextArrow: { right: 6 },
  reactors: { flexDirection: 'row', marginRight: -8 }, reactorAvatar: { width: 19, height: 19, borderRadius: 10, borderWidth: 1, borderColor: colors.bg, marginLeft: -5 },
  loadError: { paddingBottom: 16, backgroundColor: colors.bg },
  card: { backgroundColor: colors.bg, paddingTop: 26, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  creator: { paddingHorizontal: 20, paddingBottom: 19, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 37, height: 37, borderRadius: 19, borderWidth: 2, borderColor: 'rgba(255,255,255,.16)' }, avatarFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, initial: { color: colors.blue, fontWeight: '800' }, creatorCopy: { flex: 1 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, name: { color: colors.text, fontSize: 13, fontWeight: '800', flexShrink: 1 }, you: { color: colors.faint, fontSize: 10 }, time: { color: colors.faint, fontSize: 10, marginTop: 2 }, views: { flexDirection: 'row', gap: 4, alignItems: 'center', marginRight: 12 }, viewCount: { color: colors.faint, fontSize: 11 },
  pager: { alignItems: 'flex-start' }, page: { paddingHorizontal: 20, paddingBottom: 4 }, hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 15 }, cover: { width: '56%', aspectRatio: 4 / 5, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface2 }, copy: { flex: 1, minWidth: 0, paddingTop: 3 }, category: { color: colors.blue, opacity: .8, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4, marginBottom: 7 }, title: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -.45, lineHeight: 24 }, meta: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 8 }, summary: { color: 'rgba(255,255,255,.75)', fontSize: 13, lineHeight: 20, marginTop: 10 }, chapters: { marginTop: 22, gap: 11 }, chapterRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 9 }, chapterNumber: { color: colors.blue, width: 19, fontSize: 10.5, fontWeight: '800' }, chapterTitle: { color: 'rgba(255,255,255,.82)', fontSize: 14.5, flex: 1 }, more: { color: colors.faint, fontSize: 11, flex: 1 }, empty: { color: colors.faint, fontSize: 12, marginTop: 20 },
  pagination: { marginHorizontal: 20, height: 16, marginTop: 16, justifyContent: 'center', alignItems: 'center' }, dots: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '50%', flexWrap: 'wrap', justifyContent: 'center' }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.22)' }, dotActive: { width: 16, backgroundColor: colors.blue }, swipe: { position: 'absolute', right: 0, paddingVertical: 10 }, swipeText: { color: colors.faint, fontSize: 10.5 },
  actions: { marginHorizontal: 20, marginTop: 15, paddingTop: 13, minHeight: 51, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.045)', flexDirection: 'row', alignItems: 'center', gap: 13 }, action: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36 }, reaction: { flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 99, backgroundColor: 'rgba(255,255,255,.05)', paddingHorizontal: 10, minHeight: 31 }, selected: { backgroundColor: 'rgba(156,203,255,.12)' }, reactionIcons: { fontSize: 12 }, stat: { color: colors.muted, fontSize: 11 }, active: { color: colors.blue }, spacer: { flex: 1 }, notice: { color: colors.danger, marginHorizontal: 20, marginTop: 12, fontSize: 12 },
  chapterKicker: { flexDirection: 'row', gap: 8, alignItems: 'center' }, readerTitle: { color: colors.text, fontSize: 23, fontWeight: '800', letterSpacing: -.4, lineHeight: 28, marginTop: 9 }, accent: { width: 30, height: 2.5, borderRadius: 2, backgroundColor: colors.blue, marginTop: 13, marginBottom: 16 }, paragraph: { color: '#EDEFF3', fontSize: 15, lineHeight: 25.5, marginBottom: 14 }, quote: { borderLeftWidth: 2, borderLeftColor: colors.blue, paddingLeft: 13, fontStyle: 'italic' }, blockMedia: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }, linkText: { color: colors.blue, fontSize: 13, flex: 1 }, next: { marginTop: 20, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10 }, nextLabel: { color: colors.faint, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2 }, nextTitle: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '600' }, locked: { backgroundColor: colors.surface, padding: 20, borderRadius: 14 }, lockedTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginVertical: 12 },
});
