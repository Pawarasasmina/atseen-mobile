import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors } from '../../theme';
import { api, resolveMediaUrl } from '../../services/api';
import type { Dream, PageInfo, ProfilePhoto, UnifiedProfile, User } from '../../types';
import { Avatar } from '../Avatar';
import { IconButton, ProfileImage } from './ProfilePrimitives';
import { userName } from '../../utils/format';

export function ProfileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <Modal transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.layer}><Pressable accessibilityLabel="Close sheet" onPress={onClose} style={s.scrim} /><View style={[s.sheet, { paddingBottom: Math.max(18, insets.bottom) }]}><View style={s.handle} /><View style={s.heading}><Text style={s.title}>{title}</Text><IconButton icon="x" label="Close" onPress={onClose} size={22} /></View>{children}</View></KeyboardAvoidingView></Modal>;
}
export function SheetRow({ title, detail, onPress, disabled = false }: { title: string; detail?: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={s.row}><View style={s.flex}><Text style={s.rowTitle}>{title}</Text>{detail ? <Text style={s.detail}>{detail}</Text> : null}</View><Text style={s.arrow}>›</Text></Pressable>;
}
export function ProfileForm({ kind, profile, dream, onClose, onSaved }: { kind: 'edit' | 'status' | 'dream' | 'direct'; profile: UnifiedProfile['profile']; dream?: Dream | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(profile.displayName || '');
  const [username, setUsername] = useState(profile.username || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [website, setWebsite] = useState(profile.socialLinks?.[0]?.url || '');
  const [label, setLabel] = useState(profile.activeStatus?.label || '');
  const [title, setTitle] = useState(dream?.title || '');
  const [reason, setReason] = useState(dream?.reason || '');
  const [goal, setGoal] = useState(dream?.goalStars || 900);
  const [enabled, setEnabled] = useState(Boolean(profile.directAccess?.enabled));
  const [price, setPrice] = useState(String(profile.directAccess?.priceStars || 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const run = async (clear = false) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (kind === 'edit') {
        const socialLinks = [...(profile.socialLinks || [])];
        if (profile.isCreator) {
          if (website.trim()) { const url = new URL(website.trim()); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an https:// or http:// website.'); socialLinks.splice(0, 1, { platform: socialLinks[0]?.platform || 'Website', url: url.toString() }); }
          else socialLinks.splice(0, 1);
        }
        await api.updateProfile({ displayName: name.trim(), username: username.trim(), bio: bio.trim(), ...(profile.isCreator ? { socialLinks } : {}) });
      } else if (kind === 'status') await api.updateProfileStatus(clear ? { clear: true } : { status: label.trim() });
      else if (kind === 'dream') await api.saveDream({ title: title.trim(), reason: reason.trim(), goalStars: goal, emoji: dream?.emoji || '✨', ...(dream?.status === 'ACTIVE' ? { version: dream.version } : {}) });
      else {
        const priceStars = Number(price);
        if (!Number.isSafeInteger(priceStars) || priceStars < 10 || priceStars > 10000) throw new Error('Use a whole coin price between 10 and 10,000.');
        // Preserve settings outside this form, including the away-call preference.
        const offer = await api.getDirectAccessOffer(String(profile.ownerUserId));
        await api.updateDirectAccess({ enabled, priceStars, callEnabled: Boolean(offer.callEnabled), callPriceStars: offer.callPriceStars || 500, callDurationMinutes: offer.callDurationMinutes || 5, callAutoDeclineAway: Boolean(offer.callAutoDeclineAway) });
      }
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please retry.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const field = (caption: string, value: string, change: (value: string) => void, multiline = false, maxLength = 120) => <View><Text style={s.label}>{caption}</Text><TextInput accessibilityLabel={caption} editable={!busy} value={value} onChangeText={change} maxLength={maxLength} multiline={multiline} autoCapitalize={caption === 'Username' || caption === 'Website' ? 'none' : 'sentences'} style={[s.input, multiline && s.multiline]} placeholderTextColor={colors.faint} /></View>;
  return <ProfileSheet title={{ edit: 'Edit profile', status: 'Right now…', dream: 'Dream', direct: 'Direct Access' }[kind]} onClose={() => { if (!busy) onClose(); }}><ScrollView keyboardShouldPersistTaps="handled">
    {kind === 'edit' ? <>{field('Display name', name, setName, false, 50)}{field('Username', username, setUsername, false, 30)}{field('Biography', bio, setBio, true, profile.isCreator ? 1000 : 300)}{profile.isCreator ? field('Website', website, setWebsite, false, 500) : null}</> : kind === 'status' ? field('Current status', label, setLabel, false, 120) : kind === 'dream' ? <>{field('Title', title, setTitle, false, 40)}{field('Why it matters', reason, setReason, true)}<Text style={s.label}>Goal in coins</Text><View style={s.goals}>{[500, 900, 1500, 2500, 5000].map((n) => <Pressable disabled={busy} key={n} accessibilityState={{ selected: goal === n }} onPress={() => setGoal(n)} style={[s.goal, goal === n && s.selected]}><Text style={s.goalText}>{n}</Text></Pressable>)}</View></> : <><View style={s.row}><Text style={s.rowTitle}>Offer Direct Access</Text><Switch disabled={busy} value={enabled} onValueChange={setEnabled} trackColor={{ true: colors.blue }} /></View><Text style={s.detail}>A guaranteed reply within 48 hours. Existing windows remain active.</Text>{field('Price in coins (10–10,000)', price, setPrice, false, 5)}</>}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<Pressable accessibilityRole="button" disabled={busy} onPress={() => run()} style={[s.save, busy && s.disabled]}>{busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.saveText}>Save</Text>}</Pressable>{kind === 'status' ? <Pressable disabled={busy} onPress={() => run(true)} style={s.clear}><Text style={s.detail}>Clear current status</Text></Pressable> : null}
  </ScrollView></ProfileSheet>;
}
export function ConnectionsSheet({ type, onClose, onOpen }: { type: string; onClose: () => void; onOpen: (user: User) => void }) {
  const [items, setItems] = useState<User[]>([]), [paging, setPaging] = useState<PageInfo | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const load = async (page = 1) => { if (locked.current) return; locked.current = true; setBusy(true); setError(''); try { const result = await api.getProfileConnections(type, page); setItems((old) => page === 1 ? result.accounts : [...old, ...result.accounts]); setPaging(result.pagination); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load connections.'); } finally { locked.current = false; setBusy(false); } };
  useEffect(() => { load(); }, [type]);
  return <ProfileSheet title={type === 'seen-by' ? 'Seen by' : type === 'followers' ? 'Followers' : 'Following'} onClose={onClose}>{error ? <SheetRow title={error} detail="Tap to retry" onPress={() => load(paging ? paging.page + 1 : 1)} /> : null}<FlatList data={items} keyExtractor={(u) => String(u.id || u._id)} style={s.list} renderItem={({ item }) => <Pressable onPress={() => onOpen(item)} style={s.person}><Avatar size={38} user={item} /><View style={s.flex}><Text style={s.rowTitle}>{userName(item)}</Text><Text style={s.detail}>@{item.username}</Text></View></Pressable>} onEndReached={() => { if (paging?.hasMore && !error) load(paging.page + 1); }} ListEmptyComponent={!busy && !error ? <Text style={s.empty}>No accounts yet.</Text> : null} ListFooterComponent={busy ? <ActivityIndicator color={colors.blue} style={s.clear} /> : null} /></ProfileSheet>;
}
function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(resolveMediaUrl(uri), (value) => { value.play(); });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  return <View style={s.videoWrap}><VideoView contentFit="contain" player={player} style={StyleSheet.absoluteFill} nativeControls fullscreenOptions={{ enable: true }} />{status === 'loading' ? <ActivityIndicator color={colors.blue} /> : status === 'error' ? <Text style={s.error}>This video could not play.</Text> : null}</View>;
}
export function ProfileMediaViewer({ items, initialIndex, onClose }: { items: ProfilePhoto[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index];
  if (!item) return null;
  const video = /video/i.test(item.mediaType || item.type || '');
  return <Modal animationType="fade" onRequestClose={onClose}><SafeAreaView style={s.viewer}><View style={s.viewerHead}><Text style={s.detail}>{index + 1} / {items.length}</Text><IconButton label="Close media" icon="x" onPress={onClose} size={24} /></View>{video ? <VideoPlayer key={item.id || item.mediaUrl} uri={item.mediaUrl || item.url || ''} /> : <ProfileImage contain uri={item.mediaUrl || item.url} style={s.fullImage} />}{item.caption ? <Text style={s.caption}>{item.caption}</Text> : null}<View style={s.controls}><IconButton label="Previous media" icon="chevron-left" onPress={() => setIndex(index - 1)} disabled={index === 0} size={28} /><IconButton label="Next media" icon="chevron-right" onPress={() => setIndex(index + 1)} disabled={index === items.length - 1} size={28} /></View></SafeAreaView></Modal>;
}
export const sheetStyles = StyleSheet.create({ text: { color: colors.muted, fontSize: 12, lineHeight: 18 }, error: { color: colors.danger, fontSize: 12, marginVertical: 10 }, list: { maxHeight: 440 }, empty: { color: colors.faint, paddingVertical: 25, textAlign: 'center' }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }, copy: { flex: 1 }, title: { color: colors.text, fontSize: 13, fontWeight: '600' }, detail: { color: colors.faint, fontSize: 11, marginTop: 4 } });
const s = StyleSheet.create({ layer: { flex: 1, justifyContent: 'flex-end' }, scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.65)' }, sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 }, handle: { width: 34, height: 4, backgroundColor: colors.faint, borderRadius: 2, alignSelf: 'center', marginBottom: 15 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, title: { color: colors.text, fontSize: 18, fontWeight: '700' }, flex: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 11 }, rowTitle: { color: colors.text, fontSize: 13, fontWeight: '600' }, detail: { color: colors.faint, fontSize: 11, lineHeight: 17 }, arrow: { color: colors.faint, fontSize: 18 }, label: { color: colors.muted, fontSize: 12, marginTop: 12, marginBottom: 7 }, input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: 12, minHeight: 44, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, multiline: { minHeight: 85, textAlignVertical: 'top' }, save: { minHeight: 44, marginTop: 18, borderRadius: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, saveText: { color: colors.bg, fontSize: 13, fontWeight: '700' }, clear: { paddingVertical: 16, alignItems: 'center' }, disabled: { opacity: .5 }, error: { color: colors.danger, fontSize: 12, marginTop: 10 }, goals: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' }, goal: { paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 20 }, selected: { borderColor: colors.blue, backgroundColor: 'rgba(156,203,255,.1)' }, goalText: { color: colors.text, fontSize: 12 }, list: { maxHeight: 450 }, person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }, empty: { color: colors.faint, textAlign: 'center', padding: 24 }, viewer: { flex: 1, backgroundColor: colors.bg }, viewerHead: { padding: 20, flexDirection: 'row', justifyContent: 'space-between' }, fullImage: { flex: 1, backgroundColor: colors.bg }, videoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' }, caption: { color: colors.muted, textAlign: 'center', padding: 20, fontSize: 13 }, controls: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20 } });
