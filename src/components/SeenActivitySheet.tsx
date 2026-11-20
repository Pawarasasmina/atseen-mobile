import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { colors } from '../theme';
import { relativeTime } from '../utils/format';

type Activity = Awaited<ReturnType<typeof api.getSeenActivity>>['items'][number];
export function SeenActivitySheet({ accessToken, visible, onClose, onOpenSeen }: { accessToken: string; visible: boolean; onClose: () => void; onOpenSeen: (id: string) => void }) {
  const [items, setItems] = useState<Activity[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let alive = true; setLoading(true); setError('');
    api.getSeenActivity(accessToken).then((result) => { if (alive) setItems(result.items || []); }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : 'Could not load activity.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, accessToken, retry]);
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}><View style={s.overlay}><Pressable accessibilityLabel="Close activity" style={StyleSheet.absoluteFill} onPress={onClose} /><View style={s.sheet}><View style={s.heading}><Text style={s.title}>Activity</Text><Pressable accessibilityLabel="Close activity" hitSlop={12} onPress={onClose}><Ionicons name="close" size={24} color={colors.muted} /></Pressable></View>{loading ? <ActivityIndicator color={colors.blue} style={s.loading} /> : error ? <Pressable onPress={() => setRetry(retry + 1)} style={s.loading}><Text style={s.text}>{error}</Text><Text style={s.link}>Try again</Text></Pressable> : <FlatList data={items} keyExtractor={(item) => item.id} ListEmptyComponent={<Text style={[s.text, s.loading]}>No activity yet.</Text>} renderItem={({ item }) => <Pressable disabled={!item.target?.id || item.target.type?.toUpperCase() !== 'SEEN'} onPress={() => onOpenSeen(item.target!.id!)} style={s.row}><Ionicons name="sparkles-outline" size={18} color={colors.blue} /><View style={s.copy}><Text style={s.text}>{item.title || item.description}</Text>{item.preview ? <Text numberOfLines={2} style={s.preview}>{item.preview}</Text> : null}<Text style={s.time}>{relativeTime(item.createdAt)}</Text></View></Pressable>} />}</View></View></Modal>;
}
const s = StyleSheet.create({ overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)', justifyContent: 'flex-end' }, sheet: { height: '75%', padding: 22, paddingBottom: 35, backgroundColor: colors.surface, borderTopLeftRadius: 25, borderTopRightRadius: 25 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 20 }, title: { color: colors.text, fontSize: 21, fontWeight: '800' }, row: { flexDirection: 'row', gap: 12, paddingVertical: 17, borderTopWidth: 1, borderTopColor: colors.line }, copy: { flex: 1 }, text: { color: colors.text, fontSize: 13, lineHeight: 20 }, preview: { color: colors.muted, fontSize: 12, marginTop: 5 }, time: { color: colors.faint, fontSize: 10, marginTop: 6 }, loading: { paddingVertical: 40, textAlign: 'center' }, link: { color: colors.blue, marginTop: 10 } });
