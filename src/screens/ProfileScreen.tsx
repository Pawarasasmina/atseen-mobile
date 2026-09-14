import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, RefreshControl, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { BottomNav } from '../components/BottomNav';
import { ScreenState, SkeletonRows } from '../components/ScreenState';
import { api, resolveMediaUrl, WEB_BASE_URL } from '../services/api';
import { colors } from '../theme';
import { compact, userName } from '../utils/format';
import type { DirectAccessWindow, DreamData, MainTab, ProfilePhoto, ProfileViewers, Session, UnifiedProfile } from '../types';

function ActionButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.actionButton}><Ionicons color={colors.text} name={icon} size={15} /><Text style={styles.actionText}>{label}</Text></Pressable>;
}

function StatusModal({ onClose, onSaved, session, visible }: { onClose: () => void; onSaved: () => void; session: Session; visible: boolean }) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await api.updateStatus({ label: label.trim(), emoji: '•', presetKey: 'custom', color: colors.blue, durationHours: 6 }, session.accessToken);
      setLabel('');
      onSaved();
      onClose();
    } catch (error) {
      Alert.alert('Status failed', error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setBusy(false);
    }
  };
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Status</Text><Pressable onPress={onClose}><Ionicons color={colors.muted} name="close" size={24} /></Pressable></View><TextInput autoFocus onChangeText={setLabel} placeholder="At seen" placeholderTextColor={colors.faint} style={styles.statusInput} value={label} /><Pressable disabled={busy || !label.trim()} onPress={save} style={[styles.primaryButton, (!label.trim() || busy) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Save status</Text>}</Pressable><Pressable onPress={async () => { await api.updateStatus({ clear: true }, session.accessToken); onSaved(); onClose(); }} style={styles.clearButton}><Text style={styles.clearText}>Clear current status</Text></Pressable></View></View></Modal>;
}

function MoreModal({ onClose, onNavigate, visible }: { onClose: () => void; onNavigate: (key: MainTab) => void; visible: boolean }) {
  const rows = [
    ['Creator Studio', 'bar-chart-outline', () => Linking.openURL(`${WEB_BASE_URL}/studio`)],
    ['Activity', 'sparkles-outline', () => Linking.openURL(`${WEB_BASE_URL}/activity`)],
    ['Wallet', 'wallet-outline', () => Linking.openURL(`${WEB_BASE_URL}/wallet`)],
    ['Saved', 'bookmark-outline', () => Linking.openURL(`${WEB_BASE_URL}/saved`)],
    ['Settings', 'settings-outline', () => Linking.openURL(`${WEB_BASE_URL}/settings`)],
  ] as const;
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>More</Text><Pressable onPress={onClose}><Ionicons color={colors.muted} name="close" size={24} /></Pressable></View>{rows.map(([label, icon, onPress]) => <Pressable key={label} onPress={() => { onClose(); onPress(); }} style={styles.moreRow}><Ionicons color={colors.blue} name={icon} size={18} /><Text style={styles.moreText}>{label}</Text><Ionicons color={colors.faint} name="chevron-forward" size={16} /></Pressable>)}<Pressable onPress={() => { onClose(); onNavigate('messages'); }} style={styles.moreRow}><Ionicons color={colors.blue} name="chatbubble-outline" size={18} /><Text style={styles.moreText}>Messages</Text><Ionicons color={colors.faint} name="chevron-forward" size={16} /></Pressable></View></View></Modal>;
}

function PhotoModal({ onClose, photo }: { onClose: () => void; photo: ProfilePhoto | null }) {
  const url = resolveMediaUrl(photo?.mediaUrl || '');
  return <Modal animationType="fade" visible={Boolean(photo)} onRequestClose={onClose}><SafeAreaView style={styles.photoScreen}><Pressable accessibilityLabel="Close photo" onPress={onClose} style={styles.photoClose}><Ionicons color={colors.text} name="close" size={24} /></Pressable>{url ? <Image resizeMode="contain" source={{ uri: url }} style={styles.fullPhoto} /> : null}{photo?.caption ? <Text style={styles.photoCaption}>{photo.caption}</Text> : null}</SafeAreaView></Modal>;
}

