import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { api, resolveMediaUrl, WEB_BASE_URL } from '../services/api';
import { saveOwnSeenOffline } from '../services/seenOffline';
import { seenMenuActions } from '../utils/seenMenu';
import { seenId } from '../utils/seenPresentation';
import { compact, relativeTime } from '../utils/format';
import { colors } from '../theme';
import type { Engagement, Seen } from '../types';

type Props = { visible: boolean; item: Seen; own: boolean; accessToken: string; engagement: Engagement; onClose: () => void; onShare: () => void; onChange: (item: Seen) => void; onEngagement: (engagement: Engagement) => void; onRemoved: (creatorId?: string) => void };
type Panel = 'menu' | 'insights' | 'series' | 'report' | 'story';
const reportReasons = ['SPAM', 'FALSE_INFORMATION', 'HARASSMENT', 'HATE', 'NUDITY', 'VIOLENCE', 'SELF_HARM', 'ILLEGAL_CONTENT', 'COPYRIGHT', 'SCAM', 'IMPERSONATION', 'CHILD_SAFETY', 'OTHER'];

function MenuIcon({ icon, color }: { icon: string; color: string }) {
  if (icon === 'map-pin') return <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 17v5M5 9l7-7 7 7-2 1v4l2 3H5l2-3v-4z" /></Svg>;
  if (icon === 'plus-circle') return <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round"><Circle cx={12} cy={12} r={9} strokeDasharray="4 3" /><Path d="M12 8.5v7M8.5 12h7" /></Svg>;
  if (icon === 'eye') return <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}><Path d="M2 12C5.3 7.8 18.7 7.8 22 12 18.7 16.2 5.3 16.2 2 12z" /><Circle cx={12} cy={12} r={2.6} fill={color} stroke="none" /></Svg>;
  return <Feather name={icon as keyof typeof Feather.glyphMap} size={15} color={color} />;
}

