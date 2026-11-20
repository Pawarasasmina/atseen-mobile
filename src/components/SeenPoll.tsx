import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { colors } from '../theme';
import type { SeenBlock } from '../types';

export function SeenPoll({ id, chapterId, block, active, accessToken }: { id: string; chapterId: string; block: SeenBlock; active: boolean; accessToken: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.getSeenPoll>> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const locked = useRef(false);
  useEffect(() => {
    if (!active || !block.id || !chapterId) return;
    let alive = true;
    api.getSeenPoll(id, chapterId, block.id, accessToken).then((data) => { if (alive) { setResult(data); setError(''); } }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : 'Could not load poll.'); });
    return () => { alive = false; };
  }, [active, id, chapterId, block.id, accessToken, retry]);
  const vote = async (index: number) => {
    if (locked.current || !block.id) return;
    locked.current = true; setBusy(true); setError('');
    try { setResult(await api.voteSeenPoll(id, chapterId, block.id, index, accessToken)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save vote.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const options = Array.isArray(block.metadata?.options) ? block.metadata.options : [];
  return <View style={s.poll}><Text style={s.question}>{String(block.metadata?.question || block.text || 'Your choice')}</Text>{options.map((option, index) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: result?.viewerChoice === index, disabled: busy }} disabled={busy || !result} key={index} onPress={() => vote(index)} style={[s.option, result?.viewerChoice === index && s.selected]}><Text style={s.label}>{String(option)}</Text>{result?.viewerChoice === index ? <Ionicons name="checkmark-circle" size={17} color={colors.blue} /> : null}{result?.resultsVisible && result.counts ? <Text style={s.count}>{result.totalVotes ? Math.round((result.counts[index] || 0) / result.totalVotes * 100) : 0}%</Text> : null}</Pressable>)}{busy ? <ActivityIndicator color={colors.blue} /> : error ? <Pressable onPress={() => setRetry(retry + 1)}><Text style={s.error}>{error} Tap to retry.</Text></Pressable> : <Text style={s.meta}>{result?.resultsVisible ? `${result.totalVotes || 0} votes` : 'Results are private to the creator'}</Text>}</View>;
}
const s = StyleSheet.create({ poll: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 15, marginBottom: 17, gap: 10 }, question: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 23, marginBottom: 5 }, option: { padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }, selected: { borderColor: colors.blue, backgroundColor: 'rgba(156,203,255,.1)' }, label: { color: colors.text, fontSize: 14, flex: 1 }, count: { color: colors.blue, fontSize: 12 }, meta: { color: colors.faint, fontSize: 11 }, error: { color: colors.danger, fontSize: 12 } });