function DirectAccessCard({ onPress, waiting, windows, profile }: { onPress: () => void; waiting: number; windows: DirectAccessWindow[]; profile: UnifiedProfile['profile'] }) {
  const direct = profile.directAccess;
  if (!profile.isCreator || !direct) return null;
  const latest = windows[0];
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.daCard}><View style={styles.daIcon}><Ionicons color={colors.blue} name="sparkles" size={13} /></View><View style={styles.daCopy}><Text style={styles.daTitle}>Direct Access · {direct.enabled ? `${waiting} waiting` : 'Off'}</Text><Text numberOfLines={1} style={styles.daSub}>Messages ✦{direct.priceStars || 0} · Calls {direct.callEnabled ? `✦${direct.callPriceStars || 0} / ${direct.callDurationMinutes || 0} min` : 'off'} · {latest ? `${latest.status?.toLowerCase()} latest` : `${direct.durationHours || 48}h`}</Text></View><Ionicons color={colors.faint} name="settings-outline" size={15} /><Ionicons color={colors.blue} name="chevron-forward" size={15} /></Pressable>;
}

function DreamCard({ dreamData, username }: { dreamData?: DreamData | null; username?: string }) {
  const dream = dreamData?.dream;
  const open = () => Linking.openURL(`${WEB_BASE_URL}/profile/${username || ''}`);
  return <Pressable accessibilityRole="button" onPress={open} style={styles.dreamRow}><Text style={styles.dreamSpark}>{dream?.emoji || '✦'}</Text><View style={styles.dreamCopy}><Text style={styles.dreamTitle}>Dream Experience</Text>{dream ? <Text numberOfLines={1} style={styles.dreamSub}>{dream.title} · {compact(dream.receivedStars || 0)}/{compact(dream.goalStars || 0)} Stars</Text> : null}</View><Text style={styles.createText}>{dream ? 'Open ›' : 'Create ›'}</Text></Pressable>;
}

