import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BottomNav } from '../components/BottomNav';
import { CreateMenu } from '../components/CreateMenu';
import { SeenCard } from '../components/SeenCard';
import { SearchScreen } from './SearchScreen';
import { SeenDetailsScreen } from './SeenDetailsScreen';
import { SeenActivitySheet } from '../components/SeenActivitySheet';
import { api } from '../services/api';
import { colors } from '../theme';
import { seenId } from '../utils/seenPresentation';
import { hideSeenArrows } from '../utils/seenArrowVisibility';
import type { CreateTarget, Engagement, MainTab, Seen, Session } from '../types';

export function SeenScreen({ session, onCreate, onLogout, onNavigate }: { session: Session; onCreate: (target: CreateTarget) => void; onLogout: () => void; onNavigate: (key: MainTab) => void }) {
  const [items, setItems] = useState<Seen[]>([]), [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const [tab, setTab] = useState<'seen' | 'friends'>('seen'), [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Seen | null>(null), [createOpen, setCreateOpen] = useState(false), [activityOpen, setActivityOpen] = useState(false);
  const [nextPage, setNextPage] = useState(1), [hasMore, setHasMore] = useState(false), [loadingMore, setLoadingMore] = useState(false);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const generation = useRef(0), pending = useRef(false);
  const list = useRef<FlatList<Seen>>(null);
  const load = useCallback(async (page = 1) => {
    if (page > 1 && pending.current) return;
    const request = page === 1 ? ++generation.current : generation.current;
    pending.current = true; setError('');
    if (page > 1) setLoadingMore(true);
    try {
      const result = await api.listSeens(session.accessToken, tab, page);
      if (request !== generation.current) return;
      setItems((old) => page === 1 ? result.items || [] : [...old, ...(result.items || [])].filter((item, index, all) => all.findIndex((candidate) => seenId(candidate) === seenId(item)) === index));
      setNextPage(page + 1); setHasMore(Boolean(result.pagination?.hasMore));
    } catch (reason) { if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Could not load Seen.'); }
    finally { if (request === generation.current) { pending.current = false; setLoading(false); setRefreshing(false); setLoadingMore(false); } }
  }, [session.accessToken, tab]);
  useEffect(() => { setLoading(true); setItems([]); list.current?.scrollToOffset({ offset: 0, animated: false }); load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => {
    if (!createOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setCreateOpen(false); return true; });
    return () => subscription.remove();
  }, [createOpen]);
  const updateItem = useCallback((id: string, engagement: Engagement, publication?: Seen) => {
    setItems((old) => old.map((item) => seenId(item) === id ? { ...item, ...publication, engagement } : item));
    setSelected((old) => old && seenId(old) === id ? { ...old, ...publication, engagement } : old);
  }, []);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: Seen; isViewable: boolean }[] }) => setVisibleIds(viewableItems.filter((entry) => entry.isViewable).map((entry) => seenId(entry.item)))).current;
  if (searchOpen) return <SearchScreen session={session} onClose={() => setSearchOpen(false)} />;
  if (selected) return <SeenDetailsScreen initialSeen={selected} onClose={() => setSelected(null)} onFeedUpdate={updateItem} session={session} />;
  return <SafeAreaView style={s.safe}><View style={s.screen}>
    <View style={s.header}><View style={s.tabs}><Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'seen' }} onPress={() => setTab('seen')} style={s.tab}><Feather name="eye" size={20} color={colors.blue} /><Text style={[s.tabText, tab === 'seen' && s.active]}>Seen</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'friends' }} onPress={() => setTab('friends')}><Text style={[s.tabText, tab === 'friends' && s.active]}>Following</Text></Pressable></View><View style={s.headerActions}><Pressable accessibilityLabel="Create" onPress={() => setCreateOpen(!createOpen)} style={s.round}><Feather name="plus" color={colors.muted} size={20} /></Pressable><Pressable accessibilityLabel="Search Seens" onPress={() => { setSearchOpen(!searchOpen); }} style={s.round}><Feather name={searchOpen ? 'x' : 'search'} color={colors.muted} size={18} /></Pressable><Pressable accessibilityLabel="Activity" onPress={() => setActivityOpen(true)} onLongPress={onLogout} style={s.round}><Ionicons name="sparkles" color={colors.blue} size={19} /></Pressable></View></View>
    {loading ? <View style={s.state}><ActivityIndicator color={colors.blue} /><Text style={s.stateText}>Opening Seen…</Text></View> : <FlatList ref={list} onScrollBeginDrag={hideSeenArrows} onMomentumScrollBegin={hideSeenArrows} data={items} keyExtractor={seenId} onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={{ viewAreaCoveragePercentThreshold: 15 }} removeClippedSubviews={false} onEndReached={() => { if (hasMore && !error) load(nextPage); }} onEndReachedThreshold={.5} refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.blue} onRefresh={() => { setRefreshing(true); load(); }} />} ListEmptyComponent={<View style={s.state}><Feather name="eye" size={32} color={colors.blue} /><Text style={s.emptyTitle}>{error ? 'Could not load Seen' : tab === 'friends' ? 'Your following feed is quiet' : 'Nothing Seen yet'}</Text><Text style={s.stateText}>{error || (tab === 'friends' ? 'Follow people to see their published Seens here.' : 'Published Seens will appear here.')}</Text><Pressable onPress={error ? () => load() : () => onNavigate('discover')} style={s.retry}><Text style={s.retryText}>{error ? 'Try again' : 'Discover people'}</Text></Pressable></View>} ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.blue} style={s.footer} /> : error && items.length ? <Pressable onPress={() => load(nextPage)} style={s.footer}><Text style={s.stateText}>{error}</Text><Text style={s.retryText}>Retry loading more</Text></Pressable> : undefined} renderItem={({ item }) => <SeenCard accessToken={session.accessToken} viewerId={String(session.user.id || session.user._id || '')} active={visibleIds.includes(seenId(item))} item={item} onEngagementChange={updateItem} onPublicationChange={(publication) => updateItem(seenId(publication), publication.engagement || item.engagement || {}, publication)} onOpen={setSelected} onHidden={(id) => setItems((old) => old.filter((entry) => seenId(entry) !== id))} />} />}
    <BottomNav compactProfile active="seen" avatar={session.user.avatar} name={session.user.name || session.user.username} onSelect={onNavigate} />
    {createOpen ? <CreateMenu onClose={() => setCreateOpen(false)} onSelect={(target) => { setCreateOpen(false); onCreate(target); }} /> : null}
    <SeenActivitySheet accessToken={session.accessToken} visible={activityOpen} onClose={() => setActivityOpen(false)} onOpenSeen={(id) => { setActivityOpen(false); setSelected({ id, kind: 'SEEN' }); }} />
  </View></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg }, screen: { flex: 1 }, header: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, tabs: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 }, tab: { flexDirection: 'row', alignItems: 'center', gap: 8 }, tabText: { fontSize: 18, letterSpacing: -.6, fontWeight: '800', color: colors.faint }, active: { color: colors.text }, headerActions: { flexDirection: 'row', gap: 8 }, round: { width: 39, height: 39, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,.05)', alignItems: 'center', justifyContent: 'center' }, search: { marginHorizontal: 20, marginBottom: 10, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, input: { flex: 1, color: colors.text, paddingVertical: 13, fontSize: 13 }, hint: { color: colors.faint, fontSize: 9 }, state: { minHeight: 380, flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 }, stateText: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 }, emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' }, retry: { paddingHorizontal: 18, paddingVertical: 12, backgroundColor: colors.surface2, borderRadius: 99 }, retryText: { color: colors.blue, fontWeight: '700', textAlign: 'center' }, footer: { padding: 24, gap: 10 } });
