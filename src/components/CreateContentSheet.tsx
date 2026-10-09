import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { colors } from '../theme';
import { StoryComposer } from './StoryComposer';
import { SeenComposer } from './SeenComposer';

type Kind = 'seen' | 'experience' | 'story' | 'note' | 'world';
type Asset = { uri: string; name: string; type: string };
type Chapter = { title: string; text: string };
const choices: { kind: Kind; icon: keyof typeof Ionicons.glyphMap; title: string }[] = [
  { kind: 'seen', icon: 'eye-outline', title: 'Seen' },
  { kind: 'experience', icon: 'trail-sign-outline', title: 'Experience' },
  { kind: 'story', icon: 'radio-button-on-outline', title: 'Story' },
  { kind: 'note', icon: 'create-outline', title: 'Note' },
  { kind: 'world', icon: 'planet-outline', title: 'World' },
];
const noteContexts = ['RIGHT_NOW', 'COFFEE', 'PLACE', 'TRAVEL', 'FITNESS'];

export function CreateContentSheet({ accessToken, visible, onClose, onCreated }: { accessToken: string; visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [note, setNote] = useState('');
  const [location, setLocation] = useState('');
  const [context, setContext] = useState('RIGHT_NOW');
  const [category, setCategory] = useState('Lifestyle');
  const [categories, setCategories] = useState(['Places', 'Moving', 'Business', 'Growth', 'Lifestyle']);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) api.listSeenCategories(accessToken).then((data) => setCategories(data.categories.map((item) => item.name))).catch(() => undefined);
  }, [accessToken, visible]);

  const reset = () => {
    setKind(null); setAsset(null); setTitle(''); setSummary(''); setChapters([]); setNote(''); setLocation('');
    setContext('RIGHT_NOW'); setCategory('Lifestyle'); setCategoryOpen(false); setPreviewing(false); setError('');
  };
  const close = () => { if (!busy) { reset(); onClose(); } };
  const chooseKind = (next: Kind) => {
    if (next === 'experience' || next === 'world') return setError(`${next === 'world' ? 'World' : 'Experience'} creation is coming next.`);
    setError(''); setKind(next);
  };
  const pick = async (media: 'photo' | 'video', maxSeconds?: number) => {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError('Photo library permission is required.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [media === 'video' ? 'videos' : 'images'], quality: .9, allowsEditing: media === 'photo' });
    if (result.canceled) return;
    const chosen = result.assets[0];
    if (maxSeconds && chosen.duration && chosen.duration > maxSeconds * 1000) return setError(`Choose a video that is ${maxSeconds} seconds or shorter.`);
    setAsset({ uri: chosen.uri, name: chosen.fileName || `seen-${Date.now()}.${media === 'video' ? 'mp4' : 'jpg'}`, type: chosen.mimeType || (media === 'video' ? 'video/mp4' : 'image/jpeg') });
  };
  const updateChapter = (index: number, field: keyof Chapter, value: string) => setChapters((items) => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  const publish = async () => {
    setError('');
    if (kind === 'seen' && (!asset || !title.trim() || !summary.trim())) return setError('Add a cover, title, and description.');
    if (kind === 'seen' && (!chapters.length || chapters.some((chapter) => !chapter.title.trim() || !chapter.text.trim()))) return setError('Every chapter needs a name and story.');
    if (kind === 'note' && !note.trim()) return setError('Write something for your Note.');
    setBusy(true);
    try {
      if (kind === 'seen' && asset) {
        const draft = (await api.createSeenDraft({ title: title.trim(), summary: summary.trim(), category }, accessToken)).publication;
        const cover = await api.uploadSeenCover(draft.id, asset, draft.statusVersion, accessToken);
        let version = cover.publication.statusVersion;
        for (const chapter of chapters) { await api.addSeenChapter(draft.id, chapter.title.trim(), [{ id: `text-${Date.now()}`, type: 'TEXT', order: 0, text: chapter.text.trim() }], version, accessToken); version += 1; }
        await api.submitSeen(draft.id, version, accessToken);
      }
      if (kind === 'note') await api.createNote(note.trim(), context, location.trim(), asset, accessToken);
      reset(); onClose(); onCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not publish.'); }
    finally { setBusy(false); }
  };

  if (visible && kind === 'story') return <Modal animationType="fade" onRequestClose={() => setKind(null)} visible><StoryComposer accessToken={accessToken} onBack={() => setKind(null)} onDone={() => { reset(); onClose(); onCreated(); }} /></Modal>;
  if (visible && kind === 'seen') return <Modal animationType="slide" onRequestClose={() => setKind(null)} visible><SeenComposer accessToken={accessToken} onBack={() => setKind(null)} onPublished={() => { reset(); onClose(); onCreated(); }} /></Modal>;
  if (false && visible && kind === 'seen' && asset) return <Modal animationType="slide" onRequestClose={() => setKind(null)} visible>{previewing ? <SeenPreview asset={asset} chapters={chapters} summary={summary} title={title} onBack={() => setPreviewing(false)} /> : <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.composer}>
    <View style={s.head}><Pressable onPress={() => setKind(null)} style={s.round}><Ionicons color="#fff" name="chevron-back" size={22} /></Pressable><View style={s.headCopy}><Text style={s.headTitle}>New Seen</Text><Text numberOfLines={1} style={s.intro}>Seen — a post made of chapters. People walk it like a small story.</Text></View>{chapters.length ? <Pressable onPress={() => setPreviewing(true)} style={s.pill}><Ionicons color={colors.muted} name="eye-outline" size={13} /><Text style={s.pillText}>Preview</Text></Pressable> : null}</View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {asset ? <View style={s.cover}>{asset!.type.startsWith('image/') ? <Image resizeMode="cover" source={{ uri: asset!.uri }} style={StyleSheet.absoluteFill} /> : <View style={s.video}><Ionicons color={colors.blue} name="videocam-outline" size={34} /><Text style={s.videoText}>{asset!.name}</Text></View>}<LinearGradient colors={['transparent', 'rgba(5,7,10,.82)']} style={StyleSheet.absoluteFill} /><Pressable onPress={() => setAsset(null)} style={s.remove}><Ionicons color="#fff" name="close" size={15} /></Pressable></View> : <View style={s.mediaRow}><MediaChoice icon="videocam-outline" label="Video · 0:15" onPress={() => pick('video', 15)} /><MediaChoice icon="videocam-outline" label="Video · 0:30" onPress={() => pick('video', 30)} /><MediaChoice icon="image-outline" label="Photo" onPress={() => pick('photo')} /></View>}
      <TextInput maxLength={120} onChangeText={setTitle} placeholder="Title — e.g. ‘A quiet morning’" placeholderTextColor={colors.faint} style={s.titleInput} value={title} />
      <TextInput maxLength={300} multiline onChangeText={setSummary} placeholder="About this Seen — what happens inside, honestly" placeholderTextColor={colors.faint} style={s.descInput} textAlignVertical="top" value={summary} />
      <View style={s.sectionHead}><Text style={s.label}>CHAPTERS</Text><Text style={s.count}>{chapters.length}/5 · like a post — short</Text></View><Text style={s.help}>A chapter: photo · text · marker · voice — up to 6 blocks, one thought. Long chapters scroll.</Text>
      <View style={s.chapterList}>{chapters.map((chapter, index) => <View key={index} style={s.chapter}><View style={s.chapterTop}><View style={s.number}><Text style={s.numberText}>{index + 1}</Text></View><TextInput maxLength={120} onChangeText={(value) => updateChapter(index, 'title', value)} placeholder="Chapter name" placeholderTextColor={colors.faint} style={s.chapterTitle} value={chapter.title} /><Pressable onPress={() => setChapters((items) => items.filter((_, i) => i !== index))}><Ionicons color={colors.faint} name="close" size={17} /></Pressable></View><TextInput maxLength={2000} multiline onChangeText={(value) => updateChapter(index, 'text', value)} placeholder="＋ Write the story" placeholderTextColor={colors.blue} style={s.chapterText} textAlignVertical="top" value={chapter.text} /></View>)}{chapters.length < 5 ? <Pressable onPress={() => setChapters((items) => [...items, { title: '', text: '' }])} style={s.addChapter}><Text style={s.addText}>＋ {chapters.length ? 'Add chapter' : 'Chapter 1 — where it starts'}</Text></Pressable> : null}</View>
      <View style={s.settings}><SettingRow icon="pricetag-outline" label="Category" onPress={() => setCategoryOpen((value) => !value)} value={category} />{categoryOpen ? <View style={s.chips}>{categories.map((item) => <Chip active={category === item} key={item} label={item} onPress={() => { setCategory(item); setCategoryOpen(false); }} />)}</View> : null}<SettingRow icon="people-outline" label="Audience" value="Everyone" /></View>
      {error ? <Text style={s.error}>{error}</Text> : null}<Pressable disabled={busy} onPress={publish} style={s.publish}><LinearGradient colors={['#A9D4FF', '#77B4F0']} style={s.publishInner}>{busy ? <ActivityIndicator color="#07101A" /> : <Text style={s.publishText}>Publish</Text>}</LinearGradient></Pressable>
    </ScrollView>
  </KeyboardAvoidingView>}</Modal>;

  if (visible && kind === 'note') return <Modal animationType="slide" onRequestClose={() => setKind(null)} visible><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.composer}><View style={s.head}><Pressable onPress={() => setKind(null)} style={s.round}><Ionicons color="#fff" name="chevron-back" size={22} /></Pressable><View style={s.headCopy}><Text style={s.headTitle}>New Note</Text></View><Pressable disabled={busy} onPress={publish}><Text style={s.headerAction}>Publish</Text></Pressable></View><ScrollView contentContainerStyle={s.content}><TextInput maxLength={1200} multiline onChangeText={setNote} placeholder="What’s happening?" placeholderTextColor={colors.faint} style={[s.descInput, s.noteInput]} value={note} /><Pressable onPress={() => pick('photo')} style={s.noteMedia}><Ionicons color={colors.blue} name="image-outline" size={20} /><Text style={s.noteMediaText}>{asset ? 'Change photo' : 'Add optional photo'}</Text></Pressable>{asset ? <Image source={{ uri: asset.uri }} style={s.noteImage} /> : null}<Text style={[s.label, { marginTop: 20 }]}>CONTEXT</Text><View style={s.chips}>{noteContexts.map((item) => <Chip active={context === item} key={item} label={item.replace('_', ' ')} onPress={() => setContext(item)} />)}</View><TextInput onChangeText={setLocation} placeholder="Location (optional)" placeholderTextColor={colors.faint} style={s.titleInput} value={location} />{error ? <Text style={s.error}>{error}</Text> : null}</ScrollView></KeyboardAvoidingView></Modal>;

  return <Modal animationType="fade" onRequestClose={close} transparent visible={visible}><View style={s.menuOverlay}><Pressable onPress={close} style={StyleSheet.absoluteFill} /><View style={s.menu}>{choices.map((item) => <Pressable key={item.kind} onPress={() => chooseKind(item.kind)} style={({ pressed }) => [s.menuItem, pressed && s.menuPressed]}><Ionicons color={colors.muted} name={item.icon} size={20} /><Text style={s.menuText}>{item.title}</Text></Pressable>)}{error ? <Text style={s.menuError}>{error}</Text> : null}</View></View></Modal>;
}

