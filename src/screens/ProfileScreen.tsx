import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../components/Avatar';
import { BottomNav } from '../components/BottomNav';
import { CreateMenu } from '../components/CreateMenu';
import { ScreenState, SkeletonRows } from '../components/ScreenState';
import { ContentTile, ExperiencePreview, IconButton, ProfileImage, SectionHeading, WorldPreview, WorldCreationEntry, recordId } from '../components/profile/ProfilePrimitives';
import { ConnectionsSheet, ProfileForm, ProfileMediaViewer, ProfileSheet, SheetRow, sheetStyles } from '../components/profile/ProfileSheets';
import { ProfileWallPreview } from '../components/profile/ProfileWall';
import { SeenDetailsScreen } from './SeenDetailsScreen';
import { CommentsModal } from './WallScreen';
import { api, WEB_BASE_URL } from '../services/api';
import { colors } from '../theme';
import { compact } from '../utils/format';
import { dreamProgress, featuredExperiences, profileGiftPreviews, profileStatusText, visibleProfileSeen } from '../utils/ownProfile';
import type { CreateTarget, ExperiencePublication, MainTab, PageInfo, ProfileGift, ProfilePhoto, ProfileSeries, Session, UnifiedProfile, DreamData, WallPost } from '../types';

type FormKind = 'edit' | 'status' | 'dream' | 'direct';
type Collection = 'seens' | 'experiences' | 'drafts' | 'unlocked' | 'archive' | 'saved' | 'link-only';
type Tile = { key: string; item?: ExperiencePublication; series?: ProfileSeries; label?: string; count?: number; collection?: Collection; wall?: WallPost };
const publicGridSeen = visibleProfileSeen;
const duration = (n?: number) => n ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '';

