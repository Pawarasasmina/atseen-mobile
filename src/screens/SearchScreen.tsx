import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { SeenDetailsScreen } from './SeenDetailsScreen';
import { api, resolveMediaUrl, WEB_BASE_URL } from '../services/api';
import type { SearchDefaults, SearchHit, SearchResults, SearchType } from '../services/searchTypes';
import type { Session, Seen } from '../types';
import { colors } from '../theme';

const tabs: [SearchType, string][] = [['all', 'Top'], ['people', 'People'], ['seens', 'Seens'], ['experiences', 'Experiences'], ['worlds', 'Worlds'], ['wall_notes', 'Wall']];

export function SearchScreen({ session, onClose }: { session: Session; onClose: () => void }) {
  const [draft, setDraft] = useState(''), [query, setQuery] = useState(''), [type, setType] = useState<SearchType>('all');
  const [defaults, setDefaults] = useState<SearchDefaults>({}), [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Seen | null>(null), [more, setMore] = useState(false);
  const version = useRef(0), moreLock = useRef(false);
  useEffect(() => { const timer = setTimeout(() => setQuery(draft.replace(/\s+/gu, ' ').trim().slice(0, 100)), 300); return () => clearTimeout(timer); }, [draft]);
  useEffect(() => {
    const current = ++version.current; setLoading(true); setError(''); setResults(null); setMore(false); moreLock.current = false;
    const task = query.length >= 2 ? api.search(query, type) : api.searchDefaults();
    task.then((data) => { if (current !== version.current) return; if (query.length >= 2) setResults(data as SearchResults); else setDefaults(data as SearchDefaults); })
      .catch((e) => { if (current === version.current) setError(e instanceof Error ? e.message : 'Search could not load.'); })
      .finally(() => { if (current === version.current) setLoading(false); });
    return () => { version.current++; };
  }, [query, type, retry]);
  useEffect(() => { if (selected) return; const listener = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; }); return () => listener.remove(); }, [onClose, selected]);
  const searchFor = (value: string, selectedType: SearchType = 'all') => { setDraft(value); setQuery(value.trim()); setType(selectedType); Keyboard.dismiss(); };
  const open = async (hit: SearchHit) => {
    Keyboard.dismiss();
    if (hit.type === 'seen' || hit.type === 'experience') { setSelected({ id: hit.id, kind: hit.type === 'seen' ? 'SEEN' : 'EXPERIENCE' }); return; }
    if (!hit.route?.startsWith('/')) return;
    try { await Linking.openURL(`${WEB_BASE_URL}${hit.route}`); } catch { Alert.alert('Could not open result', 'Please try again.'); }
  };
  const loadMore = async () => {
    if (!results?.nextCursor || moreLock.current) return;
    const current = version.current; moreLock.current = true; setMore(true); setError('');
    try { const next = await api.search(query, type, results.nextCursor); if (current === version.current) setResults((old) => ({ ...next, items: [...(old?.items || []), ...(next.items || [])].filter((item, index, all) => all.findIndex((other) => other.id === item.id && other.type === item.type) === index) })); }
    catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : 'Could not load more.'); }
    finally { if (current === version.current) { moreLock.current = false; setMore(false); } }
  };
  if (selected) return <SeenDetailsScreen session={session} initialSeen={selected} onClose={() => setSelected(null)} onFeedUpdate={() => {}} />;
  const people = defaults.sections?.people?.items || [];
  const sections = results?.sections ? tabs.filter(([key]) => key !== 'all').map(([key, label]) => ({ key, label, section: results.sections?.[key] })) : [{ key: type, label: tabs.find(([key]) => key === type)?.[1] || 'Results', section: results }];
  return <SafeAreaView style={s.safe}>
    <View style={s.header}><Pressable accessibilityLabel="Back to Seen" onPress={onClose} style={s.back}><Feather name="chevron-left" size={26} color={colors.text} /></Pressable><View style={s.field}><TextInput accessibilityLabel="Search people, Seens and Wall" placeholder="People, Seens, Wall" placeholderTextColor={colors.faint} value={draft} onChangeText={(value) => { setDraft(value); }} maxLength={100} returnKeyType="search" onSubmitEditing={() => searchFor(draft, type)} style={s.input} />{draft ? <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => searchFor('')}><Feather name="x" color={colors.muted} size={16} /></Pressable> : null}</View></View>
    {query.length >= 2 ? <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{tabs.map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: key === type }} onPress={() => setType(key)} style={[s.chip, key === type && s.selected]}><Text style={[s.chipText, key === type && { color: colors.blue }]}>{label}</Text></Pressable>)}</ScrollView></View> : null}
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}>
      {loading ? <ActivityIndicator color={colors.blue} style={s.loader} /> : null}
      {error ? <View style={s.notice}><Text style={s.muted}>{error}</Text><Pressable onPress={() => results?.nextCursor ? loadMore() : setRetry((n) => n + 1)}><Text style={s.link}>Try again</Text></Pressable></View> : null}
      {!loading && !error && query.length === 1 ? <Text style={s.muted}>Enter at least two characters to search.</Text> : null}
      {!loading && !error && !query ? <>
        <Text style={s.label}>PEOPLE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.people}>{people.map((person) => <Pressable accessibilityLabel={`Open ${person.title}`} key={person.id} onPress={() => open(person)} style={s.person}><Avatar ring size={60} user={{ name: person.title, avatar: person.image }} /><Text numberOfLines={1} style={s.name}>{person.title.split(' ')[0]}{person.verified ? ' ✓' : ''}</Text>{person.metadata?.orbitStatus ? <Text numberOfLines={1} style={s.status}>{person.metadata.orbitStatus}</Text> : null}</Pressable>)}</ScrollView>
        {!people.length ? <Text style={s.muted}>People will appear here as they join.</Text> : null}
        <Text style={s.label}>TRENDING</Text><View style={s.chips}>{defaults.trending?.slice(0, 6).map((trend) => <Pressable key={trend.label} style={s.chip} onPress={() => searchFor(trend.label)}><Text style={s.chipText}>{trend.label}</Text></Pressable>)}</View>
        <Text style={s.label}>RECENT</Text><View style={s.recent}>{defaults.recent?.map((item, index) => <Pressable key={item.id} onPress={() => searchFor(item.query, item.selectedType)}><Text style={s.muted}>{index ? ' · ' : ''}{item.query}</Text></Pressable>)}</View>{!defaults.recent?.length ? <Text style={s.muted}>Your searches will appear here.</Text> : null}
      </> : null}
      {!loading && query.length >= 2 ? sections.map(({ key, label, section }) => section?.items?.length ? <View key={key}><View style={s.sectionHeader}><Text style={s.label}>{label.toUpperCase()}</Text>{type === 'all' ? <Pressable onPress={() => setType(key as SearchType)}><Text style={s.link}>See all{section.total ? ` (${section.total})` : ''}</Text></Pressable> : null}</View>{section.items.map((hit) => <Pressable key={`${hit.type}:${hit.id}`} onPress={() => open(hit)} style={s.result}>{hit.type === 'person' ? <Avatar ring size={48} user={{ name: hit.title, avatar: hit.image }} /> : hit.image ? <Image source={{ uri: resolveMediaUrl(hit.image) }} style={s.thumb} /> : <Feather name={hit.type === 'post' ? 'message-square' : 'eye'} size={28} color={colors.blue} />}<View style={s.resultText}><Text style={s.title}>{hit.title}{hit.verified ? ' ✓' : ''}</Text><Text numberOfLines={1} style={s.muted}>{hit.subtitle}</Text>{hit.description ? <Text numberOfLines={2} style={s.description}>{hit.description}</Text> : null}</View><Feather name="chevron-right" size={16} color={colors.faint} /></Pressable>)}</View> : null) : null}
      {!loading && !error && results && !sections.some(({ section }) => section?.items?.length) ? <Text style={s.muted}>No results for “{query}”. Try another person or topic.</Text> : null}
      {results?.nextCursor ? <Pressable disabled={more} style={s.notice} onPress={loadMore}>{more ? <ActivityIndicator color={colors.blue} /> : <Text style={s.link}>Load more</Text>}</Pressable> : null}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0C0F' }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24 }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1B1E21', alignItems: 'center', justifyContent: 'center' }, field: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#59728C', backgroundColor: '#111419', borderRadius: 14, paddingHorizontal: 17 }, input: { flex: 1, minHeight: 48, color: colors.text, fontSize: 14 }, content: { paddingHorizontal: 22, paddingBottom: 32 }, label: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', color: colors.faint, marginTop: 8, marginBottom: 12 }, people: { gap: 14, paddingTop: 8, paddingBottom: 24 }, person: { width: 64, alignItems: 'center' }, name: { color: colors.muted, fontSize: 9, marginTop: 6 }, status: { color: colors.blue, fontSize: 9, fontWeight: '600', marginTop: 2 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 }, chip: { minHeight: 44, borderRadius: 25, borderWidth: 1, borderColor: colors.line, backgroundColor: '#111419', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }, chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' }, recent: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }, muted: { color: colors.faint, fontSize: 13, lineHeight: 20 }, tabs: { paddingHorizontal: 22, gap: 8, paddingBottom: 16 }, selected: { borderColor: colors.blue }, loader: { marginVertical: 40 }, notice: { paddingVertical: 20, gap: 12, alignItems: 'center' }, link: { color: colors.blue, fontSize: 12, fontWeight: '600' }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }, result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }, resultText: { flex: 1, gap: 3 }, title: { color: colors.text, fontWeight: '700', fontSize: 14 }, description: { color: colors.muted, fontSize: 12, lineHeight: 18 }, thumb: { width: 62, height: 78, borderRadius: 10, backgroundColor: colors.surface },
});
