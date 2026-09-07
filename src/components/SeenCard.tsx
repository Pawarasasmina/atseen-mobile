import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { api } from '../services/api';
import { EngagementSheet, reactions } from './EngagementSheet';
import { ShareSheet } from './ShareSheet';
import type { Engagement, Seen } from '../types';

const compact = (value = 0) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);

export function SeenCard({ accessToken, item }: { accessToken: string; item: Seen }) {
  const cover = item.coverMedia?.secureUrl;
  const chapters = item.chapters?.length || 0;
  const id = String(item.id || item._id || '');
  const [engagement, setEngagement] = useState<Engagement>(item.engagement || {});
  const [sheet, setSheet] = useState<'comments' | 'reactions' | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const run = async (name: string, action: () => Promise<{ engagement: Engagement }>) => { if (pending) return; setPending(name); setNotice(''); try { setEngagement((await action()).engagement); } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Could not update Seen'); } finally { setPending(''); } };
  const reactionIcons = (engagement.topReactions?.length ? engagement.topReactions : ['LIKE', 'LOVE', 'FIRE']).slice(0, 3).map((key) => reactions.find((item) => item.key === key)?.icon || '🔥').join(' ');
  return <View style={styles.card}>
    <View style={styles.creator}>
      {item.creator?.avatar ? <Image source={{ uri: item.creator.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initial}>{item.creator?.name?.[0] || '?'}</Text></View>}
      <View style={styles.creatorCopy}><View style={styles.nameRow}><Text style={styles.name}>{item.creator?.name || item.creator?.username || 'Creator'}</Text>{item.creator?.verified ? <Ionicons name="checkmark-circle" color={colors.blue} size={15} /> : null}</View><Text style={styles.location}>{item.creator?.location || 'Somewhere real'}</Text></View>
      <Ionicons name="ellipsis-horizontal" color={colors.muted} size={18} />
    </View>
    <View style={styles.cover}>
      {cover ? <Image resizeMode="cover" source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : <LinearGradient colors={['#27313F', '#11151B', '#080A0D']} style={StyleSheet.absoluteFill} />}
      <LinearGradient colors={['transparent', 'rgba(10,12,15,0.95)']} style={StyleSheet.absoluteFill} />
      {item.coverMedia?.mediaType === 'VIDEO' ? <View style={styles.duration}><Ionicons name="play" color="#fff" size={10} /><Text style={styles.durationText}>video</Text></View> : null}
      <View style={styles.titleWrap}><Text numberOfLines={2} style={styles.title}>{item.title || 'Untitled Seen'}</Text><Text style={styles.chapterCount}>{chapters} {chapters === 1 ? 'chapter' : 'chapters'}</Text></View>
    </View>
    <View style={styles.body}><Text style={styles.summary}>{item.summary || item.description || 'Step inside this Seen.'}</Text>{chapters ? <Pressable style={styles.chapter}><Text style={styles.chapterNumber}>01</Text><Text style={styles.chapterTitle}>Open first chapter</Text><Text style={styles.open}>Open ›</Text></Pressable> : null}</View>
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <View style={styles.actions}>
      <Pressable disabled={Boolean(pending)} onPress={() => setSheet('reactions')} style={styles.action}><Text style={styles.reactionIcons}>{reactionIcons}</Text><Text style={[styles.stat, engagement.viewerReaction && styles.active]}>{compact(engagement.reactionCount)}</Text></Pressable>
      <Pressable onPress={() => setSheet('comments')} style={styles.action}><Ionicons name="chatbubble-outline" color={colors.faint} size={19} /><Text style={styles.stat}>{compact(engagement.commentCount)}</Text></Pressable>
      <Pressable disabled={Boolean(pending)} onPress={() => run('share', () => api.toggleSeenShare(id, Boolean(engagement.viewerShared), accessToken))} style={styles.action}><Ionicons name="repeat" color={engagement.viewerShared ? colors.blue : colors.faint} size={20} /><Text style={[styles.stat, engagement.viewerShared && styles.active]}>{compact(engagement.shareCount)}</Text></Pressable>
      <View style={styles.action}><Ionicons name="eye-outline" color={colors.faint} size={19} /><Text style={styles.stat}>{compact(engagement.viewCount)}</Text></View>
      <View style={styles.spacer} />
      <Pressable disabled={Boolean(pending)} onPress={() => run('save', () => api.toggleSeenSave(id, accessToken))}>{pending === 'save' ? <ActivityIndicator color={colors.blue} size="small" /> : <Ionicons name={engagement.viewerSaved ? 'bookmark' : 'bookmark-outline'} color={engagement.viewerSaved ? colors.blue : colors.muted} size={21} />}</Pressable>
      <Pressable accessibilityLabel="Share this Seen" onPress={() => setShareOpen(true)}><Ionicons name="paper-plane-outline" color={colors.muted} size={21} /></Pressable>
    </View>
    <EngagementSheet accessToken={accessToken} engagement={engagement} id={id} mode={sheet} onClose={() => setSheet(null)} onUpdate={setEngagement} />
    <ShareSheet accessToken={accessToken} item={item} onClose={() => setShareOpen(false)} visible={shareOpen} />
  </View>;
}

const styles = StyleSheet.create({ card: { borderBottomWidth: 7, borderBottomColor: '#07090C', backgroundColor: colors.bg }, creator: { height: 66, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.blue }, avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 }, initial: { color: colors.blue, fontWeight: '900' }, creatorCopy: { flex: 1 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, name: { color: colors.text, fontSize: 14, fontWeight: '800' }, location: { marginTop: 3, color: colors.faint, fontSize: 10 }, cover: { height: 242, justifyContent: 'flex-end' }, duration: { position: 'absolute', right: 12, top: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,.65)', paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', gap: 3 }, durationText: { color: '#fff', fontSize: 10, fontWeight: '800' }, titleWrap: { padding: 17 }, title: { color: colors.text, fontSize: 23, lineHeight: 27, fontWeight: '900', letterSpacing: -0.6 }, chapterCount: { color: colors.faint, fontSize: 11, marginTop: 5 }, body: { padding: 18, gap: 14 }, summary: { color: 'rgba(255,255,255,.88)', fontSize: 14, lineHeight: 22 }, chapter: { height: 46, flexDirection: 'row', alignItems: 'center', borderColor: 'rgba(156,203,255,.20)', borderWidth: 1, borderRadius: 14, paddingHorizontal: 13 }, chapterNumber: { color: colors.faint, fontSize: 12, fontWeight: '900', marginRight: 10 }, chapterTitle: { color: colors.text, fontSize: 12, fontWeight: '800', flex: 1 }, open: { color: colors.blue, fontSize: 11, fontWeight: '800' }, notice: { color: colors.danger, paddingHorizontal: 18, paddingBottom: 7, fontSize: 11 }, actions: { height: 53, paddingHorizontal: 16, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 15 }, action: { flexDirection: 'row', alignItems: 'center', gap: 4 }, reactionIcons: { fontSize: 12 }, spacer: { flex: 1 }, stat: { color: colors.faint, fontSize: 11 }, active: { color: colors.blue } });
