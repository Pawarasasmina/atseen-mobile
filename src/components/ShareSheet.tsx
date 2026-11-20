import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { Avatar } from './Avatar';
import { api, WEB_BASE_URL } from '../services/api';
import { colors } from '../theme';
import { firstName, userName } from '../utils/format';
import { remainingShareRecipients, toggleShareRecipient } from '../utils/seenShare';
import type { Seen, ShareRecipient } from '../types';

export function ShareSheet({ accessToken, item, visible, onClose }: { accessToken: string; item: Seen; visible: boolean; onClose: () => void }) {
  const id = String(item.id || item._id || ''), url = `${WEB_BASE_URL}/seen/${encodeURIComponent(id)}`;
  const title = item.title || 'Seen', author = firstName(userName(item.creator)), shareText = `${title}\n${url}`;
  const { width } = useWindowDimensions(), insets = useSafeAreaInsets();
  const [query, setQuery] = useState(''), [people, setPeople] = useState<ShareRecipient[]>([]), [selected, setSelected] = useState<ShareRecipient[]>([]);
  const [message, setMessage] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false), [pending, setPending] = useState('');
  const [storyConfirm, setStoryConfirm] = useState(false), [retry, setRetry] = useState(0), [keyboardVisible, setKeyboardVisible] = useState(false);
  const locked = useRef(false), closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageInput = useRef<ComponentRef<typeof TextInput>>(null);
  let domain = 'atseen.com'; try { domain = new URL(url).host; } catch {}
  useEffect(() => {
    if (!visible) { setQuery(''); setSelected([]); setMessage(''); setNotice(''); setStoryConfirm(false); }
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [visible, id]);
  useEffect(() => {
    if (!visible) return;
    let alive = true; setLoading(true); setNotice('');
    const timer = setTimeout(async () => {
      try { const data = await api.listShareRecipients(query, accessToken); if (alive) setPeople(data.people || []); }
      catch (error) { if (alive) { setPeople([]); setNotice(error instanceof Error ? error.message : 'Could not load recipients.'); } }
      finally { if (alive) setLoading(false); }
    }, query ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [accessToken, query, visible, retry]);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const close = () => { if (!locked.current) { Keyboard.dismiss(); onClose(); } };
  const run = async (key: string, action: () => Promise<void>) => {
    if (locked.current) return;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    locked.current = true; setPending(key); setNotice('');
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not share this Seen. Please try again.'); }
    finally { locked.current = false; setPending(''); }
  };
  const refreshEngagement = () => api.getSeenEngagement(id, accessToken).then((result) => DeviceEventEmitter.emit('seen:engagement', { id, engagement: result.engagement })).catch(() => {});
  const nativeShare = () => Share.share(Platform.OS === 'ios' ? { title, message: title, url } : { title, message: shareText });
  const external = (key: string, target: string) => run(key, async () => { Keyboard.dismiss(); try { await Linking.openURL(target); } catch { await nativeShare(); } });
  const toggle = (person: ShareRecipient) => {
    if (locked.current) return;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (selected.length >= 10 && !selected.some((entry) => entry.id === person.id)) setNotice('You can send to up to 10 people at once.');
    setSelected((old) => toggleShareRecipient(old, person));
  };
  const send = () => run('send', async () => {
    if (!selected.length) return;
    const result = await api.sendSharedSeen(id, selected.map((person) => person.id), message, accessToken);
    void refreshEngagement();
    if (result.failed?.length) {
      const sent = new Set((result.sent || []).map((entry) => entry.recipientId));
      setSelected((old) => remainingShareRecipients(old, result.sent || []));
      setNotice(sent.size ? 'Sent to some people. Only failed recipients remain selected for retry.' : result.failed[0].message);
      return;
    }
    setNotice(`Sent to ${selected.map((person) => firstName(userName(person))).join(', ')}`); setSelected([]); setMessage(''); Keyboard.dismiss();
    closeTimer.current = setTimeout(onClose, 550);
  });
  return <Modal animationType="slide" onRequestClose={close} presentationStyle="overFullScreen" transparent visible={visible} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
      <Pressable accessibilityLabel="Close share sheet" onPress={close} style={s.scrim} />
      <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: 20 + (keyboardVisible ? 0 : insets.bottom) }]}>
        <View style={s.handle} />
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          <Text style={s.heading}>Share</Text><Text style={s.section}>HOW IT LOOKS IN A CHAT</Text>
          <View accessibilityLabel={`Chat preview: ${title}, a Seen by ${author}`} style={[s.preview, { width: Math.min(300, width - 76) }]}>
            <LinearGradient colors={['#22314A', '#121923']} style={s.previewMedia}><View style={s.previewAvatar}><Avatar user={item.creator} size={70} /></View></LinearGradient>
            <View style={s.previewCopy}><Text style={s.previewTitle}>{title}</Text><Text style={s.previewSubtitle}>a Seen by {author}</Text><View style={s.previewDomain}><Feather name="eye" size={12} color={colors.faint} /><Text style={s.domain}>{domain}</Text></View></View>
          </View>
          {storyConfirm ? <View style={s.storyConfirmation}><Text style={s.section}>SHARE TO YOUR STORY</Text><Text style={s.previewSubtitle}>Share this Seen to your story for everyone who can view it.</Text><View style={s.storyActions}><Pressable disabled={Boolean(pending)} onPress={() => setStoryConfirm(false)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable><Pressable disabled={Boolean(pending)} style={s.send} onPress={() => run('story', async () => { await api.shareSeenAsStory(id, accessToken); void refreshEngagement(); setStoryConfirm(false); setNotice('Added to your story.'); })}>{pending === 'story' ? <ActivityIndicator color={colors.bg} /> : <Text style={s.sendText}>Share to story</Text>}</Pressable></View></View> : <>
            <Text style={[s.section, s.recipientHeading]}>SEND IN @SEEN</Text>
            <View style={s.search}><TextInput accessibilityLabel="Search share recipients" autoCapitalize="none" autoCorrect={false} maxLength={80} editable={!pending} placeholder="Search" placeholderTextColor={colors.faint} onChangeText={setQuery} value={query} style={s.searchInput} /></View>
            <View style={s.people}>{loading ? <ActivityIndicator color={colors.blue} style={s.loader} /> : (query.trim() ? people : people.slice(0, 8)).map((person) => {
              const chosen = selected.some((entry) => entry.id === person.id);
              return <Pressable accessibilityRole="button" accessibilityLabel={`Send to ${userName(person)}`} accessibilityState={{ selected: chosen, disabled: Boolean(pending) }} disabled={Boolean(pending)} key={person.id} onPress={() => toggle(person)} style={s.person}>
                <View style={[s.avatarRing, chosen && s.avatarChosen]}><Avatar size={50} user={person} /><View style={[s.badge, chosen && s.badgeChosen]}><Ionicons name={chosen ? 'checkmark' : person.isVerified ? 'checkmark-circle' : person.isCreator || person.role === 'creator' ? 'star' : 'eye-outline'} size={10} color={chosen ? colors.bg : colors.blue} /></View></View>
                <Text numberOfLines={1} style={s.personName}>{firstName(userName(person))}</Text>
              </Pressable>;
            })}</View>
            {!loading && !people.length ? <Pressable onPress={() => setRetry(retry + 1)}><Text style={s.empty}>{query ? 'No people found. Try another name.' : 'No suggested recipients yet. Search for someone.'}</Text></Pressable> : null}
            {selected.length ? <Text style={s.selectedLabel}>{selected.length} selected · {selected.map((person) => firstName(userName(person))).join(', ')}</Text> : null}
          </>}
          {notice ? <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text> : null}
        </ScrollView>
        {!storyConfirm && (selected.length ? <View style={s.compose}><View style={s.messageEmojis}>{['❤️', '😂', '🔥', '😍', '👏', '😮', '🙏', '🤝'].map((emoji) => <Pressable accessibilityLabel={`Add ${emoji} to message`} disabled={Boolean(pending)} key={emoji} onPress={() => { setMessage((old) => old.length + emoji.length <= 2000 ? old + emoji : old); messageInput.current?.focus(); }}><Text style={s.emoji}>{emoji}</Text></Pressable>)}</View><View style={s.messageRow}><TextInput ref={messageInput} maxLength={2000} editable={!pending} accessibilityLabel="Message to send with Seen" onChangeText={setMessage} placeholder="Write a message…" placeholderTextColor={colors.faint} style={s.messageInput} value={message} /><Pressable accessibilityLabel="Send Seen to selected people" disabled={Boolean(pending)} onPress={send} style={s.send}>{pending === 'send' ? <ActivityIndicator color={colors.bg} /> : <Text style={s.sendText}>Send</Text>}</Pressable></View></View> : <View style={s.external}>
          <External label="Story" icon="plus-circle" disabled={Boolean(pending)} onPress={() => { Keyboard.dismiss(); setStoryConfirm(true); }} />
          <External label="Copy link" icon="copy" disabled={Boolean(pending)} onPress={() => run('copy', async () => { await Clipboard.setStringAsync(url); setNotice('Link copied'); })} />
          <External label="WhatsApp" icon="whatsapp" disabled={Boolean(pending)} onPress={() => external('whatsapp', `whatsapp://send?text=${encodeURIComponent(shareText)}`)} />
          <External label="Telegram" icon="send" disabled={Boolean(pending)} onPress={() => external('telegram', `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`)} />
          <External label="Messages" icon="message-circle" disabled={Boolean(pending)} onPress={() => external('messages', `sms:${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(shareText)}`)} />
          <External label="More" icon="more-horizontal" disabled={Boolean(pending)} onPress={() => run('more', async () => { Keyboard.dismiss(); await nativeShare(); })} />
        </View>)}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function External({ label, icon, onPress, disabled }: { label: string; icon: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.externalAction, disabled && s.disabled]}><View style={s.externalIcon}>{icon === 'plus-circle' ? <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={1.7} strokeLinecap="round"><Circle cx={12} cy={12} r={9} strokeDasharray="4 3" /><Path d="M12 8.5v7M8.5 12h7" /></Svg> : icon === 'whatsapp' ? <Ionicons name="logo-whatsapp" color={colors.muted} size={20} /> : <Feather name={icon as keyof typeof Feather.glyphMap} color={colors.muted} size={19} />}</View><Text numberOfLines={1} style={s.externalLabel}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' }, scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.65)' }, sheet: { maxHeight: '92%', backgroundColor: '#0C1014', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20 }, handle: { width: 36, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.3)', alignSelf: 'center', marginTop: 13, marginBottom: 22 }, content: { paddingBottom: 4 }, heading: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -.5, marginBottom: 14 }, section: { color: colors.faint, fontSize: 10.5, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }, preview: { alignSelf: 'flex-end', borderRadius: 22, borderBottomRightRadius: 7, overflow: 'hidden', backgroundColor: '#1C2432' }, previewMedia: { height: 156, alignItems: 'center', justifyContent: 'center' }, previewAvatar: { padding: 3, borderRadius: 42, borderWidth: 2, borderColor: 'rgba(156,203,255,.5)' }, previewCopy: { paddingHorizontal: 14, paddingVertical: 12 }, previewTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800' }, previewSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, previewDomain: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }, domain: { color: colors.faint, fontSize: 10 }, recipientHeading: { marginTop: 20 }, search: { minHeight: 42, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', backgroundColor: 'rgba(255,255,255,.025)' }, searchInput: { minHeight: 42, paddingHorizontal: 16, paddingVertical: 10, color: colors.text, fontSize: 13 }, people: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 14 }, loader: { flex: 1, minHeight: 175 }, person: { width: '25%', alignItems: 'center', marginBottom: 16 }, avatarRing: { width: 58, height: 58, borderRadius: 30, borderWidth: 2, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, avatarChosen: { borderColor: '#fff', backgroundColor: 'rgba(156,203,255,.15)' }, badge: { position: 'absolute', right: -3, bottom: -3, width: 19, height: 19, borderRadius: 10, backgroundColor: '#0C1014', borderWidth: 1, borderColor: 'rgba(156,203,255,.5)', alignItems: 'center', justifyContent: 'center' }, badgeChosen: { backgroundColor: colors.blue }, personName: { color: colors.muted, fontSize: 10, marginTop: 7, maxWidth: '90%' }, empty: { color: colors.faint, fontSize: 12, lineHeight: 18, paddingVertical: 15, textAlign: 'center' }, selectedLabel: { color: colors.blue, fontSize: 11, paddingBottom: 10 }, external: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.055)', paddingTop: 14, marginTop: 2 }, externalAction: { width: '16.666%', alignItems: 'center' }, externalIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', backgroundColor: '#181D25', alignItems: 'center', justifyContent: 'center' }, externalLabel: { fontSize: 8.5, color: colors.faint, fontWeight: '600', marginTop: 5 }, disabled: { opacity: .4 }, notice: { color: colors.blue, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingVertical: 10 }, compose: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }, messageEmojis: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10 }, emoji: { fontSize: 21 }, messageRow: { flexDirection: 'row', gap: 9 }, messageInput: { flex: 1, borderRadius: 99, minHeight: 44, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,.05)', color: colors.text, fontSize: 13 }, send: { borderRadius: 99, minHeight: 44, paddingHorizontal: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, sendText: { color: colors.bg, fontSize: 13, fontWeight: '800' }, storyConfirmation: { paddingVertical: 22 }, storyActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 }, cancel: { paddingHorizontal: 16, justifyContent: 'center' }, cancelText: { color: colors.muted, fontSize: 13 },
});