export function ProfileScreen({ onNavigate, onCreate, onDirectAccess, session }: { onNavigate: (key: MainTab) => void; onCreate: (target: CreateTarget) => void; onDirectAccess: () => void; session: Session }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<UnifiedProfile | null>(null);
  const [dreamData, setDreamData] = useState<DreamData | null>(null);
  const [gifts, setGifts] = useState<ProfileGift[]>([]);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]), [stories, setStories] = useState<ProfilePhoto[]>([]);
  const photoList = useRef<FlatList<ProfilePhoto>>(null);
  const [experiences, setExperiences] = useState<ExperiencePublication[]>([]);
  const [draftPreview, setDraftPreview] = useState<{ items: ExperiencePublication[]; pagination: PageInfo } | null>(null);
  const [worldData, setWorldData] = useState<Awaited<ReturnType<typeof api.getWorldManagement>> | null>(null);
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'grid' | 'reposts' | 'saved'>('grid');
  const [saved, setSaved] = useState<Tile[]>([]), [savedBusy, setSavedBusy] = useState(false), [savedLoaded, setSavedLoaded] = useState(false);
  const [form, setForm] = useState<FormKind | null>(null), [connections, setConnections] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false), [ownerMenu, setOwnerMenu] = useState(false), [giftsOpen, setGiftsOpen] = useState(false), [dreamMenu, setDreamMenu] = useState(false);
  const [selected, setSelected] = useState<ExperiencePublication | null>(null), [media, setMedia] = useState<{ items: ProfilePhoto[]; index: number } | null>(null);
  const [commentPost, setCommentPost] = useState<WallPost | null>(null);
  const [wallOpen, setWallOpen] = useState(false);
  const [feedArchiveOpen, setFeedArchiveOpen] = useState(false);
  const [series, setSeries] = useState<ProfileSeries | null>(null), [collection, setCollection] = useState<Collection | null>(null);
  const [uploading, setUploading] = useState(false), [giftBusy, setGiftBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const loadLocked = useRef(false), uploadLocked = useRef(false), giftLocked = useRef(false);
  const loadPending = useRef(false), latestLoad = useRef<(() => Promise<void>) | null>(null);
  const requestVersion = useRef(0);
  const openWeb = useCallback((path: string) => { Linking.openURL(`${WEB_BASE_URL}${path}`).catch((e) => Alert.alert('Could not open page', e instanceof Error ? e.message : 'Please retry.')); }, []);
  const load = useCallback(async () => {
    if (loadLocked.current) { loadPending.current = true; return; }
    loadLocked.current = true; const version = ++requestVersion.current; setError('');
    try {
      const next = await api.getUnifiedMe(session.accessToken);
      if (requestVersion.current !== version) return;
      setData(next);
      const failures: Record<string, string> = {};
      const optional = async <T,>(name: string, action: () => Promise<T>, fallback: T): Promise<T> => { try { return await action(); } catch { failures[name] = `${name} could not load. Pull down to retry.`; return fallback; } };
      const creator = next.profile.isCreator && next.viewerCapabilities?.canAccessStudio;
      const world = next.planets?.[0];
      const [mediaResult, giftsResult, storyResult, experienceResult, dreamResult, worldResult, draftResult] = await Promise.all([
        optional('Photos', () => api.getProfileMedia(), { media: next.media || [] }),
        optional('Gifts', () => api.getReceivedGifts(), null),
        optional('Stories', () => api.listWallStories(session.accessToken), null),
        optional('Experiences', () => api.getProfileExperiences(next.profile.username || ''), { items: next.experiences || [] }),
        creator ? optional('Dream', () => api.getDream(next.profile.username || '', session.accessToken), null) : Promise.resolve(null),
        world ? optional('World', () => api.getWorldManagement(recordId(world)), null) : Promise.resolve(null),
        optional('Drafts', () => api.listOwnPublications(creator ? 'SEEN,EXPERIENCE' : 'SEEN', 'DRAFT'), null),
      ]);
      if (requestVersion.current !== version) return;
      setPhotos(mediaResult.media || []); setGifts(giftsResult?.gifts || []);
      setStories((storyResult?.viewer?.stories || []).map((story) => ({ ...story, mediaType: story.mediaType || 'IMAGE' })));
      setExperiences(experienceResult.items || []); setDreamData(dreamResult); setWorldData(worldResult); setSectionErrors(failures); setSavedLoaded(false);
      setDraftPreview(draftResult);
    } catch (e) { setError(e instanceof Error ? e.message : 'Profile could not load.'); }
    finally { loadLocked.current = false; setLoading(false); setRefreshing(false); if (loadPending.current && latestLoad.current) { loadPending.current = false; void latestLoad.current(); } }
  }, [session.accessToken]);
  useEffect(() => { latestLoad.current = load; load(); const sub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); }); return () => { latestLoad.current = null; requestVersion.current++; sub.remove(); }; }, [load]);
  const loadSaved = useCallback(async () => {
    setSavedBusy(true);
    try {
      const posts = await api.getSavedPosts();
      setSaved(posts.items.map((entry): Tile => entry.type === 'seen' ? { key: entry.id, item: entry.item as ExperiencePublication } : { key: entry.id, wall: entry.item as WallPost }));
      setSavedLoaded(true); setSectionErrors((old) => { const next = { ...old }; delete next.Saved; return next; });
    } catch (e) { setSectionErrors((old) => ({ ...old, Saved: e instanceof Error ? e.message : 'Saved could not load.' })); }
    finally { setSavedBusy(false); }
  }, []);
  useEffect(() => { if (tab === 'saved' && !savedLoaded) loadSaved(); }, [tab, savedLoaded, loadSaved]);
  const profile = data?.profile, dream = dreamData?.dream, metrics = data?.publicMetrics || {};
  const canCreate = Boolean(data?.viewerCapabilities?.isOwner && ['fan', 'creator'].includes(profile?.role || '')), creator = Boolean(profile?.isCreator && data?.viewerCapabilities?.canAccessStudio);
  const allSeens = (data?.seens || []) as ExperiencePublication[], drafts = draftPreview?.items || [], visibleSeens = allSeens.filter(publicGridSeen);
  const featured = featuredExperiences(experiences);
  const previewGifts = useMemo(() => profileGiftPreviews(gifts), [gifts]);
  const progress = dream ? dreamProgress(dream) : null;
  const seriesTiles: Tile[] = (data?.series || []).filter((group) => visibleSeens.some((item) => item.seriesId === group.id)).map((group) => ({ key: `series-${group.id}`, series: { ...group, seenCount: visibleSeens.filter((item) => item.seriesId === group.id).length } }));
  const gridTiles: Tile[] = [...(drafts.length ? [{ key: 'drafts', label: 'Drafts', count: draftPreview?.pagination.total, item: drafts[0], collection: 'drafts' as const }] : []), ...seriesTiles, ...visibleSeens.filter((item) => !item.seriesId).sort((a, b) => Number(b.isPinned) - Number(a.isPinned)).map((item) => ({ key: recordId(item), item }))];
  const tiles: Tile[] = tab === 'grid' ? gridTiles : tab === 'reposts' ? [...(data?.sharedSeens || []).map((item) => ({ key: `repost-${recordId(item)}`, item })), ...(data?.sharedWallPosts || []).map((wall) => ({ key: `wall-${wall.id}`, wall }))] : saved;
  const tileWidth = (width - insets.left - insets.right - 50) / 3;
  const showContent = (item: ExperiencePublication) => { if (item.kind === 'WORLD' || item.kind === 'PREMIUM_WORLD') openWeb(`/world/${recordId(item)}`); else if (item.status === 'DRAFT') openWeb(`/studio/${item.kind === 'EXPERIENCE' ? 'experiences' : 'seens'}/${recordId(item)}/edit`); else setSelected(item); };
  const selectTile = (tile: Tile) => { if (tile.series) setSeries(tile.series); else if (tile.collection) setCollection(tile.collection); else if (tile.wall) setCommentPost(tile.wall); else if (tile.item) showContent(tile.item); };
  const updatePost = (post: WallPost) => { setData((old) => old ? { ...old, wallPosts: post.archived ? old.wallPosts?.filter((item) => item.id !== post.id) : old.wallPosts?.map((item) => item.id === post.id ? post : item) } : old); setCommentPost((old) => old?.id === post.id ? post.archived ? null : post : old); };
  const upload = async () => {
    if (uploadLocked.current) return; uploadLocked.current = true;
    try {
      if (!(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted) throw new Error('Allow photo access to upload profile media.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0]; setUploading(true); setUploadProgress(0);
      await api.uploadProfileMedia({ uri: asset.uri, name: asset.fileName || (asset.type === 'video' ? 'profile.mp4' : 'profile.jpg'), type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg') }, setUploadProgress); await load();
      photoList.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (e) { Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please retry.'); }
    finally { uploadLocked.current = false; setUploading(false); }
  };
  const giftAction = async (gift: ProfileGift, action: 'thank' | 'pin' | 'hide') => { if (giftLocked.current) return; giftLocked.current = true; setGiftBusy(true); try { if (action === 'thank') await api.thankGift(gift.id); else await api.updateGift(gift.id, action === 'pin' ? { featuredOnProfile: !gift.featuredOnProfile } : { hiddenFromProfile: !gift.hiddenFromProfile }); await load(); } catch (e) { Alert.alert('Gift update failed', e instanceof Error ? e.message : 'Please retry.'); } finally { giftLocked.current = false; setGiftBusy(false); } };
  const sectionError = (key: string) => sectionErrors[key] ? <Pressable accessibilityRole="button" onPress={() => key === 'Saved' ? loadSaved() : load()}><Text style={s.sectionError}>{sectionErrors[key]}</Text></Pressable> : null;
  const renderTile = (tile: Tile) => tile.wall ? <Pressable key={tile.key} accessibilityLabel="Open reposted note" onPress={() => selectTile(tile)} style={[s.wallTile, { width: tileWidth }]}><Feather name="repeat" size={12} color={colors.blue} /><Text numberOfLines={6} style={s.wallTileText}>{tile.wall.text}</Text><Text style={s.wallTileFooter}>Note</Text></Pressable> : <ContentTile key={tile.key} width={tileWidth} item={tile.item} series={tile.series} label={tile.label} count={tile.count} onPress={() => selectTile(tile)} />;
  if (selected) return <SeenDetailsScreen initialSeen={selected} session={session} onClose={() => { setSelected(null); load(); }} onFeedUpdate={(id, engagement, publication) => { setData((old) => old ? { ...old, seens: old.seens?.map((item) => recordId(item) === id ? { ...item, ...publication, engagement } : item) } : old); }} />;
  const nav = <BottomNav active="profile" avatar={profile?.avatar || session.user.avatar} name={profile?.displayName || session.user.name} onSelect={onNavigate} compactProfile />;
  if (loading) return <SafeAreaView style={s.safe}><View style={s.screen}><SkeletonRows count={7} />{nav}</View></SafeAreaView>;
  return <SafeAreaView style={s.safe}><View style={s.screen}>{!profile || !data ? <ScreenState icon="person-circle-outline" title="Profile could not load" message={error} onPress={load} /> : <ScrollView removeClippedSubviews={false} contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.blue} onRefresh={() => { setRefreshing(true); load(); }} />}>
    <View style={s.topHead}><Text numberOfLines={1} style={s.username}><Text style={s.at}>@</Text>{profile.username}</Text><View style={s.headerActions}>{canCreate ? <IconButton icon="plus" label="Create" onPress={() => setCreateOpen(true)} size={15} color={colors.muted} style={s.plus} /> : null}<Pressable accessibilityLabel="Activity" accessibilityRole="button" hitSlop={6} onPress={() => openWeb('/activity')} style={s.spark}><Text style={s.sparkText}>✦</Text></Pressable></View></View>
    {error ? <Pressable onPress={load}><Text style={s.sectionError}>{error} · Retry</Text></Pressable> : null}
    <View style={s.identity}><View style={s.avatarWrap}><Pressable accessibilityLabel={stories.length ? 'Your story' : 'Add story'} onPress={() => stories.length ? setMedia({ items: stories, index: 0 }) : onCreate('story')} style={[s.storyRing, stories.length > 0 && s.storyActive]}><Avatar size={70} user={{ ...profile, name: profile.displayName }} /></Pressable><Pressable accessibilityLabel="Add story" hitSlop={7} onPress={() => onCreate('story')} style={[s.storyBadge, stories.length > 0 && s.storyBadgeActive]}>{stories.length ? <Text style={s.story24}>24</Text> : <Feather name="plus" color={colors.bg} size={12} />}</Pressable></View><View style={s.identityCopy}><View style={s.nameLine}><Text style={s.name}>{profile.displayName || profile.username}</Text>{profile.verified ? <Ionicons name="checkmark-circle" size={15} color={colors.blue} /> : null}</View><View style={s.stats}>{[['Followers', 'followers', metrics.followerCount], ['Following', 'following', metrics.followingCount], ['Seen by', 'seen-by', metrics.seenByCount]].map(([label, key, count]) => <Pressable accessibilityLabel={`${label}: ${count ?? 'unavailable'}`} key={String(key)} onPress={() => setConnections(String(key))} style={s.stat}><Text style={s.statValue}>{typeof count === 'number' ? compact(count) : '—'}</Text><Text style={s.statLabel}>{label}</Text></Pressable>)}</View>{profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}{profile.socialLinks?.[0]?.url ? <Pressable onPress={() => Linking.openURL(profile.socialLinks![0].url).catch(() => Alert.alert('Could not open website'))} style={s.contact}><Feather name="link" size={12} color={colors.blue} /><Text numberOfLines={2} style={s.website}>{profile.socialLinks[0].url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Text></Pressable> : null}{data.viewerCapabilities?.isOwner && profile.email ? <View style={s.contact}><Feather name="mail" size={12} color={colors.faint} /><Text selectable style={s.email}>{profile.email}</Text></View> : null}</View></View>
    <Pressable accessibilityLabel="Change status" hitSlop={7} onPress={() => setForm('status')} style={s.status}><Text style={[s.statusText, profile.activeStatus?.label ? { color: profile.activeStatus.color || colors.blue } : null]}>{profileStatusText(profile.activeStatus)} ›</Text></Pressable>
    <View style={s.ownerActions}>{data.viewerCapabilities?.canEditProfile ? <Pressable onPress={() => setForm('edit')} hitSlop={5} style={s.smallButton}><Text style={s.smallText}>Edit</Text></Pressable> : null}<Pressable onPress={() => Share.share({ title: `${profile.displayName} on @seen`, message: `${WEB_BASE_URL}/profile/${encodeURIComponent(profile.username || '')}` }).catch((e) => Alert.alert('Could not share', String(e)))} hitSlop={5} style={s.smallButton}><Text style={s.smallText}>Share</Text></Pressable><IconButton icon="more-horizontal" label="Your things" color={colors.text} onPress={() => setOwnerMenu(true)} style={s.moreButton} /></View>
    {creator ? <View style={s.tools}><View style={s.toolsRow}><Pressable accessibilityLabel="Direct Access inbox" onPress={onDirectAccess} style={s.directMain}><View style={s.daIcon}><Text style={s.daSpark}>✦</Text></View><Text style={s.toolTitle}>Direct Access</Text></Pressable><IconButton label="Direct Access settings" icon="settings" size={15} onPress={() => setForm('direct')} /><IconButton label="Open Direct Access" icon="chevron-right" size={11} onPress={onDirectAccess} /></View><View style={s.toolDivider} /><Pressable accessibilityLabel="Professional dashboard" onPress={() => openWeb('/studio')} style={s.toolsRow}><Feather name="bar-chart-2" size={15} color={colors.muted} style={s.chart} /><Text style={s.dashboardText}>Professional dashboard</Text><Feather name="chevron-right" color={colors.faint} size={11} /></Pressable></View> : null}
    {gifts.length ? <Pressable accessibilityLabel="Received gifts" onPress={() => setGiftsOpen(true)} style={s.gifts}><View style={s.giftArt}>{previewGifts.map((gift, index) => <ProfileImage key={gift.id} uri={gift.imageUrl} contain style={[s.giftImage, index > 0 && { marginLeft: -4 }]} />)}</View><Text style={s.giftCount}>Gifts</Text><Feather name="chevron-right" size={12} color={colors.faint} style={s.giftArrow} /></Pressable> : null}{sectionError('Gifts')}
    <SectionHeading title="Photos" />
    <FlatList ref={photoList} horizontal data={photos} keyExtractor={(item) => String(item.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos} initialNumToRender={5} windowSize={3} removeClippedSubviews={false}
      renderItem={({ item, index }) => <Pressable accessibilityLabel={`Open photo or video ${index + 1}`} onPress={() => setMedia({ items: photos, index })} style={s.photoTile}><ProfileImage uri={/video/i.test(item.mediaType || '') ? item.thumbnailUrl : item.mediaUrl} style={StyleSheet.absoluteFill} />{/video/i.test(item.mediaType || '') ? <View style={s.videoBadge}><Feather name="play" size={8} color={colors.text} /><Text style={s.duration}>{duration(item.duration)}</Text></View> : null}</Pressable>}
      ListFooterComponent={<View style={{ flexDirection: 'row', gap: 7 }}><Pressable accessibilityLabel="Upload profile photo or video" disabled={uploading} onPress={upload} style={s.uploadTile}>{uploading ? <><ActivityIndicator size="small" color={colors.blue} /><Text style={s.uploadText}>{uploadProgress}% uploaded</Text></> : <Feather name="plus" color={colors.faint} size={20} />}</Pressable></View>} />
    {photos.length >= 100 ? <Text style={s.empty}>Showing up to 100 profile photos and videos.</Text> : null}{sectionError('Photos')}{sectionError('Stories')}
    <SectionHeading title="Experiences"><Pressable hitSlop={8} onPress={() => setCollection('experiences')}><Text style={s.seeAll}>See all ›</Text></Pressable>{creator ? <IconButton label="Create experience" icon="plus" size={15} color={colors.muted} style={s.sectionPlus} onPress={() => onCreate('experience')} /> : null}</SectionHeading>{featured.length ? featured.map((item) => <ExperiencePreview key={recordId(item)} item={item} onPress={() => showContent(item)} />) : <Text style={s.empty}>No published experiences yet.</Text>}{sectionError('Experiences')}
    <View style={s.tabs}>{(['grid', 'reposts', 'saved'] as const).map((key) => <Pressable accessibilityRole="tab" accessibilityLabel={key} accessibilityState={{ selected: tab === key }} key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.activeTab]}><Feather name={key === 'grid' ? 'grid' : key === 'reposts' ? 'repeat' : 'bookmark'} size={key === 'saved' ? 18 : 20} color={tab === key ? colors.text : colors.faint} /></Pressable>)}</View><View style={s.grid}>{tiles.slice(0, 6).map(renderTile)}</View>{tab === 'saved' && savedBusy ? <ActivityIndicator color={colors.blue} style={s.loader} /> : !tiles.length ? <Text style={s.empty}>{tab === 'grid' ? 'Your Seens live here — create one with +' : tab === 'reposts' ? 'No reposts yet.' : 'No saved content yet.'}</Text> : null}{tab === 'saved' ? sectionError('Saved') : null}{tiles.length > 6 || tab === 'saved' && tiles.length > 0 ? <Pressable onPress={() => tab === 'reposts' ? openWeb(`/profile/${profile.username}`) : setCollection(tab === 'saved' ? 'saved' : 'seens')} style={s.viewAll}><Text style={s.viewAllText}>{tab === 'grid' ? 'View all Seens' : tab === 'saved' ? 'View all saved' : 'View all reposts'} →</Text></Pressable> : null}
    {creator && dream ? <><SectionHeading title="Dream">{dream.cameTrueCount ? <View style={s.achievement}><Text style={s.achievementText}>{dream.cameTrueCount} CAME TRUE</Text></View> : null}</SectionHeading><View style={s.dream}><View style={s.dreamHead}><Text style={s.dreamEmoji}>{dream.emoji || '✨'}</Text><Text style={s.dreamTitle}>{dream.title}</Text><IconButton label="Dream options" icon="more-horizontal" size={14} onPress={() => setDreamMenu(true)} /></View><Text numberOfLines={2} style={s.dreamReason}>“{dream.reason}”</Text>{dream.status === 'COMPLETED' ? <Text style={s.completed}>✓ Dream completed</Text> : <><View style={s.progressRow}><View style={s.track}><LinearGradient colors={['#9CCBFF', '#E8F4FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: '100%', width: `${progress ?? 0}%` }} /></View><Text style={s.percent}>{progress === null ? '—' : `${progress}%`}</Text></View><View style={s.dreamFoot}><Text style={s.storyCount}>{compact(dream.supporterCount || 0)} in this story</Text><Pressable hitSlop={10} onPress={() => setForm('dream')}><Text style={s.dreamEdit}>Edit ›</Text></Pressable></View></>}</View></> : creator ? <Pressable onPress={() => setForm('dream')} style={s.createDream}><Text>✨</Text><Text style={s.dreamEntry}>Dream Experience</Text><Text style={s.dreamEdit}>Create ›</Text></Pressable> : null}{sectionError('Dream')}
    <SectionHeading title="Wall" />{(data.wallPosts || []).slice(0, 2).map((post) => <ProfileWallPreview key={post.id} post={post} session={session} onUpdate={updatePost} onComments={setCommentPost} openWeb={openWeb} />)}<Pressable accessibilityLabel="Open your Wall" onPress={() => setWallOpen(true)} style={s.wallLink}><Text style={s.wallLabel}>Wall</Text><Text style={s.noteCount}>{data.wallPosts?.length || 0} notes</Text><Feather name="chevron-right" size={12} color={colors.faint} /></Pressable>
    <SectionHeading title="Your World" />{data.planets?.[0] ? <WorldPreview world={worldData?.publication || data.planets[0]} capacity={worldData?.management.seatStatus.unlimited ? null : worldData?.management.seatStatus.capacity} residents={worldData?.management.seatStatus.occupiedSeats} price={worldData?.management.subscription.priceStars} onPress={() => openWeb(`/world/${recordId(data.planets![0])}`)} /> : creator ? <WorldCreationEntry onPress={() => onCreate('world')} /> : <Text style={s.empty}>No world yet.</Text>}{sectionError('World')}
  </ScrollView>}{nav}
  {profile && form ? <ProfileForm key={form} kind={form} profile={profile} dream={dream} onClose={() => setForm(null)} onSaved={load} /> : null}
  {connections ? <ConnectionsSheet type={connections} onClose={() => setConnections(null)} onOpen={(user) => openWeb(`/profile/${encodeURIComponent(user.username || '')}`)} /> : null}
  {ownerMenu ? <ProfileSheet title="Your things" onClose={() => setOwnerMenu(false)}><SheetRow title="Unlocked" detail="Experiences you own — forever" onPress={() => { setOwnerMenu(false); setCollection('unlocked'); }} /><SheetRow title="Archive" detail="Hidden from your profile" onPress={() => { setOwnerMenu(false); setCollection('archive'); }} /><SheetRow title="Link-only Seens" detail="Only people with your link" onPress={() => { setOwnerMenu(false); setCollection('link-only'); }} /><SheetRow title="Wallet" onPress={() => { setOwnerMenu(false); openWeb('/wallet'); }} /><SheetRow title="Settings" detail="Account & privacy" onPress={() => { setOwnerMenu(false); openWeb('/settings'); }} /></ProfileSheet> : null}
  {giftsOpen ? <ProfileSheet title="Received gifts" onClose={() => setGiftsOpen(false)}><FlatList data={gifts} style={sheetStyles.list} keyExtractor={(item) => item.id} ListEmptyComponent={<Text style={sheetStyles.empty}>No gifts yet.</Text>} ListFooterComponent={gifts.length >= 100 ? <Text style={sheetStyles.empty}>Showing your latest 100 gifts.</Text> : null} renderItem={({ item }) => <View style={sheetStyles.row}><ProfileImage uri={item.imageUrl} contain style={s.collectionGift} /><View style={sheetStyles.copy}><Text style={sheetStyles.title}>{item.name}</Text><Text style={sheetStyles.detail}>{item.sender?.name || 'Private supporter'} · {compact(item.stars || 0)} coins{item.hiddenFromProfile ? ' · Hidden' : ''}</Text><View style={s.giftActions}><Pressable disabled={giftBusy || Boolean(item.thankedAt) || (item.source === 'Dream' && item.visibility === 'RECIPIENT_ONLY')} onPress={() => giftAction(item, 'thank')}><Text style={s.dreamEdit}>{item.source === 'Dream' && item.visibility === 'RECIPIENT_ONLY' ? 'Private' : item.thankedAt ? 'Thanked' : 'Thank'}</Text></Pressable><Pressable disabled={giftBusy} onPress={() => giftAction(item, 'pin')}><Text style={s.dreamEdit}>{item.featuredOnProfile ? 'Unpin' : 'Pin'}</Text></Pressable><Pressable disabled={giftBusy} onPress={() => giftAction(item, 'hide')}><Text style={s.dreamEdit}>{item.hiddenFromProfile ? 'Show' : 'Hide'}</Text></Pressable></View></View></View>} /></ProfileSheet> : null}
  {dreamMenu && dream ? <ProfileSheet title="Your Dream" onClose={() => setDreamMenu(false)}><SheetRow title="Edit Dream" onPress={() => { setDreamMenu(false); setForm('dream'); }} />{dream.status === 'ACTIVE' ? <><SheetRow title="Dream came true" onPress={() => Alert.alert('Complete Dream?', 'Mark this Dream as completed?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Complete', onPress: async () => { try { await api.completeDream(String(dream.id), dream.version); setDreamMenu(false); load(); } catch (e) { Alert.alert('Could not complete Dream', String(e)); } } }])} /><SheetRow title="Remove Dream" onPress={() => Alert.alert('Remove Dream?', 'Remove this Dream from your profile?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { try { await api.removeDream(String(dream.id), dream.version); setDreamMenu(false); load(); } catch (e) { Alert.alert('Could not remove Dream', String(e)); } } }])} /></> : null}</ProfileSheet> : null}
  {media ? <ProfileMediaViewer items={media.items} initialIndex={media.index} onClose={() => setMedia(null)} /> : null}
  {commentPost ? <CommentsModal post={commentPost} session={session} onClose={() => setCommentPost(null)} updatePost={updatePost} /> : null}
  {series ? <ProfileSheet title={series.name} onClose={() => setSeries(null)}><FlatList data={visibleSeens.filter((item) => item.seriesId === series.id)} keyExtractor={recordId} style={sheetStyles.list} renderItem={({ item }) => <SheetRow title={item.title || 'Untitled Seen'} onPress={() => { setSeries(null); showContent(item); }} />} /></ProfileSheet> : null}
  {collection === 'saved' ? <SavedPosts onClose={() => setCollection(null)} onOpen={(item) => { setCollection(null); showContent(item); }} onNote={(post) => { setCollection(null); setCommentPost(post); }} openWeb={openWeb} /> : collection ? <ProfileCollection key={collection} collection={collection} username={profile?.username || ''} onClose={() => setCollection(null)} onOpen={(item) => { setCollection(null); showContent(item); }} openWeb={openWeb} onFeedArchive={() => { setCollection(null); setFeedArchiveOpen(true); }} /> : null}
  {feedArchiveOpen ? <ArchivedFeedPosts onClose={() => setFeedArchiveOpen(false)} /> : null}
  {wallOpen ? <ProfileSheet title="Your Wall" onClose={() => setWallOpen(false)}><FlatList style={sheetStyles.list} data={data?.wallPosts || []} keyExtractor={(post) => post.id} ListEmptyComponent={<Text style={sheetStyles.empty}>No notes yet.</Text>} renderItem={({ item }) => <ProfileWallPreview post={item} session={session} onUpdate={updatePost} onComments={(post) => { setWallOpen(false); setCommentPost(post); }} openWeb={openWeb} />} /><SheetRow title="Write a note" onPress={() => { setWallOpen(false); onCreate('note'); }} /></ProfileSheet> : null}
  {createOpen ? <CreateMenu targets={creator ? undefined : ['seen', 'story', 'note']} onClose={() => setCreateOpen(false)} onSelect={(target) => { setCreateOpen(false); onCreate(target); }} /> : null}
  </View></SafeAreaView>;
}

function ProfileCollection({ collection, username, onClose, onOpen, openWeb, onFeedArchive }: { collection: Collection; username: string; onClose: () => void; onOpen: (item: ExperiencePublication) => void; openWeb: (path: string) => void; onFeedArchive: () => void }) {
  const [items, setItems] = useState<ExperiencePublication[]>([]), [paging, setPaging] = useState<PageInfo | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const load = async (page = 1) => {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try {
      if (collection === 'experiences') { const result = await api.getProfileExperiences(username); setItems(result.items); }
      else { const result = collection === 'unlocked' ? await api.getUnlockedExperiences(page) : await api.listOwnPublications(collection === 'archive' ? 'SEEN,EXPERIENCE,WORLD,PREMIUM_WORLD' : collection === 'drafts' ? 'SEEN,EXPERIENCE' : 'SEEN', collection === 'drafts' ? 'DRAFT' : collection === 'archive' ? 'ARCHIVED' : '', page); const rows = result.items.filter((item) => collection === 'link-only' ? item.visibility === 'LINK_ONLY' : collection === 'seens' ? publicGridSeen(item) : true); setItems((old) => page === 1 ? rows : [...old, ...rows]); setPaging({ ...result.pagination, hasMore: result.pagination.hasMore ?? result.pagination.page < (result.pagination.pages || 1) }); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load collection.'); }
    finally { locked.current = false; setBusy(false); }
  };
  useEffect(() => { load(); }, [collection]);
  return <ProfileSheet title={{ seens: 'Your Seens', experiences: 'Experiences', drafts: 'Drafts', unlocked: 'Unlocked', archive: 'Archive', saved: 'Saved', 'link-only': 'Link-only Seens' }[collection]} onClose={onClose}>{error ? <SheetRow title={error} detail="Tap to retry" onPress={() => load(paging ? paging.page + 1 : 1)} /> : null}<FlatList data={items} style={sheetStyles.list} keyExtractor={recordId} onEndReached={() => { if (paging?.hasMore && !error) load(paging.page + 1); }} ListEmptyComponent={!busy && !error ? <Text style={sheetStyles.empty}>Nothing here yet.</Text> : null} ListFooterComponent={busy ? <ActivityIndicator color={colors.blue} /> : null} renderItem={({ item }) => <View style={s.collectionRow}><ExperiencePreview item={item} onPress={() => onOpen(item)} /></View>} />{collection === 'saved' ? <SheetRow title="Saved notes and all collections" onPress={() => openWeb('/saved')} /> : collection === 'archive' ? <SheetRow title="Archived feed posts" onPress={onFeedArchive} /> : null}</ProfileSheet>;
}

function SavedPosts({ onClose, onOpen, onNote, openWeb }: { onClose: () => void; onOpen: (item: ExperiencePublication) => void; onNote: (post: WallPost) => void; openWeb: (path: string) => void }) {
  const [items, setItems] = useState<{ id: string; type: string; item: ExperiencePublication | WallPost }[]>([]);
  const [paging, setPaging] = useState<PageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false), failedPage = useRef(1);
  const load = async (page = 1) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); failedPage.current = page;
    try {
      const result = await api.getSavedPosts(page);
      setItems((old) => page === 1 ? result.items : [...old, ...result.items.filter((item) => !old.some((existing) => existing.id === item.id))]);
      setPaging({ ...result.pagination, hasMore: result.pagination.hasMore ?? result.pagination.page < (result.pagination.pages || 1) });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load saved posts.'); }
    finally { locked.current = false; setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  return <ProfileSheet title="Saved posts" onClose={onClose}>
    {error ? <SheetRow title={error} detail="Tap to retry" onPress={() => load(failedPage.current)} /> : null}
    <FlatList data={items} style={sheetStyles.list} keyExtractor={(entry) => entry.id}
      onEndReached={() => { if (paging?.hasMore && !error) load(paging.page + 1); }}
      ListEmptyComponent={!busy && !error ? <Text style={sheetStyles.empty}>No saved posts yet.</Text> : null}
      ListFooterComponent={busy ? <ActivityIndicator color={colors.blue} /> : null}
      renderItem={({ item: entry }) => entry.type === 'seen' ? <View style={s.collectionRow}><ExperiencePreview item={entry.item as ExperiencePublication} onPress={() => onOpen(entry.item as ExperiencePublication)} /></View> : <SheetRow title={(entry.item as WallPost).text || 'Media post'} detail="Open saved note" onPress={() => onNote(entry.item as WallPost)} />} />
    <SheetRow title="All saved collections" onPress={() => openWeb('/saved')} />
  </ProfileSheet>;
}

function ArchivedFeedPosts({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<WallPost[]>([]);
  const [paging, setPaging] = useState<PageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const failedPage = useRef(1);
  const load = async (page = 1) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); failedPage.current = page;
    try {
      const result = await api.getArchivedFeedPosts(page);
      setItems((old) => page === 1 ? result.items : [...old, ...result.items.filter((item) => !old.some((existing) => existing.id === item.id))]);
      setPaging({ ...result.pagination, hasMore: result.pagination.page < (result.pagination.pages || 1) });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load archived posts.'); }
    finally { locked.current = false; setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  return <ProfileSheet title="Archived feed posts" onClose={onClose}>
    {error ? <SheetRow title={error} detail="Tap to retry" onPress={() => load(failedPage.current)} /> : null}
    <FlatList data={items} style={sheetStyles.list} keyExtractor={(post) => post.id}
      onEndReached={() => { if (paging?.hasMore && !error) load(paging.page + 1); }}
      ListEmptyComponent={!busy && !error ? <Text style={sheetStyles.empty}>No archived feed posts.</Text> : null}
      ListFooterComponent={busy ? <ActivityIndicator color={colors.blue} /> : null}
      renderItem={({ item }) => <View style={sheetStyles.row}><View style={sheetStyles.copy}><Text style={sheetStyles.title}>{item.text || 'Media post'}</Text><Text style={sheetStyles.detail}>{[item.context, item.location].filter(Boolean).join(' ? ') || 'Archived post'}</Text></View></View>} />
  </ProfileSheet>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, screen: { flex: 1 }, scroll: { paddingHorizontal: 20, paddingBottom: 34 }, topHead: { paddingTop: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }, username: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700', letterSpacing: -.2 }, at: { color: colors.blue }, headerActions: { flexDirection: 'row', gap: 9, alignItems: 'center' }, plus: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, spark: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(255,255,255,.06)' }, sparkText: { fontSize: 16, color: colors.blue },
  identity: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 14 }, avatarWrap: { width: 81, height: 81 }, storyRing: { borderRadius: 40.5, borderWidth: 2.5, borderColor: 'rgba(255,255,255,.18)', padding: 3, width: 81, height: 81, justifyContent: 'center', alignItems: 'center' }, storyActive: { borderColor: colors.blue, shadowColor: colors.blue, shadowRadius: 15, shadowOpacity: .35 }, storyBadge: { position: 'absolute', right: -1, bottom: -1, borderWidth: 2.5, borderColor: colors.bg, width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, storyBadgeActive: { backgroundColor: 'rgba(10,13,18,.85)' }, story24: { color: '#BFE3FF', fontSize: 8, fontWeight: '800' }, identityCopy: { flex: 1, minWidth: 0 }, nameLine: { flexDirection: 'row', gap: 5, alignItems: 'center' }, name: { color: colors.text, fontSize: 21, fontWeight: '700', flexShrink: 1 }, stats: { flexDirection: 'row', marginTop: 9 }, stat: { flex: 1, minWidth: 0, paddingVertical: 2 }, statValue: { color: colors.text, fontSize: 15, letterSpacing: -.3, fontWeight: '700' }, statLabel: { color: colors.faint, fontSize: 9.5, letterSpacing: .3, marginTop: 5 }, bio: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }, contact: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 }, website: { flex: 1, color: colors.blue, fontSize: 12, fontWeight: '600' }, email: { flex: 1, color: colors.faint, fontSize: 11.5 },
  status: { alignSelf: 'flex-start', marginTop: 11 }, statusText: { color: colors.faint, fontSize: 12, fontWeight: '600' }, ownerActions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 }, smallButton: { borderRadius: 11, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 }, smallText: { color: colors.text, fontSize: 11.5, fontWeight: '600' }, moreButton: { width: 35, height: 30, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 },
  tools: { borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,.035)', overflow: 'hidden', marginTop: 14 }, toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 }, directMain: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 10, alignItems: 'center' }, daIcon: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(156,203,255,.35)', backgroundColor: 'rgba(156,203,255,.1)', alignItems: 'center', justifyContent: 'center' }, daSpark: { color: colors.blue, fontSize: 9.5 }, toolTitle: { fontSize: 12.5, fontWeight: '700', color: colors.text, flexShrink: 1 }, toolDivider: { height: 1, backgroundColor: 'rgba(255,255,255,.05)', marginHorizontal: 14 }, chart: { width: 22, textAlign: 'center' }, dashboardText: { flex: 1, color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  gifts: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 2, paddingHorizontal: 4, marginTop: 10 }, giftArt: { flexDirection: 'row' }, giftImage: { width: 32, height: 32, backgroundColor: 'transparent' }, giftCount: { color: colors.faint, fontSize: 10.5 }, giftArrow: { marginLeft: 'auto' }, photos: { gap: 7, paddingBottom: 2 }, photoTile: { width: 86, height: 108, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2 }, uploadTile: { width: 86, height: 108, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center', gap: 8 }, uploadText: { color: colors.faint, fontSize: 10 }, videoBadge: { position: 'absolute', right: 6, bottom: 6, flexDirection: 'row', gap: 3, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(10,13,18,.72)', borderRadius: 999, alignItems: 'center' }, duration: { color: colors.text, fontSize: 8.5, fontWeight: '800' }, seeAll: { color: colors.faint, fontSize: 11 }, sectionPlus: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', backgroundColor: 'rgba(255,255,255,.06)' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.05)', marginTop: 2 }, tab: { flex: 1, alignItems: 'center', paddingTop: 11, paddingBottom: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: colors.blue }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 12 }, viewAll: { paddingVertical: 3, paddingHorizontal: 2, marginTop: 10 }, viewAllText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, wallTile: { aspectRatio: .8, borderRadius: 10, padding: 9, backgroundColor: colors.surface2 }, wallTileText: { color: colors.muted, fontSize: 10.5, lineHeight: 15, marginTop: 10 }, wallTileFooter: { marginTop: 'auto', color: colors.faint, fontSize: 10 },
  achievement: { borderRadius: 999, borderColor: 'rgba(110,207,151,.3)', borderWidth: 1, backgroundColor: 'rgba(110,207,151,.1)', paddingVertical: 3, paddingHorizontal: 9 }, achievementText: { color: '#6ECF97', fontSize: 9, fontWeight: '800', letterSpacing: .6 }, dream: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 15, backgroundColor: 'rgba(255,255,255,.028)' }, dreamHead: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dreamEmoji: { fontSize: 14 }, dreamTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700', letterSpacing: -.2, flex: 1 }, dreamReason: { fontSize: 12, lineHeight: 18.6, fontStyle: 'italic', color: colors.muted, marginTop: 5 }, progressRow: { flexDirection: 'row', gap: 9, alignItems: 'center', marginTop: 9 }, track: { flex: 1, height: 2.5, borderRadius: 99, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.07)' }, percent: { fontSize: 10, color: colors.blue, fontWeight: '700' }, dreamFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }, storyCount: { color: colors.faint, fontSize: 9.5 }, dreamEdit: { color: colors.blue, fontSize: 11.5, fontWeight: '600' }, completed: { color: '#6ECF97', fontSize: 11.5, marginTop: 11 }, createDream: { marginTop: 14, flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 2 }, dreamEntry: { color: colors.muted, fontSize: 12, flex: 1 },
  wallLink: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 2, marginTop: 6 }, wallLabel: { fontSize: 13, fontWeight: '700', color: colors.text, flex: 1 }, noteCount: { fontSize: 10.5, color: colors.faint }, empty: { color: colors.faint, fontSize: 12, textAlign: 'center', paddingVertical: 18 }, sectionError: { color: colors.danger, fontSize: 11, lineHeight: 16, paddingVertical: 8 }, loader: { marginVertical: 15 }, collectionGift: { width: 44, height: 44, backgroundColor: 'transparent' }, giftActions: { flexDirection: 'row', gap: 18, marginTop: 10 }, collectionRow: { paddingVertical: 8 },
});
