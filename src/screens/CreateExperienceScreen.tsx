import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { api, resolveMediaUrl, type ChapterPayload, type ExperienceDraftPayload, type PickedUpload } from '../services/api';
import { colors } from '../theme';
import type { ExperiencePublication, SeenBlock, SeenChapter, Session } from '../types';

const CATEGORIES = ['Travel', 'Fitness', 'Lifestyle', 'Business', 'Tech', 'Psychology', 'Fashion', 'Beauty', 'Wellness', 'Food'];
const PRICE_PRESETS = [90, 190, 290];
const FIRST_PRICES = [150, 300, 500, 900];
const blockTypes = [
  ['IMAGE', 'Photo', 'image-outline'],
  ['VOICE', 'Voice', 'mic-outline'],
  ['KEY_POINT', 'Place', 'location-outline'],
  ['LINK', 'Link', 'link-outline'],
  ['LIST', 'List', 'list-outline'],
  ['POLL', 'Poll', 'stats-chart-outline'],
] as const;
const composerColors = ['#FFFFFF', '#F5E960', '#D6FF5C', '#6ECF97', '#9CCBFF', '#B8A7FF', '#FF7AB8', '#FF8A5C', '#0A0C0F'];
const mediaBlockTypes = new Set(['IMAGE', 'VIDEO', 'AUDIO', 'VOICE']);
const blockMediaType = (type = '') => type === 'IMAGE' ? 'IMAGE' : type === 'VIDEO' ? 'VIDEO' : type === 'VOICE' || type === 'AUDIO' ? 'VOICE' : 'IMAGE';

type Step = 1 | 2 | 3 | 4 | 5;
type AccessMode = 'ONE_TIME';
type LocalBlock = SeenBlock & { localUri?: string; localName?: string; localType?: string };
type LocalChapter = {
  blocks: LocalBlock[];
  free: boolean;
  stableChapterId?: string;
  title: string;
};
type TrustUpload = PickedUpload & { duration?: number };
type ExperienceState = {
  allowDownload: boolean;
  category: string;
  chapters: LocalChapter[];
  coverLocal?: PickedUpload | null;
  coverMedia?: ExperiencePublication['coverMedia'] | null;
  draftId?: string;
  introMedia?: ExperiencePublication['introMedia'] | null;
  path: string;
  price: number;
  previewPhotos: (PickedUpload | null)[];
  previewVideo: TrustUpload | null;
  pricingMode: AccessMode;
  statusVersion?: number;
  title: string;
  voiceHello: TrustUpload | null;
};

const emptyState = (): ExperienceState => ({
  allowDownload: false,
  category: '',
  chapters: [],
  coverLocal: null,
  coverMedia: null,
  path: '',
  price: 190,
  previewPhotos: [null, null, null],
  previewVideo: null,
  pricingMode: 'ONE_TIME',
  title: '',
  voiceHello: null,
});