function MediaChoice({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={s.mediaChoice}><Ionicons color={colors.blue} name={icon} size={20} /><Text style={s.mediaText}>{label}</Text></Pressable>; }
function SettingRow({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress?: () => void }) { return <Pressable disabled={!onPress} onPress={onPress} style={s.settingRow}><Ionicons color={colors.faint} name={icon} size={17} /><Text style={s.settingLabel}>{label}</Text><Text style={s.settingValue}>{value}</Text>{onPress ? <Ionicons color={colors.faint} name="chevron-forward" size={14} /> : null}</Pressable>; }
function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[s.chip, active && s.chipOn]}><Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text></Pressable>; }
function SeenPreview({ asset, title, summary, chapters, onBack }: { asset: Asset | null; title: string; summary: string; chapters: Chapter[]; onBack: () => void }) { return <View style={s.previewScreen}><ScrollView contentContainerStyle={{ paddingBottom: 50 }}><Pressable onPress={onBack} style={s.previewBack}><Ionicons color="#fff" name="chevron-back" size={23} /></Pressable>{asset?.type.startsWith('image/') ? <Image resizeMode="cover" source={{ uri: asset.uri }} style={s.previewImage} /> : <View style={[s.previewImage, s.video]}><Ionicons color={colors.blue} name="videocam-outline" size={38} /></View>}<Text style={s.previewTitle}>{title || 'Untitled Seen'}</Text><Text style={s.previewSummary}>{summary}</Text>{chapters.map((chapter, index) => <View key={index} style={s.previewChapter}><Text style={s.previewNumber}>{String(index + 1).padStart(2, '0')}</Text><Text style={s.previewChapterTitle}>{chapter.title || `Chapter ${index + 1}`}</Text><Text style={s.previewChapterText}>{chapter.text}</Text></View>)}</ScrollView></View>; }

