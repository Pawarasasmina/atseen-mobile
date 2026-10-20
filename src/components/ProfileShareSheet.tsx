import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from './Avatar';
import { StatusEye } from './StatusEye';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { api, resolveMediaUrl, WEB_BASE_URL } from '../services/api';
import { colors } from '../theme';
import type { UnifiedProfile, ShareRecipient } from '../types';

const quickReactions = [
  ['\u2764\uFE0F', 'Heart'], ['\u{1F602}', 'Laugh'], ['\u{1F525}', 'Fire'], ['\u{1F60D}', 'Love'],
  ['\u{1F44F}', 'Clap'], ['\u{1F62E}', 'Wow'], ['\u{1F64F}', 'Pray'], ['\u{1F91D}', 'Handshake'],
];

const firstName = (value = '') => value.trim().split(/\s+/)[0] || '@seen';

export function ProfileShareSheet({ accessToken, profile, visible, onClose }: { accessToken: string; profile: UnifiedProfile['profile']; visible: boolean; onClose: () => void }) {
  const id = String(profile.ownerUserId || profile.id || profile._id || '');
  const insets = useSafeAreaInsets();
  const sendLocked = useRef(false);
  const title = profile.displayName || profile.name || profile.username || '@seen';
  const url = `${WEB_BASE_URL}/profile/${encodeURIComponent(profile.username || '')}`;
  const shareText = `Find me on @seen: ${title} ${url}`;
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<ShareRecipient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const messageInput = useRef<TextInput>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!visible) { setQuery(''); setSelected([]); setMessage(''); setNotice(''); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setNotice('');
      try { const data = await api.listShareRecipients(query, accessToken); if (active) setPeople(data.people || []); }
      catch (reason) { if (active) setNotice(reason instanceof Error ? reason.message : 'Could not load people'); }
      finally { if (active) setLoading(false); }
    }, query ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, query, visible]);

  const selectedPeople = useMemo(() => people.filter((person) => selected.includes(person.id)), [people, selected]);
  const copyLink = async (text = 'Link copied') => { await Clipboard.setStringAsync(url); setNotice(text); };
  const openExternal = async (target: string, fallback: string) => {
    try { if (await Linking.canOpenURL(target)) await Linking.openURL(target); else await Share.share({ message: fallback, url }); }
    catch { setNotice('Could not open that app'); }
  };
  const send = async () => {
    if (!selected.length || sendLocked.current || !id) return;
    sendLocked.current = true;
    setSending(true); setNotice('');
    try {
      const result = await api.sendSharedProfile(id, selected, message, accessToken);
      if (result.failed?.length) { const failedIds = result.failed.map((entry) => entry.recipientId); setSelected(failedIds); setNotice(result.sent?.length ? 'Sent to some people; retry the remaining recipients.' : result.failed[0].message); return; }
      setNotice(`Sent to ${selectedPeople.map((person) => firstName(person.displayName || person.name || person.username)).join(', ')}`);
      setSelected([]);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Could not send this profile'); }
    finally { sendLocked.current = false; setSending(false); }
  };

  return <Modal animationType="slide" onRequestClose={() => { if (!sendLocked.current) onClose(); }} presentationStyle="overFullScreen" transparent visible={visible}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable accessibilityLabel="Close share sheet" disabled={sending} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom) }]}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.handle} />
        <View style={styles.heading}><Text style={styles.title}>Share</Text><Pressable disabled={sending} accessibilityLabel="Close share options" onPress={onClose}><Ionicons color={colors.muted} name="close" size={20} /></Pressable></View>
        <Text style={styles.sectionLabel}>HOW IT LOOKS IN A CHAT</Text>
        <View style={styles.preview}><LinearGradient colors={['#24344F', '#0E141E']} style={styles.previewHero}><View style={styles.previewRing}><Avatar user={profile} size={68} /></View></LinearGradient><View style={styles.previewCopy}><Text style={styles.previewTitle}>{title}</Text><Text style={styles.previewDescription}>@{profile.username} · Seens, experiences and my World</Text><View style={styles.domain}><StatusEye size={13} color="#7D8490" /><Text style={styles.domainText}>{WEB_BASE_URL.replace(/^https?:\/\//, '').split('/')[0]}</Text></View></View></View>
        <Text style={styles.sectionLabel}>SEND IN @SEEN</Text>
        <View style={styles.search}><Ionicons color={colors.faint} name="search" size={18} /><TextInput autoCapitalize="none" onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.faint} editable={!sending} style={styles.searchInput} value={query} /></View>
        <View style={styles.people}>
          {loading ? <ActivityIndicator color={colors.blue} style={styles.loader} /> : people.slice(0, query ? 30 : 8).map((person) => {
            const chosen = selected.includes(person.id); const name = person.displayName || person.name || person.username || '@seen';
            return <Pressable disabled={sending} accessibilityRole="button" accessibilityState={{ selected: chosen }} accessibilityLabel={name} key={person.id} onPress={() => setSelected((current) => chosen ? current.filter((value) => value !== person.id) : current.length < 10 ? [...current, person.id] : current)} style={styles.person}>
              <View style={[styles.avatarRing, chosen && styles.avatarChosen]}>{person.avatarUrl || person.avatar ? <Image source={{ uri: resolveMediaUrl(person.avatarUrl || person.avatar) }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initial}>{name[0]?.toUpperCase()}</Text></View>}<View style={styles.badge}><Ionicons color={chosen ? colors.bg : colors.blue} name={chosen ? 'checkmark' : person.isVerified ? 'checkmark-circle' : 'chatbubble'} size={11} /></View></View>
              <Text numberOfLines={1} style={styles.personName}>{firstName(name)}</Text>
            </Pressable>;
          })}
        </View>
        {!loading && !people.length ? <Text style={styles.empty}>No people found</Text> : null}
        {selected.length ? <View style={styles.selectedActions}><View style={styles.reactions}>{quickReactions.map(([emoji, label]) => <Pressable accessibilityRole="button" accessibilityLabel={`Add ${label} to message`} disabled={sending} key={label} onPress={() => { setMessage((current) => current.length + emoji.length <= 2000 ? current + emoji : current); messageInput.current?.focus(); }} style={styles.reaction}><Text style={styles.reactionEmoji}>{emoji}</Text></Pressable>)}</View><View style={styles.compose}><TextInput ref={messageInput} editable={!sending} maxLength={2000} onChangeText={setMessage} placeholder="Write a message…" placeholderTextColor={colors.faint} style={styles.message} value={message} /><Pressable disabled={sending} onPress={send} style={styles.send}>{sending ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.sendText}>Send</Text>}</Pressable></View></View> : <View style={styles.external}>
          <External icon="copy-outline" label="Copy link" onPress={() => copyLink().catch(() => setNotice('Could not copy link'))} />
          <External icon="logo-whatsapp" label="WhatsApp" onPress={() => openExternal(`whatsapp://send?text=${encodeURIComponent(shareText)}`, shareText)} />
          <External icon="paper-plane-outline" label="Telegram" onPress={() => openExternal(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Find me on @seen')}`, shareText)} />
          <External icon="chatbubble-outline" label="Messages" onPress={() => openExternal(`sms:${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(shareText)}`, shareText)} />
          <External icon="ellipsis-horizontal" label="More" onPress={() => Share.share({ title, message: shareText }).catch(() => setNotice('Could not open sharing options'))} />
        </View>}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </ScrollView></View>
    </KeyboardAvoidingView>
  </Modal>;
}

function External({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.externalAction}><View style={styles.externalIcon}><Ionicons color={colors.muted} name={icon} size={20} /></View><Text style={styles.externalLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
 selectedActions: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }, reactions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, reaction: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center' }, reactionEmoji: { fontSize: 21 },
 sectionLabel: { color: '#73777D', fontSize: 10.5, letterSpacing: .7, fontWeight: '700', marginBottom: 10, marginTop: 2 },
 preview: { width: '84%', alignSelf: 'flex-end', borderRadius: 20, borderBottomRightRadius: 6, overflow: 'hidden', backgroundColor: '#1B2230', marginBottom: 18 },
 previewHero: { aspectRatio: 1.91, alignItems: 'center', justifyContent: 'center' }, previewRing: { borderRadius: 40, borderWidth: 3, borderColor: 'rgba(156,203,255,.45)' },
 previewCopy: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 11 }, previewTitle: { color: '#FFF', fontSize: 13.5, fontWeight: '700' }, previewDescription: { color: '#ADB3BD', fontSize: 11.5, lineHeight: 17, marginTop: 3 }, domain: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, domainText: { color: '#7D8490', fontSize: 10.5 },
 overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.58)', justifyContent: 'flex-end' }, sheet: { maxHeight: '92%', backgroundColor: '#0C1014', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingBottom: Platform.OS === 'ios' ? 30 : 20, minHeight: 420 }, handle: { width: 32, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.24)', alignSelf: 'center', marginTop: 10, marginBottom: 17 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, headingCopy: { flex: 1 }, title: { color: colors.text, fontSize: 21, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 }, search: { borderWidth: 1, borderColor: '#252A31', height: 42, borderRadius: 22, backgroundColor: '#101319', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }, searchInput: { flex: 1, color: colors.text, fontSize: 13, marginLeft: 8 }, people: { minHeight: 176, flexDirection: 'row', flexWrap: 'wrap', paddingTop: 14 }, loader: { flex: 1 }, person: { width: '25%', alignItems: 'center', marginBottom: 12 }, avatarRing: { width: 58, height: 58, borderRadius: 28, padding: 2, borderWidth: 2, borderColor: colors.blue }, avatarChosen: { borderColor: '#fff' }, avatar: { width: '100%', height: '100%', borderRadius: 25 }, avatarFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, initial: { color: colors.blue, fontWeight: '900', fontSize: 19 }, badge: { position: 'absolute', right: -3, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#0C1014', borderWidth: 1, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, personName: { color: colors.muted, fontSize: 10, marginTop: 6, maxWidth: 70 }, empty: { color: colors.faint, textAlign: 'center', height: 42 }, external: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14 }, externalAction: { width: '19%', alignItems: 'center' }, externalIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' }, externalLabel: { color: colors.faint, fontSize: 9, marginTop: 6 }, compose: { flexDirection: 'row', gap: 10 }, message: { flex: 1, height: 44, borderRadius: 22, backgroundColor: '#101319', color: colors.text, paddingHorizontal: 16 }, send: { minWidth: 70, height: 44, paddingHorizontal: 17, borderRadius: 22, backgroundColor: colors.blue, justifyContent: 'center', alignItems: 'center' }, sendText: { color: colors.bg, fontWeight: '900' }, notice: { color: colors.blue, textAlign: 'center', fontSize: 11, marginTop: 12 } });