const id = () => `rn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const words = (chapter: LocalChapter) => chapter.blocks.map((block) => block.text || block.label || '').join(' ').trim().split(/\s+/).filter(Boolean).length;
const coverUri = (state: ExperienceState) => state.coverLocal?.uri || resolveMediaUrl(state.coverMedia?.secureUrl || state.coverMedia?.url || '');
const clock = (seconds = 0) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
const uploadName = (uri: string, fallback: string, extension: string) => {
  const raw = uri.split('/').pop()?.split('?')[0] || '';
  return /\.[a-z0-9]+$/i.test(raw) ? raw : `${fallback}-${Date.now()}.${extension}`;
};
const audioMime = (uri: string) => /\.(webm)$/i.test(uri) ? 'audio/webm' : /\.(ogg)$/i.test(uri) ? 'audio/ogg' : /\.(wav)$/i.test(uri) ? 'audio/wav' : 'audio/mp4';
const transcriptionAudioMime = (uri: string) => /\.(m4a)$/i.test(uri) ? 'audio/m4a' : audioMime(uri);
const videoMime = (asset: ImagePicker.ImagePickerAsset) => asset.mimeType || (/\.(mov)$/i.test(asset.fileName || asset.uri) ? 'video/quicktime' : /\.(webm)$/i.test(asset.fileName || asset.uri) ? 'video/webm' : 'video/mp4');
const transcriptFailureLabel = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Could not transcribe this voice note.';
  if (/Network request failed/i.test(message)) return 'Backend unreachable';
  if (/Unsupported voice recording format/i.test(message)) return 'Unsupported audio format';
  if (/configured/i.test(message)) return 'Transcription not configured';
  if (/timed out/i.test(message)) return 'Transcript timed out';
  if (/sign in/i.test(message)) return 'Sign in again for transcript';
  return message.slice(0, 80);
};

function publicationToState(publication: ExperiencePublication): ExperienceState {
  return {
    allowDownload: Boolean(publication.allowDownload),
    category: publication.category || '',
    chapters: (publication.chapters || []).map((chapter) => ({
      blocks: (chapter.blocks || []).map((block) => ({ ...block })),
      free: false,
      stableChapterId: chapter.stableChapterId,
      title: chapter.title || '',
    })),
    coverLocal: null,
    coverMedia: publication.coverMedia || null,
    draftId: String(publication.id || publication._id || ''),
    introMedia: publication.introMedia || null,
    path: publication.experiencePath || publication.summary || publication.description || '',
    price: Number.isSafeInteger(publication.pricing?.starsAmount) && Number(publication.pricing?.starsAmount) >= 10 ? Number(publication.pricing?.starsAmount) : 190,
    previewPhotos: [null, null, null],
    previewVideo: null,
    pricingMode: 'ONE_TIME',
    statusVersion: publication.statusVersion,
    title: publication.title || '',
    voiceHello: null,
  };
}

function pricing(state: ExperienceState): ExperienceDraftPayload['pricing'] {
  if (!Number.isSafeInteger(state.price) || state.price < 10) throw new Error('Experience price must be at least 10 Stars.');
  return { mode: 'ONE_TIME', presetId: `ONE_TIME_${state.price}`, starsAmount: state.price };
}

function draftPayload(state: ExperienceState, statusVersion?: number): ExperienceDraftPayload {
  return {
    allowDownload: state.allowDownload,
    category: state.category,
    commentsEnabled: true,
    description: state.path,
    experiencePath: state.path,
    pricing: pricing(state),
    statusVersion,
    summary: state.path || state.title,
    tags: [],
    title: state.title,
  };
}

function chapterPayload(chapter: LocalChapter, index: number, state: ExperienceState, statusVersion: number, blocksOverride?: SeenBlock[]): ChapterPayload {
  return {
    blocks: (blocksOverride || chapter.blocks)
      .filter((block) => !mediaBlockTypes.has(String(block.type || '').toUpperCase()) || block.media?.assetId || block.media?.secureUrl || block.media?.url)
      .map((input, order) => {
        const { localName, localType, localUri, ...block } = input as LocalBlock;
        return { ...block, order };
      }),
    isPreview: false,
    releaseMode: 'IMMEDIATE',
    statusVersion,
    title: chapter.title || `Chapter ${index + 1}`,
  };
}

function Header({ canPreview, onBack, onPreview, onSave, saving, step, state, subtitle, title }: { canPreview?: boolean; onBack: () => void; onPreview?: () => void; onSave?: () => void; saving?: boolean; step: Step; state: ExperienceState; subtitle?: string; title: string }) {
  return <><View style={styles.header}><Pressable onPress={onBack} style={styles.back}><Ionicons color={colors.text} name="chevron-back" size={22} /></Pressable><View style={styles.headerCopy}><Text style={styles.headerTitle}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={styles.headerSub}>{subtitle}</Text> : null}</View>{canPreview ? <Pressable onPress={onPreview} style={styles.headerPill}><Ionicons color={colors.muted} name="eye-outline" size={12} /><Text style={styles.headerPillText}>Preview</Text></Pressable> : null}{state.title || state.category || state.chapters.length ? <Pressable disabled={saving} onPress={onSave} style={styles.headerPill}>{saving ? <ActivityIndicator color={colors.blue} size="small" /> : <Text style={styles.headerPillText}>Save for later</Text>}</Pressable> : null}</View><View style={styles.dots}>{[1, 2, 3, 4, 5].map((item) => <View key={item} style={[styles.dot, item <= step && styles.dotOn, item === step && styles.dotActive]} />)}</View></>;
}

function Pill({ active, children, onPress }: { active?: boolean; children: ReactNode; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.pill, active && styles.pillOn]}><Text style={[styles.pillText, active && styles.pillTextOn]}>{children}</Text></Pressable>;
}

function Primary({ busy, children, disabled, onPress }: { busy?: boolean; children: ReactNode; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled || busy} onPress={onPress} style={[styles.primary, (disabled || busy) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>{children}</Text>}</Pressable>;
}

export function CreateExperienceScreen({ onClose, onPublished, session }: { onClose: () => void; onPublished: () => void; session: Session }) {
  const [state, setState] = useState<ExperienceState>(() => emptyState());
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadedDraft, setLoadedDraft] = useState(false);
  const [chapterInput, setChapterInput] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [success, setSuccess] = useState<ExperiencePublication | null>(null);
  const canPreview = state.chapters.length > 0;
  const title = step === 1 ? 'Name your Experience' : step === 2 ? 'Build the chapters' : step === 3 ? 'Access' : step === 4 ? 'One last look' : 'Your Experience is live';
  const subtitle = step === 1 ? 'A stage of life - with a beginning and a result' : step === 2 ? state.title : step === 3 ? state.title : step === 4 ? 'Exactly what people will see' : '';

  const showError = (message: string) => { setError(message); Alert.alert('Experience', message); };

  useEffect(() => {
    if (loadedDraft) return;
    setLoadedDraft(true);
    api.listMyExperienceDrafts(session.accessToken).then((result) => {
      const draft = result.items?.[0];
      if (draft?.id) setState(publicationToState(draft));
    }).catch(() => undefined);
  }, [loadedDraft, session.accessToken]);

  const dirty = Boolean(state.title.trim() || state.path.trim() || state.category || state.chapters.length || state.coverLocal || state.coverMedia || state.previewVideo || state.voiceHello || state.previewPhotos.some(Boolean));
  const goBack = useCallback(() => {
    if (success) { onPublished(); onClose(); return true; }
    if (editing !== null) { setEditing(null); return true; }
    if (step > 1) { setStep((current) => (current - 1) as Step); return true; }
    if (!dirty) { onClose(); return true; }
    Alert.alert('Save draft?', 'Keep this Experience for later or discard it?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
      { text: 'Save for later', onPress: () => saveDraft().then(() => onClose()).catch((reason) => showError(reason instanceof Error ? reason.message : 'Draft save failed')) },
    ]);
    return true;
  }, [dirty, editing, onClose, onPublished, step, success]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [goBack]);

  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return showError('Photo library permission is needed to upload a cover.');
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [16, 9], mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: .82 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    setState((current) => ({ ...current, coverLocal: { uri: asset.uri, name: asset.fileName || 'experience-cover.jpg', type: asset.mimeType || 'image/jpeg' } }));
  };

  const pickPreviewPhoto = async (slot: number) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return showError('Photo library permission is needed to add preview photos.');
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: .82 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    setState((current) => ({
      ...current,
      previewPhotos: current.previewPhotos.map((item, index) => (
        index === slot ? { uri: asset.uri, name: asset.fileName || `preview-${slot + 1}.jpg`, type: asset.mimeType || 'image/jpeg' } : item
      )),
    }));
  };

  const addChapter = () => {
    const value = chapterInput.trim();
    if (!value) return showError('Give the chapter a name');
    setState((current) => current.chapters.length >= 10 ? current : { ...current, chapters: [...current.chapters, { blocks: [], free: false, title: value.slice(0, 60) }] });
    setChapterInput('');
  };

  async function ensureDraft(input = state) {
    let publication: ExperiencePublication;
    if (input.draftId) {
      publication = (await api.updateExperienceDraft(input.draftId, draftPayload(input, input.statusVersion || 0), session.accessToken)).publication;
    } else {
      publication = (await api.createExperienceDraft(draftPayload(input), session.accessToken)).publication;
    }
    let next = { ...input, draftId: String(publication.id || publication._id || ''), statusVersion: publication.statusVersion, coverMedia: publication.coverMedia || input.coverMedia };
    if (next.coverLocal?.uri) {
      const uploaded = await api.uploadExperienceMedia(next.draftId!, next.coverLocal, { purpose: 'COVER', statusVersion: next.statusVersion || 0 }, session.accessToken);
      const coverPublication = uploaded.publication;
      next = { ...next, coverLocal: null, coverMedia: coverPublication?.coverMedia || next.coverMedia, statusVersion: coverPublication?.statusVersion || next.statusVersion };
    }
    setState(next);
    return next;
  }

  async function refresh(idValue: string) {
    const publication = (await api.getMyPublication(idValue, session.accessToken)).publication;
    setState((current) => ({ ...current, statusVersion: publication.statusVersion, coverMedia: publication.coverMedia || current.coverMedia }));
    return publication;
  }

  async function saveDraft() {
    setSaving(true);
    setError('');
    try {
      let next = await ensureDraft();
      for (const stale of next.chapters.filter((chapter) => chapter.stableChapterId && !state.chapters.some((item) => item.stableChapterId === chapter.stableChapterId))) {
        if (stale.stableChapterId && next.statusVersion != null) await api.deleteExperienceChapter(next.draftId!, stale.stableChapterId, next.statusVersion, session.accessToken).catch(() => undefined);
      }
      for (const [index, chapter] of state.chapters.entries()) {
        let publication: ExperiencePublication;
        const payload = chapterPayload(chapter, index, next, next.statusVersion || 0);
        if (chapter.stableChapterId) await api.updateExperienceChapter(next.draftId!, chapter.stableChapterId, payload, session.accessToken);
        else await api.addExperienceChapter(next.draftId!, payload, session.accessToken);
        publication = await refresh(next.draftId!);
        next = { ...next, statusVersion: publication.statusVersion };
        const savedChapter = publication.chapters?.[index];
        if (!savedChapter?.stableChapterId) continue;
        const uploadedBlocks: SeenBlock[] = [];
        for (const [blockIndex, block] of chapter.blocks.entries()) {
          const blockType = String(block.type || '').toUpperCase();
          if (mediaBlockTypes.has(blockType) && block.localUri && !block.media?.assetId) {
            const blockId = block.id || id();
            const media = await api.uploadExperienceMedia(next.draftId!, { uri: block.localUri, name: block.localName, type: block.localType }, { blockId, chapterId: savedChapter.stableChapterId, mediaType: blockMediaType(blockType), purpose: 'BLOCK' }, session.accessToken);
            uploadedBlocks.push({ id: blockId, media, metadata: block.metadata, order: blockIndex, text: block.text, type: blockType });
          } else {
            uploadedBlocks.push({ ...block, order: blockIndex });
          }
        }
        if (uploadedBlocks.some((block) => mediaBlockTypes.has(String(block.type || '').toUpperCase()))) {
          await api.updateExperienceChapter(next.draftId!, savedChapter.stableChapterId, chapterPayload(chapter, index, next, next.statusVersion || 0, uploadedBlocks), session.accessToken);
          publication = await refresh(next.draftId!);
          next = { ...next, statusVersion: publication.statusVersion };
        }
      }
      if (state.chapters.length) {
        let publication = await refresh(next.draftId!);
        next = { ...next, statusVersion: publication.statusVersion };
        let targetChapter = publication.chapters?.[0];
        if (!targetChapter?.stableChapterId) {
          await api.addExperienceChapter(next.draftId!, { blocks: [], isPreview: false, releaseMode: 'IMMEDIATE', statusVersion: next.statusVersion || 0, title: next.chapters[0]?.title || 'Chapter 1' }, session.accessToken);
          publication = await refresh(next.draftId!);
          next = { ...next, statusVersion: publication.statusVersion };
          targetChapter = publication.chapters?.[0];
        }
        if (targetChapter?.stableChapterId) {
          const existingBlocks = targetChapter.blocks || [];
          const storyPreviewCount = existingBlocks.filter((block) => block.metadata?.storyPreview).length;
          const uploads = [
            ...(state.previewVideo ? [{ file: state.previewVideo, mediaType: 'VIDEO', type: 'VIDEO', label: 'Preview video' }] : []),
            ...state.previewPhotos.filter(Boolean).map((file, index) => ({ file: file!, mediaType: 'IMAGE', type: 'IMAGE', label: `Preview photo ${index + 1}` })),
            ...(state.voiceHello ? [{ file: state.voiceHello, mediaType: 'VOICE', type: 'VOICE', label: 'Voice hello' }] : []),
          ].slice(0, Math.max(0, 5 - storyPreviewCount));
          if (uploads.length) {
            const uploadedBlocks: SeenBlock[] = [];
            for (const item of uploads) {
              const blockId = id();
              const media = await api.uploadExperienceMedia(next.draftId!, item.file, { blockId, chapterId: targetChapter.stableChapterId, mediaType: item.mediaType, purpose: 'BLOCK', storyPreview: 'true' }, session.accessToken);
              uploadedBlocks.push({ id: blockId, media, metadata: { label: item.label, storyPreview: true }, order: existingBlocks.length + uploadedBlocks.length, text: '', type: item.type });
            }
            await api.updateExperienceChapter(next.draftId!, targetChapter.stableChapterId, {
              blocks: [...existingBlocks, ...uploadedBlocks].map((block, order) => ({ ...block, order })),
              isPreview: false,
              releaseMode: 'IMMEDIATE',
              statusVersion: next.statusVersion || 0,
              title: targetChapter.title || state.chapters[0]?.title || 'Chapter 1',
            }, session.accessToken);
            publication = await refresh(next.draftId!);
            next = { ...next, statusVersion: publication.statusVersion };
          }
        }
      }
      const latest = await refresh(next.draftId!);
      setState((current) => ({ ...current, ...publicationToState({ ...latest, title: current.title, summary: current.path, experiencePath: current.path, category: current.category, pricing: pricing(current), allowDownload: current.allowDownload }) }));
      return latest;
    } finally {
      setSaving(false);
    }
  }

  const nextStep = async () => {
    if (step === 1) {
      if (!state.title.trim() || !state.category) return showError('Add a title and pick a category');
      setStep(2);
      return;
    }
    if (step === 2) {
      if (chapterInput.trim()) addChapter();
      if (state.chapters.length + (chapterInput.trim() ? 1 : 0) < 1) return showError('Add at least one chapter');
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!Number.isSafeInteger(state.price) || state.price < 10) return showError('Experience price must be at least 10 Stars.');
      setStep(4);
      return;
    }
  };

  const publish = async () => {
    if (!state.title.trim() || !state.category) return showError('Add a title and pick a category');
    if (state.chapters.length < 1) return showError('Add at least one chapter');
    if (!state.coverLocal && !state.coverMedia?.secureUrl) return showError('Upload a cover before publishing.');
    if (!Number.isSafeInteger(state.price) || state.price < 10) return showError('Experience price must be at least 10 Stars.');
    setBusy(true);
    try {
      const latest = await saveDraft();
      const submitted = (await api.submitExperience(String(latest.id || latest._id), latest.statusVersion || 0, session.accessToken)).publication;
      setSuccess(submitted);
      onPublished();
      setStep(5);
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const stepView = useMemo(() => {
    if (success || step === 5) return <SuccessView onDone={() => { onPublished(); onClose(); }} publication={success} state={state} />;
    if (step === 1) return <BasicStep onPickCover={pickCover} onPickPreviewPhoto={pickPreviewPhoto} setState={setState} state={state} />;
    if (step === 2) return <ChaptersStep chapterInput={chapterInput} onAdd={addChapter} onChangeInput={setChapterInput} onEdit={setEditing} setState={setState} state={state} />;
    if (step === 3) return <AccessStep onPrice={(price) => setState((current) => ({ ...current, price }))} state={state} />;
    return <PreviewStep state={state} />;
  }, [chapterInput, editing, state, step, success]);

  if (editing !== null) return <ChapterEditor index={editing} session={session} setState={setState} state={state} onClose={() => setEditing(null)} />;

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}><Header canPreview={canPreview} onBack={goBack} onPreview={() => setStep(4)} onSave={() => saveDraft().then(() => Alert.alert('Saved', 'Draft saved for later.')).catch((reason) => showError(reason instanceof Error ? reason.message : 'Draft save failed'))} saving={saving} step={step} state={state} subtitle={subtitle} title={title} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>{error ? <Text style={styles.inlineError}>{error}</Text> : null}{stepView}{editing === null && step < 4 ? <Primary onPress={nextStep}>Continue{step === 2 && state.chapters.length ? ` (${state.chapters.length})` : ''}</Primary> : null}{editing === null && step === 4 ? <Primary busy={busy} onPress={publish}>Publish</Primary> : null}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function BasicStep({ onPickCover, onPickPreviewPhoto, setState, state }: { onPickCover: () => void; onPickPreviewPhoto: (slot: number) => void; setState: Dispatch<SetStateAction<ExperienceState>>; state: ExperienceState }) {
  return <View><TextInput onChangeText={(title) => setState((current) => ({ ...current, title }))} placeholder={'Title - e.g. "Moving to Dubai"'} placeholderTextColor={colors.faint} style={styles.input} value={state.title} /><TextInput onChangeText={(path) => setState((current) => ({ ...current, path }))} placeholder={'The path: from -> to - "From office to my own business"'} placeholderTextColor={colors.faint} style={[styles.input, styles.smallInput]} value={state.path} /><Text style={styles.label}>ACCESS</Text><Text style={styles.meta}>Premium - one-time purchase</Text>{state.pricingMode === 'ONE_TIME' ? <><View style={styles.priceLine}><Text style={styles.star}>Stars</Text><TextInput keyboardType="number-pad" onChangeText={(value) => setState((current) => ({ ...current, price: Math.max(10, Number(value) || 10) }))} style={[styles.input, styles.priceInput]} value={String(state.price)} /><Text style={styles.meta}>one-time unlock - all chapters unlock after purchase</Text></View><View style={styles.rowGap}>{FIRST_PRICES.map((price) => <Pill active={state.price === price} key={price} onPress={() => setState((current) => ({ ...current, price }))}>{price} Stars</Pill>)}</View><Text style={styles.meta}>Most creators start at 190-500 Stars. You can raise it later.</Text></> : null}<Pressable onPress={() => setState((current) => ({ ...current, allowDownload: !current.allowDownload }))} style={[styles.download, state.allowDownload && styles.downloadOn]}><Ionicons color={colors.faint} name="download-outline" size={15} /><View style={styles.flex}><Text style={styles.downloadTitle}>Allow download</Text><Text style={styles.downloadSub}>Watermarked PDF - text and photos only</Text></View><Text style={[styles.downloadState, state.allowDownload && styles.activeText]}>{state.allowDownload ? 'On' : 'Off'}</Text></Pressable><Text style={styles.label}>CATEGORY</Text><View style={styles.chips}>{CATEGORIES.map((category) => <Pill active={state.category === category} key={category} onPress={() => setState((current) => ({ ...current, category }))}>{category}</Pill>)}</View><Text style={styles.label}>COVER</Text><View style={styles.coverRow}><View style={styles.coverPreview}>{coverUri(state) ? <Image source={{ uri: coverUri(state) }} style={styles.coverImage} /> : <LinearGradient colors={['#1E2C46', '#0C1119']} style={StyleSheet.absoluteFill} />}<Text style={styles.coverHint}>16:9</Text></View><View style={styles.flex}><Pressable onPress={onPickCover} style={styles.upload}><Ionicons color={colors.muted} name="cloud-upload-outline" size={14} /><Text style={styles.uploadText}>Upload</Text></Pressable><Text style={styles.meta}>16:9 - 1280px+ - shown on the card and inside</Text></View></View><View style={styles.generateDisabled}><Ionicons color={colors.blue} name="refresh-outline" size={13} /><Text style={styles.generateText}>Generate from title</Text><Text style={styles.meta}>AI cover generation is not connected on mobile yet.</Text></View><TrustLayer onPickPreviewPhoto={onPickPreviewPhoto} setState={setState} state={state} /></View>;
}

function PreviewVideoTile({ onPick, onRemove, video }: { onPick: () => void; onRemove: () => void; video: TrustUpload | null }) {
  const player = useVideoPlayer(video?.uri ? { uri: video.uri } : null, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });
  return video ? <View style={styles.videoPreviewWrap}><VideoView contentFit="cover" nativeControls={false} player={player} style={styles.videoPreview} /><Pressable accessibilityLabel="Play preview video" onPress={() => (player.playing ? player.pause() : player.play())} style={styles.videoPlayButton}><Ionicons color={colors.text} name={player.playing ? 'pause' : 'play'} size={24} /></Pressable><Text style={styles.videoDuration}>{clock(video.duration || 30)}</Text><Pressable accessibilityLabel="Remove preview video" onPress={onRemove} style={styles.previewRemove}><Ionicons color={colors.text} name="close" size={17} /></Pressable></View> : <Pressable onPress={onPick} style={styles.trustDashed}><Ionicons color={colors.blue} name="videocam-outline" size={15} /><Text style={styles.trustAction}>Add a 30-second video - say hi, show the place</Text></Pressable>;
}

function TrustLayer({ onPickPreviewPhoto, setState, state }: { onPickPreviewPhoto: (slot: number) => void; setState: Dispatch<SetStateAction<ExperienceState>>; state: ExperienceState }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 200);
  const [voiceMode, setVoiceMode] = useState<'idle' | 'recording'>('idle');
  const saveVideoAsset = (asset: ImagePicker.ImagePickerAsset) => {
    const mimeType = videoMime(asset);
    setState((current) => ({ ...current, previewVideo: { uri: asset.uri, name: asset.fileName || uploadName(asset.uri, 'experience-preview-video', mimeType.includes('quicktime') ? 'mov' : mimeType.includes('webm') ? 'webm' : 'mp4'), type: mimeType, duration: asset.duration ? Math.round(asset.duration / 1000) : 30 } }));
  };
  const recordVideo = async () => {
    const camera = await ImagePicker.requestCameraPermissionsAsync();
    if (!camera.granted) return Alert.alert('Experience', 'Camera permission is needed to record a preview video.');
    const microphone = await requestRecordingPermissionsAsync();
    if (!microphone.granted) return Alert.alert('Experience', 'Microphone permission is needed to record a preview video.');
    const result = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, mediaTypes: ['videos'], quality: .7, videoMaxDuration: 30 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    saveVideoAsset(result.assets[0]);
  };
  const chooseVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Experience', 'Photo library permission is needed to choose a preview video.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: .7, videoMaxDuration: 30 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    if (asset.duration && asset.duration > 30500) {
      return Alert.alert('Experience', 'Choose a video that is 30 seconds or shorter.');
    }
    saveVideoAsset(asset);
  };
  const pickVideo = () => {
    Alert.alert('Preview video', 'Add a 30-second video for your Experience.', [
      { text: 'Record video', onPress: recordVideo },
      { text: 'Choose from library', onPress: chooseVideo },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const startVoice = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return Alert.alert('Experience', 'Microphone permission is needed to record a voice hello.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync({ ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true });
      recorder.record({ forDuration: 20 });
      setVoiceMode('recording');
    } catch (error) {
      setVoiceMode('idle');
      Alert.alert('Experience', error instanceof Error ? error.message : 'Voice recording could not start.');
    }
  };
  const stopVoice = useCallback(async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri || recorderState.url || '';
      if (uri) setState((current) => ({ ...current, voiceHello: { uri, name: uploadName(uri, 'voice-hello', 'm4a'), type: audioMime(uri), duration: Math.max(1, Math.round(recorderState.durationMillis / 1000)) } }));
    } catch (error) {
      Alert.alert('Experience', error instanceof Error ? error.message : 'Voice recording could not be saved.');
    } finally {
      setVoiceMode('idle');
    }
  }, [recorder, recorderState.durationMillis, recorderState.url, setState]);
  useEffect(() => {
    if (voiceMode === 'recording' && recorderState.durationMillis >= 20000) stopVoice();
  }, [recorderState.durationMillis, stopVoice, voiceMode]);
  return <View><Text style={styles.label}>PREVIEW - THE TRUST LAYER</Text><Text style={styles.trustCopy}>One short video of you + real photos. Worlds with a video get stepped into 3x more.</Text><PreviewVideoTile onPick={pickVideo} onRemove={() => setState((current) => ({ ...current, previewVideo: null }))} video={state.previewVideo} /><View style={styles.previewPhotoRow}>{state.previewPhotos.map((photo, index) => <Pressable key={index} onPress={() => onPickPreviewPhoto(index)} style={styles.previewPhotoSlot}>{photo?.uri ? <Image source={{ uri: photo.uri }} style={styles.coverImage} /> : <Ionicons color={colors.faint} name="camera-outline" size={18} />}{photo ? <Pressable onPress={() => setState((current) => ({ ...current, previewPhotos: current.previewPhotos.map((item, itemIndex) => itemIndex === index ? null : item) }))} style={styles.slotRemove}><Ionicons color={colors.text} name="close" size={11} /></Pressable> : null}</Pressable>)}</View><Pressable onPress={voiceMode === 'recording' ? stopVoice : startVoice} style={[styles.voiceRow, (state.voiceHello || voiceMode === 'recording') && styles.trustOn]}><Ionicons color={voiceMode === 'recording' ? colors.blue : colors.faint} name={voiceMode === 'recording' ? 'stop-circle-outline' : 'mic-outline'} size={15} /><Text style={styles.voiceText}>{voiceMode === 'recording' ? `Recording - ${clock(recorderState.durationMillis / 1000)}` : state.voiceHello ? `Voice hello - ${clock(state.voiceHello.duration || 0)}` : 'Add a voice hello - people trust a voice'}</Text>{state.voiceHello || voiceMode === 'recording' ? <View style={styles.voiceWave}>{[.32, .58, .42, .78, .5, .7].map((level, index) => <View key={index} style={[styles.voiceBar, { height: Math.max(6, level * 22) }]} />)}</View> : null}{state.voiceHello && voiceMode !== 'recording' ? <Pressable onPress={() => setState((current) => ({ ...current, voiceHello: null }))} style={styles.inlineRemove}><Ionicons color={colors.text} name="close" size={12} /></Pressable> : null}</Pressable></View>;
}

function ChaptersStep({ chapterInput, onAdd, onChangeInput, onEdit, setState, state }: { chapterInput: string; onAdd: () => void; onChangeInput: (value: string) => void; onEdit: (index: number) => void; setState: Dispatch<SetStateAction<ExperienceState>>; state: ExperienceState }) {
  return <View><Text style={styles.copy}>Photos, places, stories, lessons - each chapter is one step deeper into your world.</Text>{!state.chapters.length ? <Text style={styles.hint}>Start with one chapter. You can add more as your Experience grows.</Text> : null}<Text style={styles.microHint}>tap a chapter - write inside: text, photo, place, link, list, poll</Text>{state.chapters.map((chapter, index) => <View key={`${chapter.stableChapterId || chapter.title}-${index}`} style={styles.chapterRow}><View style={styles.chapterThumb}><Text style={styles.chapterNumber}>{index + 1}</Text></View><Pressable onPress={() => onEdit(index)} style={styles.chapterCopy}><Text numberOfLines={1} style={styles.chapterTitle}>{chapter.title}</Text><Text style={styles.chapterSub}>{words(chapter) ? `${words(chapter)} words - ` : ''}write about your story</Text></Pressable><Pressable onPress={() => onEdit(index)}><Ionicons color={colors.faint} name="chevron-forward" size={17} /></Pressable><Pressable onPress={() => setState((current) => ({ ...current, chapters: current.chapters.filter((_, itemIndex) => itemIndex !== index) }))}><Ionicons color={colors.faint} name="close" size={17} /></Pressable></View>)}<View style={styles.addLine}><TextInput onChangeText={onChangeInput} onSubmitEditing={onAdd} placeholder={state.chapters.length ? 'Next chapter...' : 'First chapter - e.g. "The first 48 hours"'} placeholderTextColor={colors.faint} style={[styles.input, styles.addInput]} value={chapterInput} /><Pressable onPress={onAdd} style={styles.addButton}><Text style={styles.addText}>Add</Text></Pressable></View>{state.chapters.length > 0 && state.chapters.length < 3 ? <Text style={styles.centerMeta}>Great worlds start at 3 chapters.</Text> : null}<Pressable disabled style={styles.notes}><Text style={styles.notesText}>+ Add from my notes - optional</Text><Text style={styles.meta}>Saved notes are not exposed by the mobile API yet.</Text></Pressable></View>;
}

function AccessStep({ onPrice, state }: { onPrice: (price: number) => void; state: ExperienceState }) {
  return <View><Text style={styles.label}>ONE-TIME PURCHASE</Text><Text style={styles.copy}>All chapters unlock after purchase.</Text>{state.chapters.map((chapter, index) => <View key={`${chapter.title}-${index}`} style={styles.chapterRow}><Ionicons color={colors.faint} name="lock-closed-outline" size={17} /><Text style={[styles.chapterTitle, styles.flex]}>{chapter.title}</Text></View>)}<Text style={styles.label}>PRICE</Text><TextInput accessibilityLabel="Experience price in Stars" keyboardType="number-pad" value={String(state.price)} onChangeText={(value) => onPrice(Number(value) || 0)} style={styles.input} /><Text style={styles.meta}>At least 10 Stars, paid once.</Text><View style={styles.chips}>{PRICE_PRESETS.map((price) => <Pill active={state.price === price} key={price} onPress={() => onPrice(price)}>{price} Stars</Pill>)}</View></View>;
}

function PreviewStep({ state }: { state: ExperienceState }) {
  return <View><View style={styles.reviewCard}><View style={styles.reviewCover}>{coverUri(state) ? <Image source={{ uri: coverUri(state) }} style={styles.coverImage} /> : <LinearGradient colors={['#1E2C46', '#0C1119']} style={StyleSheet.absoluteFill} />}<LinearGradient colors={['transparent', 'rgba(10,12,15,.94)']} style={StyleSheet.absoluteFill} /><View style={styles.reviewCopy}><Text style={styles.reviewTitle}>{state.title || 'Untitled'}</Text><Text style={styles.reviewMeta}>{state.category || 'Experience'} - {state.chapters.length} chapters - {state.price} Stars</Text></View></View><View style={styles.reviewBody}>{state.path ? <Text style={styles.copy}>{state.path}</Text> : null}{state.chapters.map((chapter, index) => <View key={`${chapter.title}-${index}`} style={styles.previewChapter}><View style={styles.chapterThumbSmall}><Text style={styles.chapterNumber}>{index + 1}</Text></View><Text numberOfLines={1} style={[styles.chapterTitle, styles.flex]}>{chapter.title}</Text><Text style={styles.previewState}>{'locked'}</Text></View>)}{state.allowDownload ? <Text style={styles.meta}>Download enabled: Watermarked PDF - text and photos only</Text> : null}</View></View></View>;
}

type ChapterFormMode = 'KEY_POINT' | 'LINK' | 'LIST' | 'POLL';

const blockTitle = (block: LocalBlock) => {
  const type = String(block.type || '').toUpperCase();
  if (type === 'LINK') return block.label || block.url || 'Link';
  if (type === 'POLL') return String(block.metadata?.question || 'Poll');
  if (type === 'LIST') {
    const items = Array.isArray(block.metadata?.listItems) ? block.metadata.listItems : [];
    return items.length ? `${items.length} list items` : block.text || 'List';
  }
  if (type === 'KEY_POINT') return block.text || String((block.metadata?.location as { label?: string } | undefined)?.label || 'Place');
  if (type === 'VOICE') return `Voice ${clock(Number(block.media?.duration || block.metadata?.duration || 0))}`;
  if (type === 'IMAGE') return block.text || 'Photo';
  return block.text || type || 'Block';
};

const blockIcon = (type = ''): keyof typeof Ionicons.glyphMap => {
  const key = type.toUpperCase();
  if (key === 'IMAGE') return 'image-outline';
  if (key === 'VOICE' || key === 'AUDIO') return 'mic-outline';
  if (key === 'KEY_POINT') return 'location-outline';
  if (key === 'LINK') return 'globe-outline';
  if (key === 'LIST') return 'list-outline';
  if (key === 'POLL') return 'stats-chart-outline';
  return 'text-outline';
};

function ChapterVoiceBlock({ block }: { block: LocalBlock }) {
  const uri = block.localUri || resolveMediaUrl(block.media?.secureUrl || block.media?.url || '');
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const bars = Array.isArray(block.metadata?.waveform) ? block.metadata.waveform.slice(0, 18) as number[] : [.25, .55, .35, .72, .42, .62, .28, .5, .76, .46];
  const duration = Number(block.media?.duration || block.metadata?.duration || status.duration || 0);
  const toggle = () => {
    if (!uri) return;
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish) player.seekTo(0).catch(() => {});
      player.play();
    }
  };
  return <View style={styles.editorVoice}><Pressable disabled={!uri} onPress={toggle} style={styles.editorVoicePlay}><Ionicons color={colors.bg} name={status.playing ? 'pause' : 'play'} size={13} /></Pressable><View style={styles.editorWave}>{bars.map((value, itemIndex) => <View key={`${itemIndex}-${value}`} style={[styles.editorWaveBar, { height: Math.max(6, Math.min(22, value * 24)) }]} />)}</View><Text style={styles.editorVoiceTime}>{clock(duration)}</Text></View>;
}

function ComposerColorPalette({ onApply, onClear }: { onApply: (kind: 'color' | 'highlight' | 'backgroundColor', color: string) => void; onClear: () => void }) {
  const row = (kind: 'color' | 'highlight' | 'backgroundColor') => composerColors.map((color) => (
    <Pressable
      accessibilityLabel={`${kind} ${color}`}
      key={`${kind}-${color}`}
      onPress={() => onApply(kind, color)}
      style={[styles.colorDot, kind === 'color' ? styles.colorDotRound : styles.colorDotSquare, kind === 'backgroundColor' && styles.colorDotMuted, { backgroundColor: color }]}
    />
  ));
  return <View style={styles.colorPalette}>
    <View style={styles.colorPaletteRow}><Text style={styles.colorAa}>Aa</Text>{row('color')}<View style={styles.colorDivider} /><Pressable onPress={onClear} style={styles.colorClear}><Ionicons color={colors.faint} name="close" size={14} /></Pressable></View>
    <View style={styles.colorPaletteRow}><Ionicons color="rgba(255,255,255,.85)" name="color-wand-outline" size={13} style={styles.colorIconSlot} />{row('highlight')}</View>
    <View style={styles.colorPaletteRow}><View style={styles.colorSplitIcon} />{row('backgroundColor')}</View>
  </View>;
}

function BlockFormModal({ block, mode, onClose, onSave }: { block?: LocalBlock | null; mode: ChapterFormMode | null; onClose: () => void; onSave: (block: LocalBlock) => void }) {
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [items, setItems] = useState<string[]>(['', '']);

  useEffect(() => {
    if (!mode) return;
    setPrimary(mode === 'POLL' ? String(block?.metadata?.question || '') : mode === 'LINK' ? block?.url || '' : block?.text || '');
    setSecondary(mode === 'LINK' ? block?.label || '' : '');
    const currentItems = mode === 'LIST'
      ? (Array.isArray(block?.metadata?.listItems) ? block?.metadata?.listItems.map(String) : ['', ''])
      : mode === 'POLL'
        ? (Array.isArray(block?.metadata?.options) ? block?.metadata?.options.map(String) : ['', ''])
        : ['', ''];
    setItems(currentItems.length ? currentItems : ['', '']);
  }, [block, mode]);

  const submit = () => {
    if (!mode) return;
    const cleanItems = items.map((item) => item.trim()).filter(Boolean);
    const value = primary.trim();
    if (mode === 'KEY_POINT' && !value) return Alert.alert('Experience', 'Add a place first.');
    if (mode === 'LINK') {
      if (!value) return Alert.alert('Experience', 'Paste a link first.');
      const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      try { new URL(url); } catch { return Alert.alert('Experience', 'Enter a valid URL.'); }
      onSave({ ...(block || {}), id: block?.id || id(), label: secondary.trim() || new URL(url).hostname.replace(/^www\./, ''), type: 'LINK', url });
      return;
    }
    if (mode === 'LIST') {
      if (!cleanItems.length) return Alert.alert('Experience', 'Add at least one list item.');
      onSave({ ...(block || {}), id: block?.id || id(), metadata: { ...(block?.metadata || {}), listItems: cleanItems }, text: cleanItems.join('\n'), type: 'LIST' });
      return;
    }
    if (mode === 'POLL') {
      if (!value || cleanItems.length < 2) return Alert.alert('Experience', 'Add a question and at least two options.');
      onSave({ ...(block || {}), id: block?.id || id(), metadata: { ...(block?.metadata || {}), options: cleanItems.slice(0, 6), question: value, resultsVisibility: 'SUBSCRIBERS' }, type: 'POLL' });
      return;
    }
    onSave({ ...(block || {}), id: block?.id || id(), metadata: { ...(block?.metadata || {}), location: { label: value } }, text: value, type: 'KEY_POINT' });
  };

  const tight = mode === 'LINK' || mode === 'KEY_POINT';
  return <Modal animationType="slide" transparent visible={Boolean(mode)} onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editorModalLayer}><Pressable onPress={onClose} style={styles.editorScrim} /><View style={tight ? styles.editorTightSheet : styles.editorFormSheet}>{tight ? <View style={styles.tightInputRow}><TextInput autoCapitalize={mode === 'LINK' ? 'none' : 'words'} keyboardType={mode === 'LINK' ? 'url' : 'default'} onChangeText={setPrimary} onSubmitEditing={submit} placeholder={mode === 'LINK' ? 'Paste a link...' : 'Place - e.g. Lisbon, Alfama'} placeholderTextColor={colors.faint} returnKeyType="done" style={styles.tightInput} value={primary} /><Pressable disabled={!primary.trim()} onPress={submit} style={styles.tightAdd}><Text style={[styles.tightAddText, !primary.trim() && styles.tightAddTextOff]}>Add</Text></Pressable></View> : <><View style={styles.sheetHandle} /><View style={styles.formHeader}><Text style={styles.formTitle}>{mode === 'LIST' ? 'List' : 'Poll'}</Text><Pressable onPress={onClose}><Ionicons color={colors.muted} name="close" size={22} /></Pressable></View>{mode === 'POLL' ? <TextInput onChangeText={setPrimary} placeholder="Ask something..." placeholderTextColor={colors.faint} style={styles.editorFormInput} value={primary} /> : null}<View style={styles.formList}>{items.map((item, itemIndex) => <View key={itemIndex} style={styles.formItemRow}><TextInput onChangeText={(value) => setItems((current) => current.map((entry, entryIndex) => entryIndex === itemIndex ? value : entry))} placeholder={`${mode === 'POLL' ? 'Option' : 'Item'} ${itemIndex + 1}`} placeholderTextColor={colors.faint} style={[styles.editorFormInput, styles.formItemInput]} value={item} /></View>)}</View><Pressable onPress={() => setItems((current) => [...current, ''])} style={styles.formAdd}><Text style={styles.formAddText}>+ {mode === 'POLL' ? 'Option' : 'Item'}</Text></Pressable><Pressable onPress={submit} style={styles.formDone}><Text style={styles.formDoneText}>Add</Text></Pressable></>}</View></KeyboardAvoidingView></Modal>;
}

function ChapterEditor({ index, onClose, session, setState, state }: { index: number; onClose: () => void; session: Session; setState: Dispatch<SetStateAction<ExperienceState>>; state: ExperienceState }) {
  const chapter = state.chapters[index] || { blocks: [], free: false, title: '' };
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 120);
  const [textDraft, setTextDraft] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formMode, setFormMode] = useState<ChapterFormMode | null>(null);
  const [editingBlock, setEditingBlock] = useState<number | null>(null);
  const [voiceMode, setVoiceMode] = useState<'idle' | 'recording'>('idle');
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionNotice, setTranscriptionNotice] = useState('');
  const [waveform, setWaveform] = useState<number[]>([]);
  const [lastTap, setLastTap] = useState<{ index: number; time: number }>({ index: -1, time: 0 });
  const [textSelection, setTextSelection] = useState({ start: 0, end: 0 });
  const [textFocused, setTextFocused] = useState(false);
  const [draftStyle, setDraftStyle] = useState<{ backgroundColor?: string; color?: string; highlight?: string }>({});

  const patch = (fn: (chapter: LocalChapter) => LocalChapter) => setState((current) => ({ ...current, chapters: current.chapters.map((item, itemIndex) => itemIndex === index ? fn(item) : item) }));
  const flushText = () => {
    const value = textDraft.trim();
    if (!value) return;
    patch((item) => ({ ...item, blocks: [...item.blocks, { id: id(), metadata: Object.keys(draftStyle).length ? { ...draftStyle } : undefined, text: value, type: 'TEXT' }] }));
    setTextDraft('');
    setDraftStyle({});
    setTextFocused(false);
    setTextSelection({ start: 0, end: 0 });
  };
  const saveAndClose = () => { flushText(); onClose(); };
  const upsertBlock = (block: LocalBlock) => {
    patch((item) => editingBlock == null
      ? { ...item, blocks: [...item.blocks, block] }
      : { ...item, blocks: item.blocks.map((entry, entryIndex) => entryIndex === editingBlock ? block : entry) });
    setEditingBlock(null);
    setFormMode(null);
  };
  const removeBlock = (blockIndex: number) => patch((item) => ({ ...item, blocks: item.blocks.filter((_, itemIndex) => itemIndex !== blockIndex) }));
  const moveBlock = (blockIndex: number, direction: -1 | 1) => patch((item) => {
    const target = blockIndex + direction;
    if (target < 0 || target >= item.blocks.length) return item;
    const blocks = [...item.blocks];
    const [moved] = blocks.splice(blockIndex, 1);
    blocks.splice(target, 0, moved);
    return { ...item, blocks };
  });
  const patchBlock = (blockIndex: number, update: (block: LocalBlock) => LocalBlock) => patch((item) => ({
    ...item,
    blocks: item.blocks.map((entry, entryIndex) => entryIndex === blockIndex ? update(entry) : entry),
  }));
  const updateListItem = (blockIndex: number, itemIndex: number, value: string) => patchBlock(blockIndex, (entry) => {
    const items = Array.isArray(entry.metadata?.listItems) ? entry.metadata.listItems.map(String) : ['', '', ''];
    items[itemIndex] = value;
    return { ...entry, metadata: { ...(entry.metadata || {}), listItems: items }, text: items.join('\n') };
  });
  const updatePoll = (blockIndex: number, field: 'question' | 'option', value: string, optionIndex = 0) => patchBlock(blockIndex, (entry) => {
    const options = Array.isArray(entry.metadata?.options) ? entry.metadata.options.map(String) : ['', ''];
    if (field === 'option') options[optionIndex] = value;
    return {
      ...entry,
      metadata: { ...(entry.metadata || {}), options, question: field === 'question' ? value : String(entry.metadata?.question || '') },
    };
  });
  const addPollOption = (blockIndex: number) => patchBlock(blockIndex, (entry) => {
    const options = Array.isArray(entry.metadata?.options) ? entry.metadata.options.map(String) : ['', ''];
    return options.length >= 4 ? entry : { ...entry, metadata: { ...(entry.metadata || {}), options: [...options, ''] } };
  });
  const applyDraftColor = (kind: 'color' | 'highlight' | 'backgroundColor', color: string) => {
    setDraftStyle((current) => ({ ...current, [kind]: color }));
  };
  const clearDraftColor = () => setDraftStyle({});
  const openEditorFor = (blockIndex: number) => {
    const type = String(chapter.blocks[blockIndex]?.type || '').toUpperCase();
    if (['KEY_POINT', 'LINK', 'LIST', 'POLL'].includes(type)) {
      setEditingBlock(blockIndex);
      setFormMode(type as ChapterFormMode);
    }
  };
  const blockActions = (blockIndex: number) => Alert.alert(blockTitle(chapter.blocks[blockIndex]), 'Edit or move this block.', [
    { text: 'Edit', onPress: () => openEditorFor(blockIndex) },
    { text: 'Move up', onPress: () => moveBlock(blockIndex, -1) },
    { text: 'Move down', onPress: () => moveBlock(blockIndex, 1) },
    { text: 'Remove', style: 'destructive', onPress: () => removeBlock(blockIndex) },
    { text: 'Cancel', style: 'cancel' },
  ]);
  const pickPhoto = async () => {
    setSheetOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Experience', 'Photo library permission is needed.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: .82 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    patch((item) => ({ ...item, blocks: [...item.blocks, { id: id(), localName: asset.fileName || 'chapter-photo.jpg', localType: asset.mimeType || 'image/jpeg', localUri: asset.uri, type: 'IMAGE' }] }));
  };
  const startVoice = async () => {
    setSheetOpen(false);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return Alert.alert('Experience', 'Microphone permission is needed to record voice.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      setWaveform([]);
      await recorder.prepareToRecordAsync({ ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true });
      recorder.record({ forDuration: 120 });
      setVoiceMode('recording');
    } catch (error) {
      Alert.alert('Experience', error instanceof Error ? error.message : 'Voice recording could not start.');
      setVoiceMode('idle');
    }
  };
  const stopVoice = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri || recorderState.url || '';
      if (uri) {
        const duration = Math.max(1, Math.round(recorderState.durationMillis / 1000));
        const voiceFile = { uri, name: uploadName(uri, 'chapter-voice', 'm4a'), type: audioMime(uri) };
        const transcriptionFile = { ...voiceFile, type: transcriptionAudioMime(voiceFile.name || uri) };
        const voiceBlock: LocalBlock = { id: id(), localName: voiceFile.name, localType: voiceFile.type, localUri: uri, metadata: { duration, waveform: waveform.length ? waveform : [.24, .5, .34, .62, .28, .48] }, type: 'VOICE' };
        patch((item) => ({ ...item, blocks: [...item.blocks, voiceBlock] }));
        setTranscribing(true);
        try {
          const result = await api.transcribeVoiceNote(transcriptionFile, session.accessToken);
          const transcript = String(result.transcript || '').trim();
          if (transcript && !result.emptySpeech) {
            setTranscriptionNotice('');
            patch((item) => ({
              ...item,
              blocks: item.blocks.map((entry) => entry.id === voiceBlock.id ? { ...entry, metadata: { ...(entry.metadata || {}), transcript, transcriptConfidence: result.confidence, transcriptLanguage: result.language || '' } } : entry)
                .concat({ id: id(), metadata: { fromVoice: true, transcriptConfidence: result.confidence, transcriptLanguage: result.language || '' }, text: transcript, type: 'TEXT' }),
            }));
          } else {
            setTranscriptionNotice('No speech detected');
          }
        } catch (error) {
          const label = transcriptFailureLabel(error);
          console.warn('Voice transcription failed', error);
          setTranscriptionNotice(label);
        } finally {
          setTranscribing(false);
        }
      }
    } catch (error) {
      Alert.alert('Experience', error instanceof Error ? error.message : 'Voice recording could not be saved.');
      setTranscribing(false);
    } finally {
      setVoiceMode('idle');
    }
  };

  useEffect(() => {
    if (voiceMode !== 'recording') return;
    const metering = typeof recorderState.metering === 'number' ? recorderState.metering : -48;
    setWaveform((current) => [...current.slice(-23), Math.max(.12, Math.min(1, (metering + 60) / 60))]);
    if (recorderState.durationMillis >= 120000) stopVoice();
  }, [recorderState.durationMillis, recorderState.metering, voiceMode]);

  const openForm = (mode: ChapterFormMode) => {
    setSheetOpen(false);
    flushText();
    if (mode === 'LIST') {
      patch((item) => ({ ...item, blocks: [...item.blocks, { id: id(), metadata: { listItems: ['', '', ''] }, text: '\n\n', type: 'LIST' }] }));
      return;
    }
    if (mode === 'POLL') {
      patch((item) => ({ ...item, blocks: [...item.blocks, { id: id(), metadata: { options: ['', ''], question: '' }, type: 'POLL' }] }));
      return;
    }
    setEditingBlock(null);
    setFormMode(mode);
  };
  const showPalette = textFocused && textDraft.length > 0;
  const hasBlocks = chapter.blocks.length > 0 || Boolean(textDraft.trim());
  const currentEditBlock = editingBlock == null ? null : chapter.blocks[editingBlock];

  return <SafeAreaView style={styles.chapterEditorSafe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chapterEditorScreen}><LinearGradient pointerEvents="none" colors={['#10161F', '#06080B']} locations={[0, 1]} style={StyleSheet.absoluteFill} /><View style={[styles.chapterTop, { paddingTop: Math.max(12, insets.top + 8) }]}><View style={styles.chapterTopCopy}><Text numberOfLines={1} style={styles.chapterEditorTitle}>{chapter.title || `Chapter ${index + 1}`}</Text><Text style={styles.chapterEditorHelp}>drag a block - move - double-tap - edit</Text></View><Pressable onPress={saveAndClose} style={styles.editorDoneButton}><Text style={styles.editorDoneText}>Done</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.editorCanvas, { paddingBottom: 128 + insets.bottom }]}><TextInput multiline onChangeText={setTextDraft} onFocus={() => setTextFocused(true)} onSelectionChange={({ nativeEvent }) => setTextSelection(nativeEvent.selection)} placeholder="" selectionColor={colors.blue} style={[styles.editorTextCanvas, draftStyle.color ? { color: draftStyle.color } : null, draftStyle.backgroundColor ? { backgroundColor: `${draftStyle.backgroundColor}33`, borderRadius: 4 } : null, draftStyle.highlight ? { textDecorationLine: 'underline', textDecorationColor: draftStyle.highlight } : null]} textAlignVertical="top" value={textDraft} />{!hasBlocks ? <View pointerEvents="none" style={styles.editorEmpty}><Text style={styles.editorEmptyMain}>Just write.</Text><Text style={styles.editorEmptySub}>Select text - color appears.</Text></View> : null}{chapter.blocks.map((block, blockIndex) => {
    const type = String(block.type || '').toUpperCase();
    const mediaUri = block.localUri || resolveMediaUrl(block.media?.secureUrl || block.media?.url || '');
    const listItems = Array.isArray(block.metadata?.listItems) ? block.metadata.listItems.map(String) : [];
    const pollOptions = Array.isArray(block.metadata?.options) ? block.metadata.options.map(String) : [];
    const textColor = String(block.metadata?.color || '#EDEFF3');
    const textBackground = block.metadata?.backgroundColor ? `${String(block.metadata.backgroundColor)}33` : undefined;
    if (type === 'TEXT') {
      return <Pressable key={block.id || blockIndex} onLongPress={() => blockActions(blockIndex)} style={[styles.editorTextBlock, textBackground ? { backgroundColor: textBackground } : null]}><Text style={[styles.editorTextBlockText, { color: textColor }, block.metadata?.highlight ? { textDecorationLine: 'underline', textDecorationColor: String(block.metadata.highlight) } : null]}>{block.text}</Text>{block.metadata?.fromVoice ? <Text style={styles.voiceTranscriptMeta}>voice transcript</Text> : null}</Pressable>;
    }
    if (type === 'IMAGE' && mediaUri) {
      return <Pressable key={block.id || blockIndex} onLongPress={() => blockActions(blockIndex)} style={styles.editorMediaBlock}><Image resizeMode="cover" source={{ uri: mediaUri }} style={styles.editorPhoto} /><LinearGradient pointerEvents="none" colors={['transparent', 'rgba(6,8,11,.62)']} style={StyleSheet.absoluteFill} /><Pressable accessibilityLabel="Remove photo" onPress={() => removeBlock(blockIndex)} style={styles.editorMediaRemove}><Ionicons color={colors.text} name="close" size={15} /></Pressable><TextInput multiline onChangeText={(caption) => patchBlock(blockIndex, (entry) => ({ ...entry, metadata: { ...(entry.metadata || {}), caption }, text: caption }))} placeholder="Write on it..." placeholderTextColor="rgba(255,255,255,.62)" selectionColor={colors.blue} style={styles.editorCaptionInput} value={String(block.metadata?.caption || block.text || '')} /></Pressable>;
    }
    if (type === 'VOICE' || type === 'AUDIO') {
      return <Pressable key={block.id || blockIndex} onLongPress={() => blockActions(blockIndex)} style={styles.editorAudioBlock}><ChapterVoiceBlock block={block} /><Pressable onPress={() => removeBlock(blockIndex)} style={styles.editorAudioRemove}><Ionicons color={colors.faint} name="close" size={15} /></Pressable></Pressable>;
    }
    return <Pressable key={block.id || blockIndex} onLongPress={() => blockActions(blockIndex)} onPress={() => { const now = Date.now(); if (lastTap.index === blockIndex && now - lastTap.time < 320) openEditorFor(blockIndex); setLastTap({ index: blockIndex, time: now }); }} style={styles.editorBlock}><View style={styles.editorBlockBody}>{type === 'LINK' ? <View style={styles.editorLinkCard}><Ionicons color={colors.muted} name="globe-outline" size={17} /><View style={styles.flex}><Text style={styles.editorLinkTitle}>{block.label || blockTitle(block)}</Text><Text numberOfLines={1} style={styles.editorLinkUrl}>{block.url}</Text></View><Pressable onPress={() => removeBlock(blockIndex)}><Ionicons color={colors.faint} name="close" size={15} /></Pressable></View> : type === 'LIST' ? <View style={styles.editorListBlock}>{(listItems.length ? listItems : ['', '', '']).map((item, itemIndex) => <View key={`${blockIndex}-${itemIndex}`} style={styles.editorListInputRow}><Text style={styles.editorListBullet}>•</Text><TextInput onChangeText={(value) => updateListItem(blockIndex, itemIndex, value)} placeholder="" placeholderTextColor={colors.faint} style={styles.editorListInput} value={item} /></View>)}</View> : type === 'POLL' ? <View style={styles.editorPollCard}><View style={styles.editorPollHeader}><Ionicons color={colors.muted} name="stats-chart-outline" size={17} /><TextInput onChangeText={(value) => updatePoll(blockIndex, 'question', value)} placeholder="Ask something..." placeholderTextColor={colors.faint} style={styles.editorPollQuestionInput} value={String(block.metadata?.question || '')} /><Pressable onPress={() => removeBlock(blockIndex)}><Ionicons color={colors.faint} name="close" size={15} /></Pressable></View>{pollOptions.map((item, itemIndex) => <TextInput key={`${blockIndex}-${itemIndex}`} onChangeText={(value) => updatePoll(blockIndex, 'option', value, itemIndex)} placeholder={`Option ${itemIndex + 1}`} placeholderTextColor={colors.faint} style={styles.editorPollInput} value={item} />)}<Pressable onPress={() => addPollOption(blockIndex)}><Text style={styles.editorPollAdd}>+ Option</Text></Pressable></View> : <View style={styles.editorInlineBlock}><Ionicons color={colors.blue} name={blockIcon(type)} size={16} /><Text style={styles.editorBlockText}>{blockTitle(block)}</Text></View>}</View></Pressable>;
  })}</ScrollView>{showPalette ? <ComposerColorPalette onApply={applyDraftColor} onClear={clearDraftColor} /> : null}{transcribing || transcriptionNotice ? <View style={styles.transcribingPill}>{transcribing ? <ActivityIndicator color={colors.blue} size="small" /> : <Ionicons color={colors.faint} name="document-text-outline" size={14} />}<Text style={styles.transcribingText}>{transcribing ? 'Transcribing voice...' : transcriptionNotice}</Text></View> : null}<View pointerEvents="none" style={[styles.editorBottomHint, { bottom: Math.max(78, insets.bottom + 74) }]}><Text numberOfLines={1} style={styles.editorBottomHintText}>select - color - drag a block - + adds the rest</Text></View><Pressable accessibilityLabel="Add chapter block" onPress={() => { flushText(); setSheetOpen(true); }} style={[styles.editorPlus, { bottom: Math.max(26, insets.bottom + 20) }]}><Ionicons color={colors.muted} name="add" size={18} /></Pressable><Modal animationType="slide" transparent visible={sheetOpen} onRequestClose={() => setSheetOpen(false)}><View style={styles.editorSheetLayer}><Pressable onPress={() => setSheetOpen(false)} style={styles.editorSheetDim} /><View style={[styles.editorAddSheet, { paddingBottom: Math.max(28, insets.bottom + 18) }]}><View style={styles.sheetHandle} />{blockTypes.map(([type, label, icon], itemIndex) => <Pressable key={type} onPress={() => type === 'IMAGE' ? pickPhoto() : type === 'VOICE' ? startVoice() : openForm(type)} style={[styles.editorSheetRow, itemIndex === blockTypes.length - 1 && styles.editorSheetRowLast]}><Ionicons color={colors.muted} name={icon} size={17} /><Text style={styles.editorSheetLabel}>{label}</Text></Pressable>)}</View></View></Modal><BlockFormModal block={currentEditBlock} mode={formMode} onClose={() => { setFormMode(null); setEditingBlock(null); }} onSave={upsertBlock} />{voiceMode === 'recording' ? <View style={styles.recordingOverlay}><View style={styles.recordingCard}><Text style={styles.recordingTitle}>Just talk</Text><Text style={styles.recordingClock}>{clock(recorderState.durationMillis / 1000)}</Text><Text style={styles.recordingHint}>Your real transcript appears after recording.</Text><View style={styles.recordingBars}>{(waveform.length ? waveform.slice(-18) : [.18, .3, .22, .4]).map((value, itemIndex) => <View key={itemIndex} style={[styles.recordingBar, { height: Math.max(7, value * 34) }]} />)}</View><Pressable onPress={stopVoice} style={styles.recordingStop}><Ionicons color={colors.bg} name="square" size={16} /></Pressable></View></View> : null}</KeyboardAvoidingView></SafeAreaView>;
}

function SuccessView({ onDone, publication, state }: { onDone: () => void; publication: ExperiencePublication | null; state: ExperienceState }) {
  return <View style={styles.success}><Ionicons color={colors.blue} name="sparkles" size={42} /><Text style={styles.successTitle}>Your Experience is live</Text><Text style={styles.copy}>"{publication?.title || state.title}" is live - it now shows in Experiences on your profile.</Text><Primary onPress={onDone}>See it on profile</Primary></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,.07)', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  headerSub: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  headerPill: { minHeight: 29, borderRadius: 99, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  headerPillText: { color: colors.muted, fontSize: 10.5, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.12)' },
  dotOn: { backgroundColor: '#6FA9E8' },
  dotActive: { width: 18, backgroundColor: colors.blue },
  body: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 42 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', backgroundColor: 'rgba(24,29,37,.86)', color: colors.text, paddingHorizontal: 15, fontSize: 13 },
  smallInput: { marginTop: 10, fontSize: 12.5 },
  label: { color: colors.faint, fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginTop: 20 },
  rowGap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 },
  pill: { borderRadius: 99, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 10 },
  pillOn: { borderColor: colors.blue, backgroundColor: colors.blue },
  pillText: { color: colors.muted, fontSize: 13, fontWeight: '900' },
  pillTextOn: { color: colors.bg },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  star: { color: colors.muted, fontSize: 15 },
  priceInput: { width: 110, minHeight: 42, paddingHorizontal: 12 },
  meta: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 7 },
  download: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, paddingHorizontal: 13, marginTop: 12 },
  downloadOn: { borderColor: 'rgba(156,203,255,.35)' },
  downloadTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  downloadSub: { color: colors.faint, fontSize: 9, marginTop: 3 },
  downloadState: { color: colors.faint, fontSize: 12, fontWeight: '900' },
  activeText: { color: colors.blue, fontWeight: '900' },
  flex: { flex: 1, minWidth: 0 },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  coverPreview: { width: 136, height: 76, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 },
  coverImage: { width: '100%', height: '100%' },
  coverHint: { position: 'absolute', bottom: 6, left: 8, color: colors.text, fontSize: 9, fontWeight: '900' },
  upload: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', paddingHorizontal: 14, paddingVertical: 8 },
  uploadText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  generateDisabled: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 10, opacity: .75 },
  generateText: { color: colors.blue, fontSize: 12, fontWeight: '900' },
  trustCopy: { color: colors.muted, fontSize: 11.5, lineHeight: 18, marginTop: 8 },
  trustDashed: { minHeight: 74, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(156,203,255,.35)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 12, paddingHorizontal: 14 },
  trustOn: { backgroundColor: 'rgba(156,203,255,.07)', borderColor: 'rgba(156,203,255,.45)' },
  trustAction: { color: colors.blue, fontSize: 12.5, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  videoPreviewWrap: { height: 150, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(156,203,255,.32)', backgroundColor: colors.surface2, marginTop: 12 },
  videoPreview: { width: '100%', height: '100%' },
  videoPlayButton: { position: 'absolute', top: '50%', left: '50%', width: 52, height: 52, marginLeft: -26, marginTop: -26, borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,.72)', backgroundColor: 'rgba(10,12,15,.44)', alignItems: 'center', justifyContent: 'center' },
  videoDuration: { position: 'absolute', left: 10, bottom: 8, overflow: 'hidden', borderRadius: 9, backgroundColor: 'rgba(10,12,15,.72)', color: colors.text, fontSize: 10, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 3 },
  previewRemove: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(10,12,15,.72)', alignItems: 'center', justifyContent: 'center' },
  previewPhotoRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  previewPhotoSlot: { flex: 1, height: 62, borderRadius: 11, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.20)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.02)' },
  slotRemove: { position: 'absolute', top: 4, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(10,12,15,.76)', alignItems: 'center', justifyContent: 'center' },
  inlineRemove: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(10,12,15,.62)', alignItems: 'center', justifyContent: 'center' },
  voiceRow: { minHeight: 40, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.20)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 9, paddingHorizontal: 12 },
  voiceText: { color: colors.muted, fontSize: 12, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  voiceWave: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  voiceBar: { width: 3, borderRadius: 2, backgroundColor: colors.blue },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  primaryText: { color: colors.bg, fontSize: 14.5, fontWeight: '900' },
  disabled: { opacity: .55 },
  inlineError: { color: colors.danger, fontSize: 12, marginBottom: 10 },
  copy: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 18, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(110,207,151,.2)', backgroundColor: 'rgba(110,207,151,.06)', padding: 11, marginTop: 12 },
  microHint: { color: colors.faint, fontSize: 9.5, marginTop: 10, marginBottom: 4 },
  chapterRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.05)' },
  chapterThumb: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  chapterThumbSmall: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  chapterNumber: { color: colors.faint, fontSize: 11, fontWeight: '900' },
  chapterCopy: { flex: 1, minWidth: 0 },
  chapterTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  chapterSub: { color: colors.faint, fontSize: 10, marginTop: 3 },
  addLine: { flexDirection: 'row', gap: 8, marginTop: 10 },
  addInput: { flex: 1 },
  addButton: { borderRadius: 12, backgroundColor: colors.blue, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  addText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  centerMeta: { color: colors.faint, textAlign: 'center', fontSize: 11, marginTop: 12 },
  notes: { marginTop: 18 },
  notesText: { color: colors.faint, fontSize: 12, fontWeight: '800' },
  segment: { height: 42, borderRadius: 14, backgroundColor: colors.surface2, flexDirection: 'row', padding: 3 },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  segOn: { backgroundColor: colors.blue },
  segText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  segTextOn: { color: colors.bg },
  freeChip: { borderRadius: 99, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, paddingVertical: 5 },
  freeChipOn: { borderColor: colors.blue, backgroundColor: 'rgba(156,203,255,.12)' },
  freeChipText: { color: colors.faint, fontSize: 10, fontWeight: '900' },
  freeChipTextOn: { color: colors.blue },
  revenue: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  reviewCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: colors.surface },
  reviewCover: { height: 168 },
  reviewCopy: { position: 'absolute', left: 16, right: 16, bottom: 12 },
  reviewTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  reviewMeta: { color: colors.muted, fontSize: 10.5, marginTop: 4 },
  reviewBody: { padding: 14 },
  previewChapter: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.04)' },
  previewState: { color: '#6ECF97', fontSize: 11, fontWeight: '800' },
  editorHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  done: { height: 48, borderRadius: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  doneText: { color: colors.bg, fontWeight: '900' },
  editorInput: { minHeight: 110, textAlignVertical: 'top', marginTop: 10, paddingTop: 14 },
  extraInput: { minHeight: 70, textAlignVertical: 'top', marginTop: 8, paddingTop: 12 },
  toolChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(156,203,255,.28)', backgroundColor: 'rgba(156,203,255,.08)', paddingHorizontal: 12, paddingVertical: 8 },
  toolText: { color: colors.blue, fontSize: 11, fontWeight: '900' },
  blockRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  blockText: { color: colors.muted, fontSize: 12 },
  blockImage: { width: 36, height: 36, borderRadius: 8 },
  chapterEditorSafe: { flex: 1, backgroundColor: colors.bg },
  chapterEditorScreen: { flex: 1, backgroundColor: colors.bg },
  chapterTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 24, paddingBottom: 10, zIndex: 4, backgroundColor: 'rgba(10,12,15,.02)' },
  chapterTopCopy: { flex: 1, minWidth: 0 },
  chapterEditorTitle: { color: colors.text, fontSize: 13.5, fontWeight: '900' },
  chapterEditorHelp: { color: colors.faint, fontSize: 9, marginTop: 4 },
  editorDoneButton: { minWidth: 66, height: 29, borderRadius: 999, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17 },
  editorDoneText: { color: colors.bg, fontSize: 12, fontWeight: '800' },
  editorCanvas: { flexGrow: 1, minHeight: '100%', paddingHorizontal: 22, paddingTop: 28 },
  editorTextCanvas: { minHeight: 52, color: '#EDEFF3', fontSize: 15.5, lineHeight: 25, padding: 0, marginBottom: 5 },
  colorPalette: { position: 'absolute', left: 22, right: 22, bottom: 78, zIndex: 99, alignSelf: 'center', gap: 9, borderRadius: 18, backgroundColor: 'rgba(16,20,27,.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', paddingHorizontal: 14, paddingVertical: 11 },
  colorPaletteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorAa: { width: 19, color: 'rgba(255,255,255,.85)', fontSize: 10.5, fontWeight: '900' },
  colorIconSlot: { width: 19 },
  colorSplitIcon: { width: 12, height: 12, borderRadius: 4, marginRight: 7, backgroundColor: 'rgba(255,255,255,.38)' },
  colorDot: { width: 15, height: 15, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.18)' },
  colorDotRound: { borderRadius: 8 },
  colorDotSquare: { borderRadius: 4.5 },
  colorDotMuted: { opacity: .5 },
  colorDivider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,.14)' },
  colorClear: { padding: 2 },
  editorEmpty: { position: 'absolute', top: '43%', left: 0, right: 0, alignItems: 'center' },
  editorEmptyMain: { color: colors.muted, fontSize: 12.5, lineHeight: 24, fontWeight: '600' },
  editorEmptySub: { color: colors.faint, fontSize: 12, lineHeight: 24, marginTop: 2 },
  editorBottomHint: { position: 'absolute', left: 22, right: 22, alignItems: 'center', zIndex: 7 },
  editorBottomHintText: { maxWidth: '100%', overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(10,13,18,.60)', borderWidth: 1, borderColor: 'rgba(255,255,255,.05)', color: colors.faint, fontSize: 9.5, paddingHorizontal: 12, paddingVertical: 6 },
  transcribingPill: { position: 'absolute', alignSelf: 'center', bottom: 132, zIndex: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(156,203,255,.22)', backgroundColor: 'rgba(16,20,27,.94)', paddingHorizontal: 13, paddingVertical: 8 },
  transcribingText: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  editorPlus: { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', backgroundColor: 'rgba(10,13,18,.55)', alignItems: 'center', justifyContent: 'center', zIndex: 8 },
  editorSheetLayer: { flex: 1, justifyContent: 'flex-end' },
  editorSheetDim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4,6,10,.22)' },
  editorAddSheet: { backgroundColor: '#0C0F14', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 10 },
  sheetHandle: { width: 32, height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.28)', alignSelf: 'center', marginBottom: 8 },
  editorSheetRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.055)' },
  editorSheetRowLast: { borderBottomWidth: 0 },
  editorSheetLabel: { color: colors.text, fontSize: 13, fontWeight: '900' },
  editorBlock: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.045)' },
  editorBlockGrip: { width: 18, alignItems: 'center' },
  editorBlockBody: { flex: 1, minWidth: 0 },
  editorBlockActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  editorTextBlock: { alignSelf: 'stretch', borderRadius: 4, marginTop: 7, marginBottom: 7, paddingVertical: 1 },
  editorTextBlockText: { color: '#EDEFF3', fontSize: 15.5, lineHeight: 26 },
  voiceTranscriptMeta: { color: colors.faint, fontSize: 9.5, marginTop: 4, fontWeight: '800' },
  editorInlineBlock: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 },
  editorBlockText: { color: colors.muted, fontSize: 12.5, lineHeight: 18, flex: 1 },
  editorLinkCard: { flexDirection: 'row', alignItems: 'center', gap: 11, marginVertical: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 },
  editorLinkTitle: { color: colors.text, fontSize: 12.5, fontWeight: '900' },
  editorLinkUrl: { color: colors.faint, fontSize: 10, marginTop: 2 },
  editorListBlock: { marginTop: 12, marginBottom: 12, gap: 5 },
  editorListInputRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 26 },
  editorListBullet: { color: colors.text, fontSize: 16, width: 10 },
  editorListInput: { flex: 1, color: colors.text, fontSize: 15.5, lineHeight: 24, padding: 0 },
  editorMediaBlock: { position: 'relative', height: 320, borderRadius: 10, overflow: 'hidden', marginTop: 10, marginBottom: 36, backgroundColor: colors.surface2 },
  editorPhoto: { width: '100%', height: '100%', backgroundColor: colors.surface2 },
  editorMediaRemove: { position: 'absolute', top: 8, left: 10, width: 25, height: 25, borderRadius: 13, backgroundColor: 'rgba(10,13,18,.56)', alignItems: 'center', justifyContent: 'center' },
  editorCaptionInput: { position: 'absolute', left: 12, right: 12, bottom: 8, minHeight: 28, maxHeight: 82, color: colors.text, fontSize: 14, lineHeight: 19, padding: 0, textShadowColor: 'rgba(0,0,0,.65)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  editorAudioBlock: { marginTop: 10, marginBottom: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9 },
  editorAudioRemove: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  editorVoice: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 250, maxWidth: '100%', minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(156,203,255,.22)', backgroundColor: 'rgba(24,29,37,.72)', paddingHorizontal: 13, paddingVertical: 9 },
  editorVoicePlay: { width: 27, height: 27, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  editorWave: { flex: 1, minWidth: 0, height: 24, flexDirection: 'row', alignItems: 'center', gap: 2 },
  editorWaveBar: { width: 3, borderRadius: 2, backgroundColor: colors.blue, opacity: .78 },
  editorVoiceTime: { color: colors.blue, fontSize: 10, fontWeight: '900' },
  editorListItem: { color: '#EDEFF3', fontSize: 13.5, lineHeight: 23 },
  editorPollQuestion: { color: colors.text, fontSize: 13.5, fontWeight: '900', marginBottom: 8 },
  editorPollOption: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(156,203,255,.30)', paddingHorizontal: 12, paddingVertical: 8, marginTop: 7 },
  editorPollText: { color: colors.muted, fontSize: 12 },
  editorPollCard: { marginVertical: 10, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 },
  editorPollHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  editorPollQuestionInput: { flex: 1, minHeight: 22, color: colors.text, fontSize: 13, fontWeight: '900', padding: 0 },
  editorPollInput: { minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(156,203,255,.30)', color: colors.text, paddingHorizontal: 12, paddingVertical: 8, marginTop: 9, fontSize: 12 },
  editorPollAdd: { color: colors.faint, fontSize: 10, marginTop: 11, fontWeight: '800' },
  editorModalLayer: { flex: 1, justifyContent: 'flex-end' },
  editorScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4,6,10,.55)' },
  editorFormSheet: { backgroundColor: '#0C0F14', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  editorTightSheet: { backgroundColor: '#0C0F14', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20 },
  tightInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tightInput: { flex: 1, minHeight: 39, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(156,203,255,.45)', color: colors.text, paddingHorizontal: 14, fontSize: 13 },
  tightAdd: { paddingHorizontal: 6, paddingVertical: 8 },
  tightAddText: { color: colors.blue, fontSize: 13, fontWeight: '900' },
  tightAddTextOff: { opacity: .4 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  formTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  editorFormInput: { minHeight: 43, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', backgroundColor: colors.surface2, color: colors.text, paddingHorizontal: 14, fontSize: 13, marginTop: 8 },
  formList: { marginTop: 2 },
  formItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formItemInput: { flex: 1 },
  formIconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  formAdd: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10 },
  formAddText: { color: colors.blue, fontSize: 12, fontWeight: '900' },
  formDone: { minHeight: 43, borderRadius: 999, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  formDoneText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  recordingOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8,10,13,.96)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  recordingCard: { alignItems: 'center', gap: 16 },
  recordingTitle: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  recordingClock: { color: colors.text, fontSize: 32, fontWeight: '900' },
  recordingHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 260 },
  recordingBars: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 3 },
  recordingBar: { width: 3, borderRadius: 2, backgroundColor: colors.blue },
  recordingStop: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  success: { alignItems: 'center', paddingTop: 60, gap: 12 },
  successTitle: { color: colors.text, fontSize: 24, fontWeight: '900' },
});