const s = StyleSheet.create({
  menuOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(4,6,9,.28)', paddingBottom: Platform.OS === 'ios' ? 112 : 94 }, menu: { width: 184, gap: 8 }, menuItem: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, borderRadius: 14, backgroundColor: 'rgba(16,20,27,.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: .45, shadowRadius: 17, elevation: 14 }, menuPressed: { backgroundColor: 'rgba(35,43,56,.98)', transform: [{ scale: .98 }] }, menuText: { color: '#fff', fontSize: 12.5, fontWeight: '600' }, menuError: { color: colors.muted, fontSize: 10.5, textAlign: 'center', backgroundColor: 'rgba(16,20,27,.96)', padding: 8, borderRadius: 10 },
  composer: { flex: 1, backgroundColor: colors.bg }, head: { paddingTop: Platform.OS === 'ios' ? 52 : 18, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.035)' }, round: { width: 38, height: 38, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.07)', alignItems: 'center', justifyContent: 'center' }, headCopy: { minWidth: 0, flex: 1 }, headTitle: { color: '#fff', fontSize: 19, fontWeight: '900' }, intro: { color: colors.faint, fontSize: 9, marginTop: 2 }, pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 }, pillText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' }, headerAction: { color: colors.blue, fontSize: 13, fontWeight: '800' }, content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 54 },
  mediaRow: { flexDirection: 'row', gap: 8 }, mediaChoice: { flex: 1, minHeight: 76, borderRadius: 15, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(156,203,255,.25)', alignItems: 'center', justifyContent: 'center', gap: 7 }, mediaText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' }, cover: { height: 210, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface }, video: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111722', gap: 8 }, videoText: { color: colors.muted, fontSize: 11 }, remove: { position: 'absolute', left: 12, top: 10, width: 29, height: 29, borderRadius: 16, backgroundColor: 'rgba(10,13,18,.66)', alignItems: 'center', justifyContent: 'center' },
  titleInput: { color: '#fff', fontSize: 16.5, fontWeight: '800', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, marginTop: 14 }, descInput: { color: '#fff', fontSize: 13, lineHeight: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 14, minHeight: 84, padding: 14, marginTop: 10 }, noteInput: { minHeight: 170 }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }, label: { color: colors.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1.35 }, count: { color: colors.faint, fontSize: 10 }, help: { color: colors.faint, fontSize: 10, lineHeight: 16, marginTop: 6 }, chapterList: { gap: 9, marginTop: 10 }, chapter: { padding: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, chapterTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, number: { width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(156,203,255,.12)' }, numberText: { color: colors.blue, fontSize: 11, fontWeight: '900' }, chapterTitle: { flex: 1, color: '#fff', fontSize: 13.5, fontWeight: '700', paddingVertical: 4 }, chapterText: { color: colors.muted, fontSize: 12, lineHeight: 18, minHeight: 60, marginLeft: 34, marginTop: 4 }, addChapter: { minHeight: 46, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(156,203,255,.30)', alignItems: 'center', justifyContent: 'center' }, addText: { color: colors.blue, fontSize: 12.5, fontWeight: '700' },
  settings: { marginTop: 18, borderTopWidth: 1, borderTopColor: colors.line }, settingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line }, settingLabel: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: '700' }, settingValue: { color: colors.muted, fontSize: 12.5 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingVertical: 10 }, chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface }, chipOn: { borderColor: colors.blue, backgroundColor: 'rgba(156,203,255,.12)' }, chipText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, chipTextOn: { color: colors.blue }, error: { color: colors.danger, fontSize: 12, textAlign: 'center', marginTop: 14 }, publish: { marginTop: 12, borderRadius: 14, overflow: 'hidden' }, publishInner: { minHeight: 50, alignItems: 'center', justifyContent: 'center' }, publishText: { color: '#07101A', fontSize: 14.5, fontWeight: '900' }, noteMedia: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(156,203,255,.22)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }, noteMediaText: { color: colors.blue, fontWeight: '800' }, noteImage: { height: 180, borderRadius: 16, marginTop: 10 },
  previewScreen: { flex: 1, backgroundColor: '#07090D' }, previewBack: { position: 'absolute', zIndex: 2, left: 20, top: Platform.OS === 'ios' ? 52 : 20, width: 38, height: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,10,14,.68)' }, previewImage: { width: '100%', height: 380, backgroundColor: colors.surface }, previewTitle: { color: '#fff', fontSize: 27, fontWeight: '900', marginHorizontal: 22, marginTop: 22 }, previewSummary: { color: colors.muted, fontSize: 13, lineHeight: 20, marginHorizontal: 22, marginTop: 8 }, previewChapter: { marginHorizontal: 22, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: colors.line }, previewNumber: { color: colors.blue, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, previewChapterTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 6 }, previewChapterText: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 8 },
});