export function ProfileScreen({ onNavigate, session }: { onNavigate: (key: MainTab) => void; session: Session }) {
  const [data, setData] = useState<UnifiedProfile | null>(null);
  const [viewers, setViewers] = useState<ProfileViewers | null>(null);
  const [windows, setWindows] = useState<DirectAccessWindow[]>([]);
  const [dream, setDream] = useState<DreamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [photo, setPhoto] = useState<ProfilePhoto | null>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      const profile = await api.getUnifiedMe(session.accessToken);
      setData(profile);
      const [activity, directWindows, dreamData] = await Promise.all([
        api.getOwnViewers(session.accessToken).catch(() => null),
        api.listDirectAccessWindows(session.accessToken).then((result) => result.windows || []).catch(() => []),
        profile.profile.username ? api.getDream(profile.profile.username, session.accessToken).catch(() => null) : Promise.resolve(null),
      ]);
      setViewers(activity);
      setWindows(directWindows);
      setDream(dreamData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Profile is unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.accessToken]);
  useEffect(() => { load(); }, [load]);
  const profile = data?.profile;
  const metrics = data?.publicMetrics || {};
  const waiting = useMemo(() => {
    const myId = String(profile?.ownerUserId || session.user.id || session.user._id || '');
    return windows.filter((item) => String(item.creatorId) === myId && item.status === 'OPEN').length;
  }, [profile?.ownerUserId, session.user, windows]);
  const profileUrl = `${WEB_BASE_URL}/profile/${profile?.username || session.user.username || ''}`;
  const shareProfile = () => Share.share({ title: `${profile?.displayName || session.user.name} on @seen`, message: profileUrl }).catch(() => undefined);
  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.screen}><SkeletonRows count={7} /><BottomNav active="profile" avatar={session.user.avatar} name={session.user.name || session.user.username} onSelect={onNavigate} /></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><View style={styles.screen}>{error || !profile ? <ScreenState icon="person-circle-outline" title="Profile could not load" message={error} onPress={load} /> : <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.blue} onRefresh={() => { setRefreshing(true); load(); }} />}>
    <View style={styles.topBar}><Text style={styles.username}><Text style={styles.at}>@</Text>{profile.username}</Text><View style={styles.headerActions}><Pressable accessibilityLabel="Create" onPress={() => onNavigate('wall')} style={styles.round}><Ionicons color={colors.muted} name="add" size={22} /></Pressable><Pressable accessibilityLabel="Activity" onPress={() => Alert.alert('Who saw you', `${viewers?.seenTodayCount || 0} saw you today.`)} style={styles.round}><Ionicons color={colors.blue} name="sparkles" size={17} />{viewers?.seenTodayCount ? <View style={styles.countBadge}><Text style={styles.countText}>{viewers.seenTodayCount}</Text></View> : null}</Pressable></View></View>
    <View style={styles.cover}>{profile.cover ? <Image source={{ uri: resolveMediaUrl(profile.cover) }} style={StyleSheet.absoluteFill} /> : <View style={styles.coverFallback} />}</View>
    <View style={styles.avatarOverlap}><Avatar ring size={72} user={{ ...profile, name: profile.displayName }} /></View>
    <View style={styles.ownerActions}><ActionButton icon="eye-outline" label="Who saw you" onPress={() => Alert.alert('Who saw you', `${viewers?.seenTodayCount || 0} saw you today.`)} /><ActionButton icon="create-outline" label="Edit" onPress={() => Linking.openURL(`${WEB_BASE_URL}/settings/profile`)} /><ActionButton icon="share-social-outline" label="Share" onPress={shareProfile} /><Pressable accessibilityLabel="More" onPress={() => setMoreOpen(true)} style={styles.iconOnly}><Ionicons color={colors.text} name="ellipsis-horizontal" size={18} /></Pressable></View>
    <View style={styles.identity}><View style={styles.nameLine}><Text numberOfLines={1} style={styles.displayName}>{profile.displayName || profile.username}</Text>{profile.verified ? <Ionicons color={colors.blue} name="checkmark-circle" size={16} /> : <Pressable onPress={() => Linking.openURL(`${WEB_BASE_URL}/creator/verification`)}><Text style={styles.verifyText}>Get verified ›</Text></Pressable>}</View>{profile.username ? <Text style={styles.handle}>@{profile.username}</Text> : null}{profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}{profile.location ? <Text style={styles.location}><Ionicons color={colors.faint} name="location-outline" size={11} /> {profile.location}</Text> : null}</View>
    <Pressable accessibilityRole="button" onPress={() => setStatusOpen(true)} style={styles.statusChip}><View style={[styles.statusDot, { backgroundColor: profile.activeStatus?.color || colors.blue }]} /><Text style={styles.statusText}>{profile.activeStatus?.label || 'Set status'}</Text><Ionicons color={colors.blue} name="pencil" size={12} /></Pressable>
    <View style={styles.stats}>{[['Supporters', metrics.supporterCount], ['Followers', metrics.followerCount], ['Following', metrics.followingCount]].map(([label, value]) => <Pressable key={label as string} onPress={() => Linking.openURL(`${WEB_BASE_URL}/profile/${profile.username}`)} style={styles.stat}><Text style={styles.statValue}>{compact(Number(value || 0))}</Text><Text style={styles.statLabel}>{label}</Text></Pressable>)}</View>
    {profile.isCreator ? <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`${WEB_BASE_URL}/studio`)} style={styles.dashboard}><Ionicons color={colors.faint} name="bar-chart-outline" size={16} /><Text style={styles.dashboardText}>Professional dashboard</Text><Ionicons color={colors.faint} name="chevron-forward" size={15} /></Pressable> : null}
    <DirectAccessCard onPress={() => onNavigate('messages')} profile={profile} waiting={waiting} windows={windows} />
    <DreamCard dreamData={dream} username={profile.username} />
    {data.photos?.length ? <View style={styles.section}><Text style={styles.sectionTitle}>Photos</Text><ScrollView contentContainerStyle={styles.photos} horizontal showsHorizontalScrollIndicator={false}>{data.photos.map((item) => <Pressable key={String(item.id || item.mediaUrl)} onPress={() => setPhoto(item)}><Image source={{ uri: resolveMediaUrl(item.mediaUrl || '') }} style={styles.photo} /></Pressable>)}</ScrollView></View> : null}
    {data.wallPosts?.length || data.sharedWallPosts?.length ? <View style={styles.section}><Text style={styles.sectionTitle}>Posts</Text>{[...(data.wallPosts || []), ...(data.sharedWallPosts || [])].slice(0, 6).map((post) => <View key={post.id} style={styles.profilePost}><Text numberOfLines={3} style={styles.profilePostText}>{post.text}</Text></View>)}</View> : null}
    {data.seens?.length ? <View style={styles.section}><Text style={styles.sectionTitle}>Seens</Text>{data.seens.slice(0, 4).map((seen) => <View key={String(seen.id || seen._id)} style={styles.profilePost}><Text numberOfLines={1} style={styles.profilePostTitle}>{seen.title}</Text><Text numberOfLines={2} style={styles.profilePostText}>{seen.summary || seen.description}</Text></View>)}</View> : null}
  </ScrollView>}<StatusModal onClose={() => setStatusOpen(false)} onSaved={load} session={session} visible={statusOpen} /><MoreModal onClose={() => setMoreOpen(false)} onNavigate={onNavigate} visible={moreOpen} /><PhotoModal onClose={() => setPhoto(null)} photo={photo} /><BottomNav active="profile" avatar={profile?.avatar || session.user.avatar} name={profile?.displayName || session.user.name || session.user.username} onSelect={onNavigate} /></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 22 },
  topBar: { height: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  username: { color: colors.text, fontSize: 14, fontWeight: '900' },
  at: { color: colors.blue },
  headerActions: { flexDirection: 'row', gap: 8 },
  round: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  countBadge: { position: 'absolute', right: -2, top: -3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { color: colors.bg, fontSize: 9, fontWeight: '900' },
  cover: { height: 148, backgroundColor: colors.surface2, overflow: 'hidden' },
  coverFallback: { flex: 1, backgroundColor: '#101722' },
  avatarOverlap: { marginTop: -36, marginLeft: 20, width: 78 },
  ownerActions: { marginTop: -24, marginLeft: 116, marginRight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  actionButton: { minHeight: 32, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  iconOnly: { width: 36, height: 32, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  identity: { paddingHorizontal: 20, paddingTop: 20 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { color: colors.text, fontSize: 21, fontWeight: '900', maxWidth: '70%' },
  verifyText: { color: colors.blue, fontSize: 10, fontWeight: '900' },
  handle: { color: colors.faint, fontSize: 11, marginTop: 4 },
  bio: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  location: { color: colors.faint, fontSize: 11, marginTop: 8 },
  statusChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 20, marginTop: 14, minHeight: 30, borderRadius: 99, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, paddingHorizontal: 12 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  stats: { marginHorizontal: 20, marginTop: 16, flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden' },
  stat: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  statLabel: { color: colors.faint, fontSize: 10, marginTop: 2 },
  dashboard: { marginHorizontal: 20, marginTop: 12, height: 48, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15 },
  dashboardText: { color: colors.text, fontSize: 13, fontWeight: '900', flex: 1 },
  daCard: { marginHorizontal: 20, marginTop: 10, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(156,203,255,.34)', backgroundColor: 'rgba(156,203,255,.07)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  daIcon: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(156,203,255,.35)', alignItems: 'center', justifyContent: 'center' },
  daCopy: { flex: 1, minWidth: 0 },
  daTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  daSub: { color: colors.muted, fontSize: 10, marginTop: 2 },
  dreamRow: { marginHorizontal: 20, marginTop: 26, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dreamSpark: { color: colors.blue, fontSize: 16 },
  dreamCopy: { flex: 1 },
  dreamTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  dreamSub: { color: colors.faint, fontSize: 10, marginTop: 2 },
  createText: { color: colors.blue, fontSize: 11, fontWeight: '900' },
  section: { marginTop: 18 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginHorizontal: 20, marginBottom: 10 },
  photos: { paddingHorizontal: 20, gap: 8 },
  photo: { width: 86, height: 70, borderRadius: 10, backgroundColor: colors.surface2 },
  profilePost: { marginHorizontal: 20, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12 },
  profilePostTitle: { color: colors.text, fontSize: 12, fontWeight: '900', marginBottom: 3 },
  profilePostText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.58)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.25)', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  statusInput: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, color: colors.text, paddingHorizontal: 14, marginTop: 18 },
  primaryButton: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue, marginTop: 12 },
  primaryText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  clearButton: { alignItems: 'center', paddingVertical: 14 },
  clearText: { color: colors.faint, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: .55 },
  moreRow: { minHeight: 50, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  moreText: { color: colors.text, fontSize: 13, fontWeight: '800', flex: 1 },
  photoScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  photoClose: { position: 'absolute', top: 48, right: 18, zIndex: 2, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.08)' },
  fullPhoto: { width: '100%', height: '78%' },
  photoCaption: { color: colors.muted, paddingHorizontal: 22, textAlign: 'center' },
});
