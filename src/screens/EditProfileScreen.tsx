import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api, WEB_BASE_URL } from '../services/api';
import type { UnifiedProfile } from '../types';
import { ProfileStatusScreen } from './ProfileStatusScreen';
import { Avatar } from '../components/Avatar';
import { ProfileForm } from '../components/profile/ProfileSheets';
import { colors } from '../theme';

type Props = { profile: UnifiedProfile['profile']; onClose: () => void; onSaved: () => void; openWeb: (path: string) => void };
const languages = [['en', 'English'], ['ar', 'Arabic'], ['ru', 'Russian'], ['es', 'Spanish'], ['fr', 'French'], ['pt', 'Portuguese']];
export function EditProfileScreen({ profile, onClose, onSaved, openWeb }: Props) {
  const [first, setFirst] = useState(''), [last, setLast] = useState(''), [username, setUsername] = useState('');
  const [bio, setBio] = useState(''), [location, setLocation] = useState(''), [language, setLanguage] = useState('en');
  const [website, setWebsite] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [whatsapp, setWhatsapp] = useState('');
  const [avatar, setAvatar] = useState(profile.avatar), [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [privacy, setPrivacy] = useState<Record<string, string | boolean>>({});
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  const [gifts, setGifts] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [original, setOriginal] = useState<Awaited<ReturnType<typeof api.getEditProfile>> | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [panel, setPanel] = useState<'status' | 'direct' | 'gifts' | 'notifications' | null>(null);
  const locked = useRef(false), dirty = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [details, settings, notices, giftSettings] = await Promise.all([api.getEditProfile(), api.getPrivacy(), api.getNotificationSettings(), api.getGiftSettings()]);
      if (!alive.current) return;
      const p = details.profile, names = p.displayName.trim().split(/\s+/);
      setOriginal(details); setFirst(names.shift() || ''); setLast(names.join(' ')); setUsername(p.username);
      setBio(p.bio || ''); setLocation([p.city, p.country].filter(Boolean).join(', ')); setLanguage(p.preferredLanguage || 'en');
      setWebsite(p.socialLinks?.[0]?.url || ''); setEmail(details.account.email); setPhone(p.phoneNumber || ''); setWhatsapp(p.whatsapp || '');
      setAvatar(p.profilePhoto); setPrivacy(settings.privacySettings); setNotifications(notices.notificationPreferences); setGifts(giftSettings.gifts);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not load profile.'); }
    finally { if (alive.current) setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const close = () => { if (locked.current) return; if (dirty.current) Alert.alert('Discard changes?', 'Your unsaved profile edits will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: onClose }]); else onClose(); };
  const changePhoto = async () => {
    try {
      if (!(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted) throw new Error('Allow photo access to change your profile photo.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .85 });
      if (!result.canceled && result.assets[0]) { dirty.current = true; setPhoto(result.assets[0]); setAvatar(result.assets[0].uri); }
    } catch (e) { Alert.alert('Profile photo', String(e)); }
  };
  const save = async () => {
    if (locked.current || !original) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const displayName = [first.trim(), last.trim()].filter(Boolean).join(' '), handle = username.trim().replace(/^@+/, '').toLowerCase();
      if (!first.trim() || displayName.length > 50) throw new Error('Enter a first name. Your full name must be 50 characters or fewer.');
      if (!/^[a-z0-9_.]{1,30}$/.test(handle)) throw new Error('Use up to 30 letters, numbers, underscores or periods for your username.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address.');
      let url = website.trim();
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (url && !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Enter a valid website address.');
      const oldLocation = [original.profile.city, original.profile.country].filter(Boolean).join(', ');
      const parts = location.split(',').map((v) => v.trim());
      const links = [...(original.profile.socialLinks || [])];
      if (url) links.splice(0, 1, { platform: links[0]?.platform || 'Website', url }); else links.splice(0, 1);
      await api.updateProfile({ displayName, username: handle, bio, email: email.trim(), phoneNumber: phone.trim(), whatsapp: whatsapp.trim(), preferredLanguage: language,
        ...(location !== oldLocation ? { city: parts[0] || '', country: parts.slice(1).join(', ') } : {}), ...(profile.isCreator ? { socialLinks: links } : {}) });
      await api.updatePrivacy(privacy);
      await api.updateNotificationSettings(notifications);
      await api.updateGiftSettings(gifts.filter((g) => g.enabled).map((g) => g.id));
      if (photo) await api.uploadAvatar({ uri: photo.uri, name: photo.fileName || 'avatar.jpg', type: photo.mimeType || 'image/jpeg' });
      dirty.current = false; onSaved(); onClose();
    } catch (e) { setError(`${e instanceof Error ? e.message : 'Could not save profile.'} Any settings already saved are retained; retry to finish.`); }
    finally { locked.current = false; setBusy(false); }
  };
  const field = (label: string, value: string, setter: (v: string) => void, options: { multiline?: boolean; maxLength?: number; placeholder?: string; keyboardType?: 'email-address' | 'phone-pad' | 'url' } = {}) => <View><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} editable={!busy} value={value} onChangeText={(v) => { dirty.current = true; setter(v); }} autoCapitalize={['USERNAME', 'EMAIL', 'WEBSITE'].includes(label) ? 'none' : 'sentences'} placeholderTextColor={colors.faint} style={[s.input, options.multiline && s.bio]} {...options} /></View>;
  const row = (title: string, detail: string, onPress: () => void) => <Pressable disabled={busy} onPress={onPress} style={s.row}><View style={s.flex}><Text style={s.rowTitle}>{title}</Text>{detail ? <Text style={s.help}>{detail}</Text> : null}</View><Feather name="chevron-right" size={18} color={colors.faint} /></Pressable>;
  const segment = (question: string, key: string, values: string[], help?: string) => <View><Text style={s.question}>{question}</Text><View style={s.segment}>{values.map((value) => <Pressable disabled={busy} accessibilityRole="button" accessibilityState={{ selected: (privacy[key] || 'everyone') === value }} key={value} onPress={() => { dirty.current = true; setPrivacy((old) => ({ ...old, [key]: value })); }} style={[s.choice, (privacy[key] || 'everyone') === value && s.selected]}><Text style={[s.choiceText, (privacy[key] || 'everyone') === value && s.white]}>{value === 'only_me' ? 'Only me' : value === 'followers' ? 'Followers' : 'Everyone'}</Text></Pressable>)}</View>{help ? <Text style={s.help}>{help}</Text> : null}</View>;
  return <Modal animationType="slide" onRequestClose={close}><SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={s.header}><Pressable accessibilityLabel="Back" onPress={close} style={s.back}><Feather name="chevron-left" color={colors.text} size={25} /></Pressable><Text style={s.title}>Edit Profile</Text></View>
    {loading ? <ActivityIndicator style={s.loader} color={colors.blue} /> : !original ? <View style={s.body}><Text style={s.error}>{error}</Text>{row('Retry', '', load)}</View> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
      <View style={s.photoRow}><Avatar user={{ ...profile, avatar }} size={56} /><View style={s.flex}><Text style={s.rowTitle}>Profile photo</Text><Text style={s.help}>Square works best</Text></View><Pressable disabled={busy} onPress={changePhoto} style={s.change}><Text style={s.changeText}>Change</Text></Pressable></View>
      {field('FIRST NAME', first, setFirst, { maxLength: 50 })}{field('LAST NAME', last, setLast, { maxLength: 50 })}{field('USERNAME', `@${username.replace(/^@+/, '')}`, setUsername, { maxLength: 31 })}<Text style={s.help}>Your profile link is created automatically from your username · {WEB_BASE_URL.replace(/^https?:\/\//, '')}/profile/{username.replace(/^@+/, '')}</Text>
      {field('BIO', bio, setBio, { multiline: true, maxLength: 120 })}<Text style={s.help}>Max 120 — shown right under your name</Text>
      {field('LOCATION', location, setLocation, { maxLength: 162, placeholder: 'City, Country' })}<Text style={s.label}>LANGUAGES</Text><View style={s.languageWrap}>{languages.map(([code, name]) => <Pressable disabled={busy} key={code} onPress={() => { dirty.current = true; setLanguage(code); }} style={[s.language, language === code && s.selected]}><Text style={language === code ? s.white : s.choiceText}>{name}</Text></Pressable>)}</View><Text style={s.help}>Preferred language</Text>
      {profile.isCreator ? field('WEBSITE', website, setWebsite, { keyboardType: 'url', maxLength: 300, placeholder: 'One external link — site, Instagram, YouTube' }) : null}
      <Text style={s.section}>Contact Options</Text>{field('EMAIL', email, setEmail, { keyboardType: 'email-address', maxLength: 254 })}{field('PHONE NUMBER', phone, setPhone, { keyboardType: 'phone-pad', maxLength: 40 })}{field('WHATSAPP', whatsapp, setWhatsapp, { keyboardType: 'phone-pad', maxLength: 40 })}
      <Text style={s.section}>Settings</Text>{row('Status', profile.activeStatus?.label || '', () => setPanel('status'))}{profile.isCreator ? row('Direct Access settings', profile.directAccess?.enabled ? 'On · replies within 48h' : 'Off', () => setPanel('direct')) : null}{row('Gift settings', `${gifts.filter((g) => g.enabled).length}/${gifts.length} gifts enabled`, () => setPanel('gifts'))}{row('Notifications', 'Support · Comments · Messages', () => setPanel('notifications'))}
      <Text style={s.label}>PRIVACY</Text>{segment('Who can see your saved places?', 'savedPlacesVisibility', ['everyone', 'followers', 'only_me'])}{segment('Show your 🪐 member badge on comments?', 'showMemberBadge', ['everyone', 'only_me'], 'Your member number is always private — only you see it')}{segment('Who can see your orbit?', 'orbitVisibility', ['everyone', 'followers', 'only_me'], 'Your orbit only ever shows public ties — follows and open dream support. Messages and private signals never appear to others.')}
      <Text style={s.label}>VERIFICATION</Text>{row(profile.verified ? 'Verified ✓' : 'Get verified', profile.verified ? 'The badge shows next to your name' : 'A checkmark next to your name — trust at first glance', () => openWeb('/creator/verified'))}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<Pressable disabled={busy} onPress={save} style={[s.save, busy && { opacity: .6 }]}>{busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.saveText}>Save</Text>}</Pressable>
    </ScrollView>}
    {panel === 'status' ? <ProfileStatusScreen profile={profile} onClose={() => setPanel(null)} onSaved={onSaved} /> : panel === 'direct' ? <ProfileForm profile={profile} kind={panel} onClose={() => setPanel(null)} onSaved={onSaved} /> : panel ? <Modal animationType="slide" onRequestClose={() => setPanel(null)}><SafeAreaView style={s.safe}><View style={s.header}><Pressable onPress={() => setPanel(null)} style={s.back}><Feather name="chevron-left" color={colors.text} size={25} /></Pressable><Text style={s.title}>{panel === 'gifts' ? 'Gift settings' : 'Notifications'}</Text></View><ScrollView contentContainerStyle={s.body}>{panel === 'gifts' ? gifts.map((gift) => <View key={gift.id} style={s.row}><Text style={[s.rowTitle, s.flex]}>{gift.name}</Text><Switch value={gift.enabled} onValueChange={(enabled) => { dirty.current = true; setGifts((old) => old.map((g) => g.id === gift.id ? { ...g, enabled } : g)); }} /></View>) : Object.entries(notifications).map(([key, value]) => <View key={key} style={s.row}><Text style={[s.rowTitle, s.flex]}>{key === 'inApp' ? 'In-app notifications' : key.charAt(0).toUpperCase() + key.slice(1)}</Text><Switch value={value} onValueChange={(enabled) => { dirty.current = true; setNotifications((old) => ({ ...old, [key]: enabled })); }} /></View>)}<Pressable onPress={() => setPanel(null)} style={s.save}><Text style={s.saveText}>Done</Text></Pressable><Text style={s.help}>Tap Save on Edit Profile to apply these changes.</Text></ScrollView></SafeAreaView></Modal> : null}
  </KeyboardAvoidingView></SafeAreaView></Modal>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#0A0D10' }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 14 }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1B1E21', alignItems: 'center', justifyContent: 'center' }, title: { color: '#FFF', fontSize: 19, fontWeight: '700' }, body: { paddingHorizontal: 22, paddingBottom: 45 }, photoRow: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 4, marginBottom: 4 }, rowTitle: { color: '#FFF', fontSize: 13.5, fontWeight: '700' }, help: { color: '#737B86', fontSize: 10.5, lineHeight: 17, marginTop: 6 }, change: { borderRadius: 22, borderWidth: 1, borderColor: '#292F38', backgroundColor: '#181E26', paddingHorizontal: 15, paddingVertical: 9 }, changeText: { color: '#FFF', fontSize: 13, fontWeight: '700' }, label: { color: '#737B86', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.5, marginTop: 20, marginBottom: 10 }, input: { color: '#FFF', fontSize: 13.5, minHeight: 49, borderRadius: 14, borderWidth: 1, borderColor: '#252A31', backgroundColor: '#11151B', paddingHorizontal: 17, paddingVertical: 14 }, bio: { minHeight: 70, textAlignVertical: 'top' }, section: { color: '#FFF', fontSize: 14, fontWeight: '700', marginTop: 25, marginBottom: 4 }, row: { flexDirection: 'row', alignItems: 'center', minHeight: 65, gap: 14, paddingVertical: 12 }, question: { color: '#C2C8D0', fontSize: 12, marginTop: 17 }, segment: { flexDirection: 'row', marginTop: 10, padding: 3, borderRadius: 13, borderWidth: 1, borderColor: '#252A31', backgroundColor: '#11151B' }, choice: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 35, borderRadius: 10 }, choiceText: { color: '#737B86', fontSize: 11.5, fontWeight: '700' }, selected: { backgroundColor: '#272C33' }, white: { color: '#FFF', fontSize: 11.5, fontWeight: '700' }, languageWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, language: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: '#11151B', borderWidth: 1, borderColor: '#252A31' }, save: { marginTop: 20, backgroundColor: '#9CCBFF', borderRadius: 14, minHeight: 49, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#090C10', fontSize: 14, fontWeight: '700' }, error: { color: '#FF8C8C', marginVertical: 10, lineHeight: 19 }, loader: { marginTop: 50 } });
