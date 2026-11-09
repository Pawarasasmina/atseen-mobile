import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomNav } from '../components/BottomNav';
import { CreateMenu } from '../components/CreateMenu';
import { SeenCard } from '../components/SeenCard';
import { SeenDetailsScreen } from './SeenDetailsScreen';
import { api } from '../services/api';
import { colors } from '../theme';
import type { CreateTarget, Engagement, MainTab, Seen, Session } from '../types';

export function SeenScreen({ session, onCreate, onLogout, onNavigate }: { session: Session; onCreate: (target: CreateTarget) => void; onLogout: () => void; onNavigate: (key: MainTab) => void }) {
  const [items, setItems] = useState<Seen[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const [selected, setSelected] = useState<Seen | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const load = useCallback(async () => { setError(''); try { setItems((await api.listSeens(session.accessToken)).items || []); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load Seen'); } finally { setLoading(false); setRefreshing(false); } }, [session.accessToken]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!createMenuOpen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setCreateMenuOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [createMenuOpen]);
  const updateFeedItem = useCallback((id: string, engagement: Engagement, publication?: Seen) => {
    setItems((current) => current.map((item) => String(item.id || item._id) === String(id) ? { ...item, ...(publication || {}), engagement } : item));
    setSelected((current) => current && String(current.id || current._id) === String(id) ? { ...current, ...(publication || {}), engagement } : current);
  }, []);
  const selectCreate = (target: CreateTarget) => {
    setCreateMenuOpen(false);
    onCreate(target);
  };
  if (selected) return <SeenDetailsScreen initialSeen={selected} onClose={() => setSelected(null)} onFeedUpdate={updateFeedItem} session={session} />;
  return <SafeAreaView style={styles.safe}><View style={styles.screen}><View style={styles.header}><View style={styles.tabs}><Ionicons name="eye" color={colors.blue} size={20} /><Text style={styles.active}>Seen</Text><Text style={styles.inactive}>Friends</Text></View><View style={styles.headerActions}><Pressable accessibilityLabel="Create" accessibilityRole="button" onPress={() => setCreateMenuOpen((current) => !current)} style={[styles.round, createMenuOpen && styles.roundActive]}><Ionicons name="add" color={createMenuOpen ? colors.blue : colors.muted} size={23} /></Pressable><Pressable style={styles.round}><Ionicons name="search" color={colors.muted} size={19} /></Pressable><Pressable accessibilityLabel="Log out" onLongPress={onLogout} style={styles.round}><Ionicons name="sparkles" color={colors.blue} size={18} /></Pressable></View></View>{loading ? <View style={styles.state}><ActivityIndicator color={colors.blue} /><Text style={styles.stateText}>Opening Seen...</Text></View> : <FlatList data={items} keyExtractor={(item, index) => String(item.id || item._id || index)} ListEmptyComponent={<View style={styles.state}><Ionicons name="eye-outline" color={colors.blue} size={34} /><Text style={styles.emptyTitle}>{error ? 'Could not load Seen' : 'Nothing Seen yet'}</Text><Text style={styles.stateText}>{error || 'Published Seens will appear here.'}</Text><Pressable onPress={load} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>} refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.blue} onRefresh={() => { setRefreshing(true); load(); }} />} renderItem={({ item }) => <SeenCard accessToken={session.accessToken} item={item} onEngagementChange={(id, engagement) => updateFeedItem(id, engagement)} onOpen={setSelected} />} /> }<BottomNav active="seen" avatar={session.user.avatar} name={session.user.name || session.user.username} onSelect={onNavigate} />{createMenuOpen ? <CreateMenu onClose={() => setCreateMenuOpen(false)} onSelect={selectCreate} /> : null}</View></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg }, screen: { flex: 1, backgroundColor: colors.bg }, header: { height: 70, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomColor: colors.line, borderBottomWidth: 1 }, tabs: { flexDirection: 'row', alignItems: 'center', gap: 10 }, active: { color: colors.text, fontSize: 19, fontWeight: '900' }, inactive: { marginLeft: 8, color: colors.faint, fontSize: 18, fontWeight: '800' }, headerActions: { flexDirection: 'row', gap: 8 }, round: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, roundActive: { borderColor: 'rgba(156,203,255,.35)', backgroundColor: 'rgba(156,203,255,.08)' }, state: { flex: 1, minHeight: 400, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 10 }, emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900' }, stateText: { color: colors.muted, fontSize: 13, textAlign: 'center' }, retry: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, backgroundColor: colors.surface2 }, retryText: { color: colors.blue, fontWeight: '800' } });
