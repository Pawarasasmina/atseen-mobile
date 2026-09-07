import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { api, resolveMediaUrl, WEB_BASE_URL } from '../services/api';
import { colors } from '../theme';
import type { Seen, ShareRecipient } from '../types';

const firstName = (value = '') => value.trim().split(/\s+/)[0] || '@seen';

export function ShareSheet({ accessToken, item, visible, onClose }: { accessToken: string; item: Seen; visible: boolean; onClose: () => void }) {
  const id = String(item.id || item._id || '');
  const url = `${WEB_BASE_URL}/seen/${id}`;
  const shareText = `Check this out on @seen: ${item.title || 'Seen'} ${url}`;
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<ShareRecipient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!visible) { setQuery(''); setSelected([]); setMessage(''); setNotice(''); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
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
    if (!selected.length || sending) return;
    setSending(true); setNotice('');
    try {
      const result = await api.sendSharedSeen(id, selected, message, accessToken);
      if (result.failed?.length) { setNotice(result.sent?.length ? 'Sent to some people; one or more failed' : result.failed[0].message); return; }
      setNotice(`Sent to ${selectedPeople.map((person) => firstName(person.displayName || person.name || person.username)).join(', ')}`);
      setTimeout(onClose, 450);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Could not send this Seen'); }
    finally { setSending(false); }
  };

  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.heading}><View style={styles.headingCopy}><Text style={styles.title}>Send to</Text><Text numberOfLines={1} style={styles.subtitle}>{item.title || 'Seen'} — {item.creator?.name || item.creator?.username || '@seen'}</Text></View><Pressable accessibilityLabel="Close share options" onPress={onClose}><Ionicons color={colors.muted} name="close" size={25} /></Pressable></View>
        <View style={styles.search}><Ionicons color={colors.faint} name="search" size={18} /><TextInput autoCapitalize="none" onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.faint} style={styles.searchInput} value={query} /></View>
        <View style={styles.people}>
          {loading ? <ActivityIndicator color={colors.blue} style={styles.loader} /> : people.slice(0, 12).map((person) => {
            const chosen = selected.includes(person.id); const name = person.displayName || person.name || person.username || '@seen';
            return <Pressable key={person.id} onPress={() => setSelected((current) => chosen ? current.filter((value) => value !== person.id) : current.length < 10 ? [...current, person.id] : current)} style={styles.person}>
              <View style={[styles.avatarRing, chosen && styles.avatarChosen]}>{person.avatarUrl || person.avatar ? <Image source={{ uri: resolveMediaUrl(person.avatarUrl || person.avatar) }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initial}>{name[0]?.toUpperCase()}</Text></View>}<View style={styles.badge}><Ionicons color={chosen ? colors.bg : colors.blue} name={chosen ? 'checkmark' : person.isVerified ? 'checkmark-circle' : 'chatbubble'} size={11} /></View></View>
              <Text numberOfLines={1} style={styles.personName}>{firstName(name)}</Text>
            </Pressable>;
          })}
        </View>
        {!loading && !people.length ? <Text style={styles.empty}>No people found</Text> : null}
        {selected.length ? <View style={styles.compose}><TextInput maxLength={2000} onChangeText={setMessage} placeholder="Write a message…" placeholderTextColor={colors.faint} style={styles.message} value={message} /><Pressable disabled={sending} onPress={send} style={styles.send}>{sending ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.sendText}>Send</Text>}</Pressable></View> : <View style={styles.external}>
          <External icon="add-circle-outline" label="Story" onPress={async () => { await copyLink('Link copied — paste it into your story'); }} />
          <External icon="copy-outline" label="Copy link" onPress={() => copyLink()} />
          <External icon="logo-whatsapp" label="WhatsApp" onPress={() => openExternal(`whatsapp://send?text=${encodeURIComponent(shareText)}`, shareText)} />
          <External icon="logo-snapchat" label="Snapchat" onPress={async () => { await copyLink('Link copied — paste it into Snapchat'); await openExternal('snapchat://', shareText); }} />
          <External icon="ellipsis-horizontal" label="More" onPress={() => Share.share({ title: item.title || '@seen', message: shareText, url })} />
        </View>}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function External({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.externalAction}><View style={styles.externalIcon}><Ionicons color={colors.muted} name={icon} size={20} /></View><Text style={styles.externalLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.58)', justifyContent: 'flex-end' }, sheet: { backgroundColor: '#1A1F29', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingBottom: Platform.OS === 'ios' ? 30 : 20, minHeight: 420 }, handle: { width: 54, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.24)', alignSelf: 'center', marginTop: 10, marginBottom: 17 }, heading: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 }, headingCopy: { flex: 1 }, title: { color: colors.text, fontSize: 21, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 }, search: { height: 42, borderRadius: 22, backgroundColor: '#101319', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }, searchInput: { flex: 1, color: colors.text, fontSize: 13, marginLeft: 8 }, people: { minHeight: 176, flexDirection: 'row', flexWrap: 'wrap', paddingTop: 14 }, loader: { flex: 1 }, person: { width: '25%', alignItems: 'center', marginBottom: 12 }, avatarRing: { width: 55, height: 55, borderRadius: 28, padding: 2, borderWidth: 2, borderColor: colors.blue }, avatarChosen: { borderColor: '#fff' }, avatar: { width: '100%', height: '100%', borderRadius: 25 }, avatarFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, initial: { color: colors.blue, fontWeight: '900', fontSize: 19 }, badge: { position: 'absolute', right: -3, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.blue, borderWidth: 2, borderColor: '#1A1F29', alignItems: 'center', justifyContent: 'center' }, personName: { color: colors.muted, fontSize: 10, marginTop: 6, maxWidth: 70 }, empty: { color: colors.faint, textAlign: 'center', height: 42 }, external: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14 }, externalAction: { width: '19%', alignItems: 'center' }, externalIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' }, externalLabel: { color: colors.faint, fontSize: 9, marginTop: 6 }, compose: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 14, flexDirection: 'row', gap: 10 }, message: { flex: 1, height: 44, borderRadius: 22, backgroundColor: '#101319', color: colors.text, paddingHorizontal: 16 }, send: { minWidth: 70, height: 44, paddingHorizontal: 17, borderRadius: 22, backgroundColor: colors.blue, justifyContent: 'center', alignItems: 'center' }, sendText: { color: colors.bg, fontWeight: '900' }, notice: { color: colors.blue, textAlign: 'center', fontSize: 11, marginTop: 12 } });