export function SeenOptionsSheet({ visible, item, own, accessToken, engagement, onClose, onShare, onChange, onEngagement, onRemoved }: Props) {
  const insets = useSafeAreaInsets();
  const [record, setRecord] = useState(item), [panel, setPanel] = useState<Panel>('menu');
  const [pending, setPending] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<{ id: string; name: string }[]>([]), [name, setName] = useState(''), [reason, setReason] = useState('');
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof api.getSeenInsights>>['insights'] | null>(null);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const editorOpened = useRef(false);
  const shareAfterDismiss = useRef(false);
  const id = seenId(item);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !editorOpened.current) return;
      editorOpened.current = false;
      api.getSeen(id, accessToken).then(({ publication }) => onChange(publication)).catch(() => {});
    });
    return () => subscription.remove();
  }, [id, accessToken, onChange]);
  useEffect(() => {
    if (!visible) return;
    let alive = true; setRecord(item); setPanel('menu'); setError(''); setMessage(''); setReason(''); setName('');
    if (own) {
      setLoading(true);
      api.getMyPublication(id, accessToken).then(({ publication }) => { if (alive) setRecord((old) => ({ ...old, ...publication })); }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load owner actions.'); }).finally(() => { if (alive) setLoading(false); });
    } else setLoading(false);
    return () => { alive = false; };
  }, [visible, id, own, accessToken]);
  useEffect(() => {
    if (!visible || !own || (panel !== 'insights' && panel !== 'series')) return;
    let alive = true; setLoading(true); setError('');
    const work = panel === 'insights' ? api.getSeenInsights(id, accessToken).then((data) => { if (alive) setInsights(data.insights); }) : api.listSeenSeries(accessToken).then((data) => { if (alive) setSeries(data.items); });
    work.catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load this section.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, panel, own, id, accessToken, retry]);
  const run = async (key: string, action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true; setPending(key); setError(''); setMessage('');
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete this action.'); }
    finally { busy.current = false; setPending(''); }
  };
  const change = (next: Seen) => { setRecord((old) => ({ ...old, ...next })); onChange(next); };
  const version = () => { if (!Number.isSafeInteger(record.statusVersion)) throw new Error('Close and reopen this menu to refresh the Seen.'); return record.statusVersion!; };
  const remove = (key: 'archive' | 'delete') => Alert.alert(key === 'archive' ? 'Archive this Seen?' : 'Delete this Seen?', key === 'archive' ? 'It will be hidden from your profile. Your stats stay.' : 'This removes the Seen for everyone. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' }, { text: key === 'archive' ? 'Archive' : 'Delete', style: key === 'delete' ? 'destructive' : 'default', onPress: () => run(key, async () => { if (key === 'archive') await api.archiveSeen(id, version(), accessToken); else await api.deleteSeen(id, version(), accessToken); onClose(); onRemoved(); }) },
  ]);
  const addToSeries = (seriesId: string) => run('series', async () => { const result = await api.addSeenToSeries(seriesId, id, accessToken); change(result.publication); setPanel('menu'); setMessage('Added to series.'); });
  const act = (key: string) => {
    if (busy.current || loading) return;
    if (key === 'share') { shareAfterDismiss.current = Platform.OS === 'ios'; onClose(); if (Platform.OS !== 'ios') onShare(); return; }
    if (['story', 'insights', 'series', 'report'].includes(key)) { setError(''); setMessage(''); setPanel(key as Panel); return; }
    if (key === 'archive' || key === 'delete') { remove(key); return; }
    if (key === 'block') { Alert.alert(`Block ${record.creator?.name || record.creator?.username || 'creator'}?`, 'Their content will be removed from your feed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: () => run('block', async () => { await api.blockSeenCreator(id, accessToken); onClose(); onRemoved(String(record.creator?.id || record.creator?._id || '')); }) }]); return; }
    run(key, async () => {
      if (key === 'save') { const result = await api.toggleSeenSave(id, accessToken); onEngagement(result.engagement); setMessage(result.engagement.viewerSaved ? 'Saved to library.' : 'Removed from library.'); }
      if (key === 'more') { const result = await api.reactToSeen(id, 'ADMIRE', accessToken); onEngagement(result.engagement); setMessage('Thanks — we will show you more Seens like this.'); }
      if (key === 'hide') { await api.hideSeen(id, accessToken); onClose(); onRemoved(); }
      if (key === 'pin') { const result = await api.pinSeen(id, !record.isPinned, version(), accessToken); change(result.publication); setMessage(record.isPinned ? 'Unpinned.' : 'Pinned to profile.'); }
      if (key === 'offline') { await saveOwnSeenOffline(record); setMessage('Offline PDF saved. You can also save a copy to Files from the share sheet.'); }
      if (key === 'edit' || key === 'cover') { editorOpened.current = true; await Linking.openURL(`${WEB_BASE_URL}/studio/seens/${encodeURIComponent(id)}/edit?from=seen${key === 'cover' ? '&focus=cover' : ''}`); onClose(); }
    });
  };
  const metadata = ['Seen', `${record.chapters?.length || 0} chapters`, relativeTime(record.publishedAt || record.createdAt), record.series?.name].filter(Boolean).join(' · ');
  const actions = seenMenuActions(record, own, Boolean(engagement.viewerSaved));
  const close = () => { if (!busy.current) onClose(); };
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={close} onDismiss={() => { if (shareAfterDismiss.current) { shareAfterDismiss.current = false; onShare(); } }} statusBarTranslucent>
    <View style={s.overlay}><Pressable accessibilityLabel="Close Seen options" onPress={close} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View style={s.handle} />
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {panel !== 'menu' ? <Pressable accessibilityLabel="Back to Seen options" onPress={() => { if (!busy.current) { setPanel('menu'); setError(''); setMessage(''); } }} style={s.back}><Feather name="chevron-left" size={19} color={colors.muted} /><Text style={s.backText}>Seen options</Text></Pressable> : null}
        <Text style={[s.title, own && panel === 'menu' && s.ownerTitle]}>{panel === 'menu' ? record.title || 'Untitled Seen' : ({ insights: 'Insights', series: 'Series', report: 'Report Seen', story: 'Add to your story' })[panel]}</Text>
        {own && panel === 'menu' ? <Text style={s.meta}>{metadata}</Text> : null}
        {loading ? <ActivityIndicator style={s.loader} color={colors.blue} /> : null}
        {error ? <Pressable onPress={() => setRetry(retry + 1)}><Text accessibilityRole="alert" style={s.error}>{error}{panel === 'series' || panel === 'insights' ? ' Tap to retry.' : ''}</Text></Pressable> : null}
        {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
        {panel === 'menu' ? <View style={s.rows}>{actions.map((action, index) => <Pressable key={action.key} accessibilityRole="button" disabled={Boolean(pending) || loading} onPress={() => act(action.key)} style={[s.row, index === actions.length - 1 && { borderBottomWidth: 0 }, Boolean(pending) && s.disabled]}><View style={s.icon}>{pending === action.key ? <ActivityIndicator size="small" color={colors.blue} /> : <MenuIcon icon={action.icon} color={action.danger ? '#FF8A8A' : action.key === 'more' ? colors.blue : colors.muted} />}</View><View style={s.rowCopy}><Text style={[s.rowTitle, action.danger && s.danger]}>{action.title}</Text>{action.subtitle ? <Text style={s.subtitle}>{action.subtitle}</Text> : null}</View></Pressable>)}</View> : null}
        {panel === 'story' ? <View style={s.section}>{record.coverMedia?.secureUrl || record.coverMedia?.url ? <Image source={{ uri: resolveMediaUrl(record.coverMedia.secureUrl || record.coverMedia.url || '') }} style={s.storyImage} /> : null}<Text style={s.rowTitle}>{record.title}</Text><Text style={s.subtitle}>Share this Seen to your story for everyone who can view it.</Text><Pressable disabled={Boolean(pending)} style={s.primary} onPress={() => run('story', async () => { await api.shareSeenAsStory(id, accessToken); setPanel('menu'); setMessage('Added to your story.'); })}>{pending ? <ActivityIndicator color={colors.bg} /> : <Text style={s.primaryText}>Share to your story</Text>}</Pressable></View> : null}
        {panel === 'series' && !loading ? <View style={s.section}><Text style={s.subtitle}>One tap — the Seen joins the series</Text><View style={s.chips}>{series.map((entry) => <Pressable disabled={Boolean(pending)} key={entry.id} onPress={() => addToSeries(entry.id)} style={[s.chip, record.series?.id === entry.id && s.chosen]}><Text style={s.rowTitle}>{entry.name}</Text></Pressable>)}</View><View style={s.newSeries}><TextInput accessibilityLabel="New series name" maxLength={24} placeholder="New series…" placeholderTextColor={colors.faint} value={name} onChangeText={setName} style={s.input} /><Pressable accessibilityLabel="Create series and add Seen" disabled={Boolean(pending) || !name.trim()} style={s.chip} onPress={() => run('series', async () => { const result = await api.createSeenSeries(name.trim(), accessToken); setSeries((old) => [...old, result.series]); setName(''); const added = await api.addSeenToSeries(result.series.id, id, accessToken); change(added.publication); setName(''); setPanel('menu'); setMessage('Added to series.'); })}><Feather name="plus" color={colors.blue} size={20} /></Pressable></View>{record.series?.id ? <Pressable disabled={Boolean(pending)} style={s.row} onPress={() => run('series', async () => { const result = await api.removeSeenFromSeries(record.series!.id!, id, accessToken); change(result.publication); setPanel('menu'); setMessage('Removed from series.'); })}><Text style={s.subtitle}>Remove from series</Text></Pressable> : null}</View> : null}
        {panel === 'report' ? <View style={s.section}><Text style={s.subtitle}>Choose a reason. Every report is reviewed.</Text>{reportReasons.map((entry) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: reason === entry }} key={entry} disabled={Boolean(pending)} onPress={() => setReason(entry)} style={s.row}><Feather name={reason === entry ? 'check-circle' : 'circle'} color={reason === entry ? colors.blue : colors.faint} size={17} /><Text style={s.rowTitle}>{entry.toLowerCase().replaceAll('_', ' ')}</Text></Pressable>)}<Pressable disabled={!reason || Boolean(pending)} style={s.primary} onPress={() => run('report', async () => { await api.reportSeen(id, reason, accessToken); setPanel('menu'); setMessage('Report submitted. Thank you.'); })}>{pending ? <ActivityIndicator color={colors.bg} /> : <Text style={s.primaryText}>Submit report</Text>}</Pressable></View> : null}
        {panel === 'insights' && !loading && insights ? <View style={s.section}><Text style={s.subtitle}>{record.title}</Text><Text style={s.total}>{compact(insights.totalViews)}</Text><Text style={s.subtitle}>views · {compact(insights.todayViews)} today</Text><View accessibilityLabel="Views over the last seven days" style={s.chart}>{Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - 6 + index); const key = date.toISOString().slice(0, 10); const count = insights.dailyViews?.find((row) => (row._id || row.date) === key)?.value || 0; const max = Math.max(1, ...(insights.dailyViews || []).map((row) => row.value || 0)); return <View key={key} style={s.barColumn}><Text style={s.meta}>{count}</Text><View style={[s.bar, { height: Math.max(4, count / max * 80) }]} /></View>; })}</View><Text style={s.subtitle}>Read to the end: {insights.readToEndPercent == null ? 'Not available' : `${insights.readToEndPercent}%`}</Text><View style={s.metrics}>{[['Reactions', insights.reactions], ['Saves', insights.saves], ['Shares', insights.shares], ['Comments', insights.comments]].map(([label, count]) => <View key={label} style={s.metric}><Text style={s.rowTitle}>{compact(Number(count))}</Text><Text style={s.meta}>{label}</Text></View>)}</View><Text style={s.rowTitle}>Where they came from</Text>{insights.trafficSources?.map((source) => <View key={source.source} style={s.source}><Text style={s.subtitle}>{source.source}</Text><Text style={s.rowTitle}>{source.percent}%</Text></View>)}<Text style={s.meta}>Only you see this</Text></View> : null}
      </ScrollView>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.65)' }, sheet: { maxHeight: '92%', backgroundColor: '#0C1014', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20 }, handle: { width: 36, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.3)', alignSelf: 'center', marginTop: 13, marginBottom: 26 }, title: { color: colors.text, fontWeight: '800', fontSize: 22, lineHeight: 28, letterSpacing: -.5, marginBottom: 12 }, ownerTitle: { fontSize: 13.5, lineHeight: 18, letterSpacing: 0, marginBottom: 2 }, meta: { color: colors.faint, fontSize: 10, lineHeight: 15 }, rows: { marginTop: 10 }, row: { minHeight: 46, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.06)', flexDirection: 'row', alignItems: 'center', gap: 14 }, icon: { width: 28, alignItems: 'center' }, rowCopy: { flex: 1 }, rowTitle: { color: colors.text, fontSize: 13.5, fontWeight: '600', lineHeight: 20 }, subtitle: { color: colors.faint, fontSize: 12, lineHeight: 18, marginTop: 4 }, danger: { color: '#FF8A8A' }, disabled: { opacity: .55 }, loader: { padding: 16 }, error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginVertical: 10 }, message: { color: colors.blue, fontSize: 12, lineHeight: 18, marginVertical: 10 }, back: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 18 }, backText: { color: colors.muted, fontSize: 12 }, section: { paddingVertical: 15, gap: 12 }, primary: { backgroundColor: colors.blue, borderRadius: 99, alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingHorizontal: 18, marginTop: 12 }, primaryText: { color: colors.bg, fontSize: 14, fontWeight: '800' }, chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 }, chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,.05)', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10 }, chosen: { borderColor: colors.blue, backgroundColor: 'rgba(156,203,255,.15)' }, newSeries: { flexDirection: 'row', gap: 8 }, input: { flex: 1, borderRadius: 99, borderWidth: 1, borderColor: colors.line, color: colors.text, fontSize: 13, paddingHorizontal: 14, paddingVertical: 10 }, storyImage: { width: '100%', height: 200, borderRadius: 14 }, total: { color: colors.text, fontSize: 50, fontWeight: '800' }, chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 12 }, barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5 }, bar: { width: '100%', backgroundColor: colors.blue, borderRadius: 4 }, metrics: { flexDirection: 'row', paddingVertical: 15 }, metric: { flex: 1, alignItems: 'center', gap: 4 }, source: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
