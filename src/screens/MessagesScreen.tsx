import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Avatar } from '../components/Avatar';
import { BottomNav } from '../components/BottomNav';
import { ScreenState, SkeletonRows } from '../components/ScreenState';
import { api, resolveMediaUrl } from '../services/api';
import { getMessageSocket } from '../services/messageSocket';
import { colors } from '../theme';
import { newClientMessageId, relativeTime, userName } from '../utils/format';
import type { ChatGift, Conversation, DirectAccessWindow, MainTab, Message, MessageGroup, Session, User } from '../types';

type InboxTab = 'all' | 'requests' | 'direct';
type InboxFilter = 'all' | 'unread' | 'unanswered' | 'verified' | 'story' | 'members' | 'experience' | 'dream';

const INBOX_FILTERS: { id: InboxFilter; icon: keyof typeof Ionicons.glyphMap; label: string; subtitle?: string; creatorOnly?: boolean }[] = [
  { id: 'all', icon: 'file-tray-outline', label: 'All' },
  { id: 'unread', icon: 'ellipse-outline', label: 'Unread' },
  { id: 'unanswered', icon: 'chatbubble-outline', label: 'Unanswered' },
  { id: 'verified', icon: 'shield-checkmark-outline', label: 'Verified' },
  { id: 'story', icon: 'eye-outline', label: 'Story replies' },
  { id: 'members', icon: 'people-outline', label: 'My World members', subtitle: 'they pay monthly', creatorOnly: true },
  { id: 'experience', icon: 'lock-open-outline', label: 'Unlocked my experience', subtitle: 'one-time buyers', creatorOnly: true },
  { id: 'dream', icon: 'star-outline', label: 'Dream keepers', subtitle: 'they backed your dream', creatorOnly: true },
];

const MAX_VOICE_SECONDS = 300;

function clock(seconds = 0) {
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function uploadName(uri: string, fallback: string, extension: string) {
  const raw = uri.split('/').pop()?.split('?')[0] || '';
  return /\.[a-z0-9]+$/i.test(raw) ? raw : `${fallback}-${Date.now()}.${extension}`;
}

function videoMime(asset: ImagePicker.ImagePickerAsset) {
  const name = asset.fileName || asset.uri;
  return asset.mimeType || (/\.(mov)$/i.test(name) ? 'video/quicktime' : /\.(webm)$/i.test(name) ? 'video/webm' : 'video/mp4');
}

function imageMime(asset: ImagePicker.ImagePickerAsset) {
  const name = asset.fileName || asset.uri;
  return asset.mimeType || (/\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg');
}

function audioMime(uri: string) {
  return /\.(webm)$/i.test(uri) ? 'audio/webm' : /\.(ogg)$/i.test(uri) ? 'audio/ogg' : /\.(wav)$/i.test(uri) ? 'audio/wav' : 'audio/mp4';
}

function preview(message?: Message) {
  if (!message) return 'No messages yet.';
  if (message.locked) return 'Disappearing message';
  if (message.sharedContent) return message.sharedContent.previewText || message.sharedContent.title || 'Shared content';
  if (message.mediaType === 'image') return 'Image';
  if (message.mediaType === 'audio') return 'Voice message';
  if (message.mediaType === 'video') return 'Video note';
  if (message.mediaType === 'gift') return message.gift?.name ? `Gift: ${message.gift.name}` : 'Gift';
  return message.body || 'Message';
}

function daLabel(window?: DirectAccessWindow | null) {
  if (!window) return '';
  if (window.settlementStatus === 'REFUNDED') return 'Refunded';
  if (window.status === 'OPEN') return 'Pending';
  if (window.status === 'ANSWERED' || window.answeredAt) return 'Answered';
  if (window.status === 'EXPIRED') return 'Expired';
  if (window.status === 'CLOSED') return window.settlementStatus === 'CAPTURED' ? 'Answered' : 'Closed';
  return window.status ? window.status.toLowerCase() : '';
}

function otherForWindow(window: DirectAccessWindow, session: Session): User {
  const myId = String(session.user.id || session.user._id || '');
  return String(window.creatorId) === myId ? window.fan || { id: window.fanId } : window.creator || { id: window.creatorId };
}

function decorateConversations(conversations: Conversation[], windows: DirectAccessWindow[], session: Session) {
  const latestWindowByOther = new Map<string, DirectAccessWindow>();
  windows.forEach((window) => {
    const other = otherForWindow(window, session);
    const otherId = String(other.id || other._id || '');
    if (!otherId) return;
    const current = latestWindowByOther.get(otherId);
    if (!current || new Date(window.createdAt || 0).getTime() > new Date(current.createdAt || 0).getTime()) latestWindowByOther.set(otherId, window);
  });
  const byId = new Map(conversations.map((item) => [String(item.id), { ...item, directAccessWindow: latestWindowByOther.get(String(item.id)) || null }]));
  latestWindowByOther.forEach((window, otherId) => {
    if (byId.has(otherId)) return;
    byId.set(otherId, {
      id: otherId,
      participant: otherForWindow(window, session),
      lastMessage: { id: window.id, body: window.questionQuote || `Direct Access ${daLabel(window).toLowerCase()}`, createdAt: window.updatedAt || window.createdAt },
      unreadCount: 0,
      status: 'ACTIVE',
      archived: false,
      requestReceived: false,
      directAccessWindow: window,
    });
  });
  return [...byId.values()].sort((left, right) => new Date(right.lastMessage?.createdAt || right.directAccessWindow?.updatedAt || 0).getTime() - new Date(left.lastMessage?.createdAt || left.directAccessWindow?.updatedAt || 0).getTime());
}

function VoiceBubble({ audio, mine }: { audio?: Message['audio']; mine: boolean }) {
  const source = audio?.url ? { uri: resolveMediaUrl(audio.url) } : null;
  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const bars = audio?.waveform?.length ? audio.waveform.slice(0, 24) : [0.25, 0.55, 0.35, 0.72, 0.42, 0.62, 0.28, 0.5, 0.76, 0.46, 0.3, 0.58];
  const duration = audio?.duration || status.duration || 0;
  const toggle = () => {
    if (!source) return;
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish) player.seekTo(0).catch(() => {});
      player.play();
    }
  };
  return <View style={[styles.mediaPill, mine && styles.mediaPillMine]}>
    <Pressable accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'} disabled={!source} onPress={toggle} style={[styles.mediaPlay, mine && styles.mediaPlayMine]}>
      <Ionicons color={mine ? colors.bg : colors.blue} name={status.playing ? 'pause' : 'play'} size={14} />
    </Pressable>
    <View style={styles.waveform}>{bars.map((value, index) => <View key={`${index}-${value}`} style={[styles.waveBar, mine && styles.waveBarMine, { height: Math.max(6, Math.min(24, value * 26)) }]} />)}</View>
    <Text style={[styles.mediaDuration, mine && styles.mediaDurationMine]}>{clock(duration)}</Text>
  </View>;
}

function VideoBubble({ video, mine }: { video?: Message['video']; mine: boolean }) {
  return <View style={[styles.videoBubble, mine && styles.videoBubbleMine]}>
    <View style={[styles.videoIcon, mine && styles.videoIconMine]}><Ionicons color={mine ? colors.bg : colors.blue} name="videocam" size={18} /></View>
    <View style={styles.videoCopy}>
      <Text style={[styles.videoTitle, mine && styles.videoTitleMine]}>Video note</Text>
      <Text style={[styles.mediaDuration, mine && styles.mediaDurationMine]}>{video?.duration ? clock(video.duration) : 'Ready to view'}</Text>
    </View>
  </View>;
}

function VoiceComposer({ disabled, onSend }: { disabled: boolean; onSend: (uri: string, duration: number, waveform: number[]) => Promise<void> }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 120);
  const [mode, setMode] = useState<'idle' | 'recording' | 'preview' | 'uploading'>('idle');
  const [voiceUri, setVoiceUri] = useState('');
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);

  useEffect(() => {
    if (mode !== 'recording') return;
    const metering = typeof recorderState.metering === 'number' ? recorderState.metering : -48;
    const level = Math.max(0.12, Math.min(1, (metering + 60) / 60));
    setWaveform((current) => [...current.slice(-29), level]);
    if (recorderState.durationMillis >= MAX_VOICE_SECONDS * 1000) {
      recorder.stop().then(() => {
        setVoiceUri(recorder.uri || recorderState.url || '');
        setDuration(MAX_VOICE_SECONDS);
        setMode('preview');
      }).catch(() => setMode('idle'));
    }
  }, [mode, recorder, recorderState.durationMillis, recorderState.metering, recorderState.url]);

  const start = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to record a voice message.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      setWaveform([]);
      setVoiceUri('');
      setDuration(0);
      await recorder.prepareToRecordAsync({ ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true });
      recorder.record({ forDuration: MAX_VOICE_SECONDS });
      setMode('recording');
    } catch (error) {
      Alert.alert('Recording failed', error instanceof Error ? error.message : 'The microphone could not be started.');
      setMode('idle');
    }
  };
  const stop = async () => {
    try {
      await recorder.stop();
      setVoiceUri(recorder.uri || recorderState.url || '');
      setDuration(Math.max(1, Math.round(recorderState.durationMillis / 1000)));
      setMode('preview');
    } catch (error) {
      Alert.alert('Recording failed', error instanceof Error ? error.message : 'Could not finish the voice message.');
      setMode('idle');
    }
  };
  const discard = () => {
    setVoiceUri('');
    setDuration(0);
    setWaveform([]);
    setMode('idle');
  };
  const cancelRecording = async () => {
    try {
      if (recorderState.isRecording) await recorder.stop();
    } catch {
      // Recorder may already be stopped by the native module.
    }
    discard();
  };
  const send = async () => {
    if (!voiceUri) return;
    setMode('uploading');
    try {
      await onSend(voiceUri, duration, waveform.length ? waveform : [0.24, 0.5, 0.34, 0.62, 0.28, 0.48]);
      discard();
    } catch (error) {
      setMode('preview');
      Alert.alert('Voice upload failed', error instanceof Error ? error.message : 'Please retry.');
    }
  };

  if (mode === 'recording') return <View style={styles.recordingTray}><View style={styles.recordingDot} /><Text style={styles.recordingTime}>{clock(recorderState.durationMillis / 1000)}</Text><View style={styles.recordingBars}>{(waveform.length ? waveform : [0.18, 0.3, 0.22, 0.4]).map((value, index) => <View key={index} style={[styles.recordingBar, { height: Math.max(5, value * 22) }]} />)}</View><Pressable accessibilityLabel="Stop voice recording" onPress={stop} style={styles.stopButton}><Ionicons color={colors.bg} name="square" size={13} /></Pressable><Pressable accessibilityLabel="Cancel voice recording" onPress={cancelRecording} style={styles.inputIcon}><Ionicons color={colors.faint} name="trash-outline" size={18} /></Pressable></View>;
  if (mode === 'preview' || mode === 'uploading') return <View style={styles.recordingTray}><Ionicons color={colors.blue} name="mic" size={16} /><Text style={styles.recordingTime}>{clock(duration)}</Text><View style={styles.recordingBars}>{waveform.slice(-18).map((value, index) => <View key={index} style={[styles.recordingBar, { height: Math.max(5, value * 22) }]} />)}</View><Pressable accessibilityLabel="Discard voice message" disabled={mode === 'uploading'} onPress={discard} style={styles.inputIcon}><Ionicons color={colors.faint} name="trash-outline" size={18} /></Pressable><Pressable accessibilityLabel="Send voice message" disabled={mode === 'uploading'} onPress={send} style={styles.sendButtonSmall}>{mode === 'uploading' ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons color={colors.bg} name="send" size={15} />}</Pressable></View>;
  return <Pressable accessibilityLabel="Record voice message" disabled={disabled} onPress={start} style={[styles.inputIcon, disabled && styles.disabled]}><Ionicons color={colors.faint} name="mic-outline" size={20} /></Pressable>;
}

function MessageRow({ conversation, onArchive, onOpen }: { conversation: Conversation; onArchive: (conversation: Conversation) => void; onOpen: (conversation: Conversation) => void }) {
  const person = conversation.participant;
  const badge = daLabel(conversation.directAccessWindow);
  const request = conversation.status === 'REQUEST' || conversation.requestReceived;
  return <Pressable accessibilityRole="button" onLongPress={() => onArchive(conversation)} onPress={() => onOpen(conversation)} style={styles.row}>
    <Avatar size={42} user={person} />
    <View style={styles.rowCopy}>
      <View style={styles.rowTop}><Text numberOfLines={1} style={styles.rowName}>{userName(person)}</Text><Text style={styles.time}>{relativeTime(conversation.lastMessage?.createdAt)}</Text></View>
      <View style={styles.rowBottom}><Text numberOfLines={2} style={[styles.preview, conversation.unreadCount ? styles.unreadPreview : null]}>{preview(conversation.lastMessage)}</Text>{conversation.unreadCount ? <View style={styles.unreadDot}><Text style={styles.unreadText}>{conversation.unreadCount}</Text></View> : null}</View>
      <View style={styles.badgeLine}>{request ? <View style={styles.requestBadge}><Text style={styles.requestText}>Request</Text></View> : null}{badge ? <View style={[styles.daBadge, badge === 'Refunded' && styles.refundBadge]}><Text style={[styles.daText, badge === 'Refunded' && styles.refundText]}>{badge}</Text></View> : null}{conversation.muted ? <Ionicons color={colors.faint} name="notifications-off-outline" size={12} /> : null}</View>
    </View>
  </Pressable>;
}

function GiftSheet({ busy, gifts, onClose, onSend, visible }: { busy: boolean; gifts: ChatGift[]; onClose: () => void; onSend: (gift: ChatGift) => void; visible: boolean }) {
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><Pressable onPress={onClose} style={styles.modalBackdrop}><Pressable onPress={() => undefined} style={styles.giftSheet}><View style={styles.sheetHandle} /><View style={styles.filterHead}><View><Text style={styles.filterTitle}>Send a gift</Text><Text style={styles.giftHint}>Choose something that feels right.</Text></View><Pressable onPress={onClose} style={styles.filterClose}><Ionicons color={colors.muted} name="close" size={22} /></Pressable></View><FlatList columnWrapperStyle={styles.giftColumns} contentContainerStyle={styles.giftGrid} data={gifts} keyExtractor={(item) => item.id} numColumns={3} ListEmptyComponent={<Text style={styles.emptyPeople}>No gifts are available right now.</Text>} renderItem={({ item }) => <Pressable disabled={busy} onPress={() => onSend(item)} style={styles.giftCard}>{item.imageUrl ? <Image source={{ uri: resolveMediaUrl(item.imageUrl) }} resizeMode="contain" style={styles.giftArt} /> : <Ionicons color={colors.blue} name="gift-outline" size={34} />}<Text numberOfLines={1} style={styles.giftName}>{item.name}</Text><Text style={styles.giftPrice}>✦ {item.stars.toLocaleString()}</Text></Pressable>} /></Pressable></Pressable></Modal>;
}

function TimerSheet({ onClose, onSelect, selected, visible }: { onClose: () => void; onSelect: (seconds: number | null) => void; selected: number | null; visible: boolean }) {
  const options: [number | null, string][] = [[0, 'View once'], [3, '3 seconds'], [10, '10 seconds'], [30, '30 seconds'], [null, 'Off']];
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><Pressable onPress={onClose} style={styles.modalBackdrop}><Pressable onPress={() => undefined} style={styles.timerSheet}><View style={styles.sheetHandle} /><View style={styles.filterHead}><View><Text style={styles.filterTitle}>Disappearing message</Text><Text style={styles.giftHint}>The timer starts when they open it.</Text></View><Pressable onPress={onClose} style={styles.filterClose}><Ionicons color={colors.muted} name="close" size={22} /></Pressable></View>{options.map(([seconds, label]) => <Pressable key={label} onPress={() => { onSelect(seconds); onClose(); }} style={styles.filterRow}><Text style={styles.timerLabel}>{label}</Text>{selected === seconds ? <Ionicons color={colors.blue} name="checkmark" size={20} /> : null}</Pressable>)}<Text style={styles.timerNotice}>Disappearing messages are removed for both people after opening. Recipients may still capture content before it disappears.</Text></Pressable></Pressable></Modal>;
}

function ChatModal({ conversation, onClose, onRefresh, session }: { conversation: Conversation | null; onClose: () => void; onRefresh: () => void; session: Session }) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(conversation?.status || 'ACTIVE');
  const [giftOpen, setGiftOpen] = useState(false);
  const [gifts, setGifts] = useState<ChatGift[]>([]);
  const [timerOpen, setTimerOpen] = useState(false);
  const [disappearAfterSeconds, setDisappearAfterSeconds] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [disappearingViewer, setDisappearingViewer] = useState<Message | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const otherId = conversation?.id || '';
  const windowId = conversation?.directAccessWindow?.id || null;
  const myId = String(session.user.id || session.user._id || '');
  useEffect(() => setSelectedStatus(conversation?.status || 'ACTIVE'), [conversation]);
  useEffect(() => { if (!conversation) { setGiftOpen(false); setTimerOpen(false); setReplyTo(null); setDisappearAfterSeconds(null); } }, [conversation]);
  const load = useCallback(async () => {
    if (!conversation) return;
    setLoading(true);
    try {
      setMessages((await api.listMessages(otherId, { directAccessWindowId: windowId }, session.accessToken)).messages || []);
      onRefresh();
    } catch (error) {
      Alert.alert('Could not open chat', error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setLoading(false);
    }
  }, [conversation, onRefresh, otherId, session.accessToken, windowId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!conversation) return undefined;
    const socket = getMessageSocket(session.accessToken);
    if (!socket) return undefined;
    const receiveMessage = ({ message }: { message?: Message }) => {
      if (!message?.id) return;
      const incomingOtherId = message.senderId === myId ? message.recipientId : message.senderId;
      if (String(incomingOtherId) !== String(otherId)) return;
      if ((message.directAccessWindowId || null) !== windowId) return;
      setMessages((current) => current.some((item) => item.id === message.id || (message.clientMessageId && item.clientMessageId === message.clientMessageId))
        ? current.map((item) => item.id === message.id || (message.clientMessageId && item.clientMessageId === message.clientMessageId) ? { ...item, ...message } : item)
        : [...current, message]);
      onRefresh();
    };
    const markRead = ({ byUserId, readAt }: { byUserId?: string; readAt?: string }) => {
      if (!byUserId) return;
      setMessages((current) => current.map((message) => (
        message.senderId === myId && message.recipientId === byUserId && !message.readAt
          ? { ...message, readAt: readAt || new Date().toISOString() }
          : message
      )));
    };
    const deleteMessage = ({ messageId, message }: { messageId?: string; message?: Message }) => {
      if (!messageId) return;
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, ...(message || {}), body: message?.body || 'This message was deleted' } : item));
      onRefresh();
    };
    const hideMessage = ({ messageId, hiddenForUserId }: { messageId?: string; hiddenForUserId?: string }) => {
      if (!messageId || hiddenForUserId !== myId) return;
      setMessages((current) => current.filter((item) => item.id !== messageId));
      onRefresh();
    };
    socket.on('message:new', receiveMessage);
    socket.on('messages:read', markRead);
    socket.on('message:deleted', deleteMessage);
    socket.on('message:hidden', hideMessage);
    return () => {
      socket.off('message:new', receiveMessage);
      socket.off('messages:read', markRead);
      socket.off('message:deleted', deleteMessage);
      socket.off('message:hidden', hideMessage);
    };
  }, [conversation, myId, onRefresh, otherId, session.accessToken, windowId]);
  const send = async () => {
    if (!text.trim() || !conversation) return;
    const body = text.trim();
    const clientMessageId = newClientMessageId();
    setText('');
    setSending(true);
    try {
      const result = await api.sendMessage(otherId, body, clientMessageId, windowId, session.accessToken, { replyToId: replyTo?.id || null, disappearAfterSeconds });
      setMessages((current) => [...current, result.message]);
      setReplyTo(null);
      onRefresh();
    } catch (error) {
      setText(body);
      Alert.alert('Message failed', error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setSending(false);
    }
  };
  const sendVoice = async (uri: string, duration: number, waveform: number[]) => {
    if (!conversation) return;
    setSending(true);
    try {
      const result = await api.sendVoiceMessage(otherId, { uri, name: uploadName(uri, 'voice', 'm4a'), type: audioMime(uri) }, { clientMessageId: newClientMessageId(), directAccessWindowId: windowId, waveform, disappearAfterSeconds }, session.accessToken);
      setMessages((current) => [...current, result.message]);
      onRefresh();
    } finally {
      setSending(false);
    }
  };
  const sendVideoNote = async () => {
    if (!conversation || sending) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera needed', 'Allow camera access to record a video note.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], cameraType: ImagePicker.CameraType.front, videoMaxDuration: 60, quality: 0.7 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mimeType = videoMime(asset);
      setSending(true);
      const sent = await api.sendVideoNote(otherId, { uri: asset.uri, name: asset.fileName || uploadName(asset.uri, 'video-note', mimeType.includes('quicktime') ? 'mov' : mimeType.includes('webm') ? 'webm' : 'mp4'), type: mimeType }, { clientMessageId: newClientMessageId(), directAccessWindowId: windowId, disappearAfterSeconds }, session.accessToken);
      setMessages((current) => [...current, sent.message]);
      onRefresh();
    } catch (error) {
      Alert.alert('Video note failed', error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setSending(false);
    }
  };
  const sendImage = async () => {
    if (!conversation || sending) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert('Photos needed', 'Allow photo access to send an image.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const type = imageMime(asset);
      setSending(true);
      const sent = await api.sendImageMessage(otherId, { uri: asset.uri, name: asset.fileName || uploadName(asset.uri, 'photo', type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'), type }, { clientMessageId: newClientMessageId(), directAccessWindowId: windowId, disappearAfterSeconds }, session.accessToken);
      setMessages((current) => [...current, sent.message]);
      onRefresh();
    } catch (error) {
      Alert.alert('Photo failed', error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setSending(false);
    }
  };
  const acceptRequest = async () => {
    try {
      await api.acceptRequest(otherId, session.accessToken);
      setSelectedStatus('ACTIVE');
      onRefresh();
    } catch (error) {
      Alert.alert('Could not accept', error instanceof Error ? error.message : 'Please retry.');
    }
  };
  const openGifts = async () => {
    setGiftOpen(true);
    try { setGifts((await api.listChatGifts(otherId, session.accessToken)).gifts || []); }
    catch (error) { setGiftOpen(false); Alert.alert('Gifts unavailable', error instanceof Error ? error.message : 'Please retry.'); }
  };
  const sendGift = async (gift: ChatGift) => {
    setSending(true);
    try {
      const result = await api.sendChatGift(otherId, gift.id, `mobile-gift:${newClientMessageId()}`, '', disappearAfterSeconds, session.accessToken);
      setMessages((current) => [...current, result.message]);
      setGiftOpen(false);
      onRefresh();
    } catch (error) { Alert.alert('Gift failed', error instanceof Error ? error.message : 'Please retry.'); }
    finally { setSending(false); }
  };
  const declineRequest = () => Alert.alert('Delete this request?', `The conversation with ${userName(conversation?.participant)} will be removed.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await api.declineRequest(otherId, session.accessToken); onRefresh(); onClose(); } }]);
  const conversationMenu = () => Alert.alert(userName(conversation?.participant), undefined, [
    { text: conversation?.muted ? 'Turn notifications on' : 'Mute notifications', onPress: async () => { await api.muteConversation(otherId, !conversation?.muted, session.accessToken); onRefresh(); } },
    { text: conversation?.archived ? 'Move to inbox' : 'Archive chat', onPress: async () => { await api.archiveConversation(otherId, !conversation?.archived, session.accessToken); onRefresh(); } },
    { text: 'Report chat', onPress: async () => { await api.reportConversation(otherId, 'OTHER', session.accessToken); Alert.alert('Report sent', 'Thanks. We will review this conversation.'); } },
    { text: 'Delete chat', style: 'destructive', onPress: () => Alert.alert('Delete conversation?', 'This removes the conversation from your inbox.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await api.deleteConversation(otherId, session.accessToken); onRefresh(); onClose(); } }]) },
    { text: 'Cancel', style: 'cancel' },
  ]);
  const messageMenu = (item: Message, mine: boolean) => Alert.alert('Message', undefined, [
    { text: 'Reply', onPress: () => setReplyTo(item) },
    ...(item.mediaType !== 'gift' ? [{ text: 'Forward', onPress: () => setForwardMessage(item) }] : []),
    ...['❤️', '😂', '🔥', '👏'].map((emoji) => ({ text: `React ${emoji}`, onPress: async () => { const result = await api.reactToMessage(item.id, emoji, session.accessToken); setMessages((current) => current.map((message) => message.id === item.id ? { ...message, ...(result.message || {}), viewerReaction: emoji } : message)); } })),
    { text: 'Remove for me', style: 'destructive' as const, onPress: async () => { await api.deleteMessage(item.id, 'me', session.accessToken); setMessages((current) => current.filter((message) => message.id !== item.id)); } },
    ...(mine ? [{ text: 'Unsend for everyone', style: 'destructive' as const, onPress: async () => { const result = await api.deleteMessage(item.id, 'everyone', session.accessToken); setMessages((current) => current.map((message) => message.id === item.id ? { ...message, ...(result.message || {}), body: 'This message was deleted', deletedForEveryone: true } : message)); } }] : []),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
  const openDisappearing = async (item: Message) => {
    if (String(item.senderId) === myId) return;
    try { setDisappearingViewer((await api.openDisappearingMessage(item.id, session.accessToken)).message); }
    catch (error) { Alert.alert('Message unavailable', error instanceof Error ? error.message : 'This message has expired.'); }
  };
  const renderMessage = ({ item }: { item: Message }) => {
    const mine = String(item.senderId) === myId;
    const image = resolveMediaUrl(item.image?.url || item.sharedContent?.imageUrl || '');
    const reaction = item.viewerReaction || item.reactions?.[0]?.emoji;
    const storyImage = resolveMediaUrl(item.storyReply?.imageUrl || '');
    return <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}>
      {item.storyReply ? <View style={[styles.storyReplyWrap, mine && styles.bubbleWrapMine]}><Text style={styles.storyReplyLabel}>{mine ? 'You reacted to their story' : 'Reacted to your story'}</Text><Pressable onLongPress={() => messageMenu(item, mine)} style={styles.storyReplyCard}>{storyImage ? <Image source={{ uri: storyImage }} style={styles.storyReplyImage} /> : <View style={styles.storyUnavailable}><Ionicons color={colors.faint} name="time-outline" size={24} /><Text style={styles.storyUnavailableText}>Story unavailable</Text></View>}<Text style={styles.storyTime}>{relativeTime(item.createdAt)} {mine ? '✓✓' : ''}</Text></Pressable><Text style={[styles.storyReaction, mine && styles.storyReactionMine]}>{item.storyReply.reaction || '❤️'}</Text></View> : <Pressable onLongPress={() => messageMenu(item, mine)} style={[styles.bubble, item.mediaType === 'gift' && styles.giftMessageBubble, mine && styles.bubbleMine]}>
        {item.replyTo ? <View style={[styles.replyQuote, mine && styles.replyQuoteMine]}><Text style={[styles.replyName, mine && styles.bubbleTextMine]}>{item.replyTo.senderId === myId ? 'You' : userName(conversation?.participant)}</Text><Text numberOfLines={1} style={[styles.replyBody, mine && styles.mediaDurationMine]}>{item.replyTo.body}</Text></View> : null}
        {item.forwarded ? <Text style={[styles.forwarded, mine && styles.mediaDurationMine]}>Forwarded</Text> : null}
        {item.disappearAfterSeconds !== null && item.disappearAfterSeconds !== undefined ? <Pressable disabled={mine} onPress={() => openDisappearing(item)} style={styles.disappearingBubble}><Ionicons color={mine ? colors.bg : colors.blue} name="time-outline" size={22} /><View><Text style={[styles.videoTitle, mine && styles.videoTitleMine]}>{item.expiresAt ? 'Disappearing message expired' : mine ? 'Disappearing message sent' : 'Open disappearing message'}</Text><Text style={[styles.mediaDuration, mine && styles.mediaDurationMine]}>{item.disappearAfterSeconds === 0 ? 'View once' : `${item.disappearAfterSeconds} seconds`}{!mine ? ' · tap to view' : ''}</Text></View></Pressable> : <>{image ? <Image source={{ uri: image }} style={styles.messageImage} /> : null}{item.mediaType === 'gift' && item.gift ? <View style={styles.giftBubble}>{item.gift.imageUrl ? <Image resizeMode="contain" source={{ uri: resolveMediaUrl(item.gift.imageUrl) }} style={styles.giftBubbleArt} /> : null}<Text style={[styles.videoTitle, mine && styles.videoTitleMine]}>{mine ? 'You sent' : 'You received'} {item.gift.name}</Text><Text style={[styles.giftBubblePrice, mine && styles.mediaDurationMine]}>✦ {Number(item.gift.stars || 0).toLocaleString()}</Text></View> : item.mediaType === 'audio' ? <VoiceBubble audio={item.audio} mine={mine} /> : item.mediaType === 'video' ? <VideoBubble mine={mine} video={item.video} /> : <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{preview(item)}</Text>}</>}
        <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{relativeTime(item.createdAt)}</Text>
        {reaction ? <View style={[styles.reactionBadge, mine && styles.reactionBadgeMine]}><Text style={styles.reactionText}>{reaction}</Text></View> : null}
      </Pressable>}
    </View>;
  };
  const isRequest = selectedStatus === 'REQUEST' || conversation?.requestReceived;
  return <Modal animationType="slide" visible={Boolean(conversation)} onRequestClose={onClose}>
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 10) }]}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatScreen}>
      <View style={styles.chatHeader}><Pressable accessibilityLabel="Back to inbox" hitSlop={8} onPress={onClose}><Ionicons color={colors.text} name="chevron-back" size={22} /></Pressable><Avatar size={40} user={conversation?.participant} /><View style={styles.chatTitleWrap}><View style={styles.chatNameLine}><Text numberOfLines={1} style={styles.chatTitle}>{userName(conversation?.participant)}</Text>{conversation?.participant?.isVerified || conversation?.participant?.verified ? <Ionicons color={colors.blue} name="checkmark-circle" size={14} /> : null}</View><Text numberOfLines={1} style={styles.chatSub}>{conversation?.participant?.lastSeenAt ? `Last seen ${relativeTime(conversation.participant.lastSeenAt)}` : conversation?.directAccessWindow ? `Direct Access · ${daLabel(conversation.directAccessWindow)}` : isRequest ? 'Message request' : 'no reply history yet'}</Text></View><Pressable accessibilityLabel="Call" onPress={() => Alert.alert('Call', 'Native calling requires the paid-call flow and an installed development build.')} style={styles.headerIcon}><Ionicons color={colors.blue} name="call-outline" size={18} /></Pressable><Pressable accessibilityLabel="Conversation options" onPress={conversationMenu} style={styles.headerIcon}><Ionicons color={colors.muted} name="ellipsis-horizontal" size={20} /></Pressable></View>
      {loading ? <ScreenState loading title="Opening conversation" /> : <FlatList ref={listRef} contentContainerStyle={styles.chatList} data={messages} keyExtractor={(item) => item.id} ListHeaderComponent={<View style={styles.chatIntro}><View style={styles.aiNotice}><Ionicons color={colors.blue} name="eye-outline" size={12} /><Text style={styles.aiNoticeText}>Use AI to expand judgment, not replace it.</Text></View><Text style={styles.aiQuote}>“AI builder explaining useful tools, responsible workflows, and the future without the hype.”</Text><Text style={styles.noReply}>no reply history yet.</Text><Text style={styles.privateNotice}>Text messages are private between you and this creator.</Text><View style={styles.dayChip}><Text style={styles.dayChipText}>Today</Text></View></View>} ListEmptyComponent={<View />} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })} renderItem={renderMessage} />}
      {isRequest ? <View style={styles.requestPanel}><Text style={styles.requestTitle}>Accept this message request?</Text><Text style={styles.requestCopy}>They won’t know you’ve seen it until you accept.</Text><View style={styles.requestActions}><Pressable onPress={declineRequest} style={styles.requestDecline}><Text style={styles.requestDeclineText}>Delete</Text></Pressable><Pressable onPress={acceptRequest} style={styles.requestAccept}><Text style={styles.requestAcceptText}>Accept</Text></Pressable></View></View> : <View style={styles.composerWrap}>{replyTo ? <View style={styles.replyPreview}><Ionicons color={colors.blue} name="return-up-back" size={17} /><View style={styles.replyPreviewCopy}><Text style={styles.replyPreviewTitle}>Replying to {replyTo.senderId === myId ? 'yourself' : userName(conversation?.participant)}</Text><Text numberOfLines={1} style={styles.replyPreviewBody}>{preview(replyTo)}</Text></View><Pressable onPress={() => setReplyTo(null)}><Ionicons color={colors.faint} name="close" size={19} /></Pressable></View> : null}<View style={styles.inputBar}><View style={styles.composerPill}><TextInput multiline onChangeText={setText} placeholder="Message..." placeholderTextColor={colors.faint} style={styles.messageInput} value={text} /><Pressable accessibilityLabel="Send a photo" disabled={sending} onPress={sendImage} style={styles.inlineAction}><Ionicons color={colors.faint} name="attach" size={19} /></Pressable><Pressable accessibilityLabel="Disappearing message timer" onPress={() => setTimerOpen(true)} style={[styles.inlineAction, disappearAfterSeconds !== null && styles.composerActionActive]}><Ionicons color={disappearAfterSeconds !== null ? colors.blue : colors.faint} name="time-outline" size={17} />{disappearAfterSeconds !== null ? <Text style={styles.timerBadge}>{disappearAfterSeconds === 0 ? '1' : disappearAfterSeconds}</Text> : null}</Pressable><Pressable accessibilityLabel="Send a gift" disabled={sending} onPress={openGifts} style={styles.inlineAction}><Ionicons color="#E9B85D" name="gift-outline" size={17} /></Pressable><VoiceComposer disabled={sending} onSend={sendVoice} /><Pressable accessibilityLabel="Record video note" disabled={sending} onPress={sendVideoNote} style={styles.inlineAction}><Ionicons color={colors.faint} name="videocam-outline" size={18} /></Pressable></View><Pressable accessibilityLabel="Send message" disabled={sending || !text.trim()} onPress={send} style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonIdle]}>{sending ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons color={colors.bg} name="send" size={17} />}</Pressable></View>{conversation?.directAccessWindow ? <Text style={styles.priorityFooter}><Text style={styles.priorityStrong}>Priority message</Text> · Direct Access — guaranteed answer ›</Text> : null}</View>}
      <GiftSheet busy={sending} gifts={gifts} onClose={() => setGiftOpen(false)} onSend={sendGift} visible={giftOpen} />
      <TimerSheet onClose={() => setTimerOpen(false)} onSelect={setDisappearAfterSeconds} selected={disappearAfterSeconds} visible={timerOpen} />
      <NewMessageModal onClose={() => setForwardMessage(null)} onSelect={async (target) => { if (!forwardMessage) return; try { await api.forwardMessage(forwardMessage.id, [{ id: target.id, type: 'direct' }], session.accessToken); setForwardMessage(null); Alert.alert('Forwarded', `Sent to ${userName(target.participant)}.`); } catch (error) { Alert.alert('Forward failed', error instanceof Error ? error.message : 'Please retry.'); } }} session={session} title="Forward message" visible={Boolean(forwardMessage)} />
      <Modal animationType="fade" visible={Boolean(disappearingViewer)} onRequestClose={() => setDisappearingViewer(null)}><SafeAreaView style={styles.disappearingViewer}><View style={styles.viewerHead}><Avatar size={36} user={conversation?.participant} /><View style={styles.chatTitleWrap}><Text style={styles.chatTitle}>{userName(conversation?.participant)}</Text><Text style={styles.chatSub}>{disappearingViewer?.disappearAfterSeconds === 0 ? 'View once' : `${disappearingViewer?.disappearAfterSeconds || 0} seconds`}</Text></View><Pressable onPress={() => setDisappearingViewer(null)} style={styles.filterClose}><Ionicons color={colors.text} name="close" size={24} /></Pressable></View><View style={styles.viewerContent}>{disappearingViewer?.image?.url ? <Image resizeMode="contain" source={{ uri: resolveMediaUrl(disappearingViewer.image.url) }} style={styles.viewerMedia} /> : disappearingViewer?.gift?.imageUrl ? <Image resizeMode="contain" source={{ uri: resolveMediaUrl(disappearingViewer.gift.imageUrl) }} style={styles.viewerMedia} /> : <Text style={styles.viewerText}>{preview(disappearingViewer || undefined)}</Text>}</View></SafeAreaView></Modal>
    </KeyboardAvoidingView></View>
  </Modal>;
}

function GroupChatModal({ group: initialGroup, onClose, onRefresh, session }: { group: MessageGroup | null; onClose: () => void; onRefresh: () => void; session: Session }) {
  const insets = useSafeAreaInsets();
  const [group, setGroup] = useState<MessageGroup | null>(initialGroup);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const listRef = useRef<FlatList<Message>>(null);
  const myId = String(session.user.id || session.user._id || '');
  const id = initialGroup?.id || '';
  const load = useCallback(async () => { if (!id) return; try { const result = await api.listGroupMessages(id, session.accessToken); setGroup(result.group || initialGroup); setNameDraft(result.group?.name || initialGroup?.name || ''); setMessages(result.messages || []); onRefresh(); } catch (error) { Alert.alert('Could not open group', error instanceof Error ? error.message : 'Please retry.'); } }, [id, initialGroup, onRefresh, session.accessToken]);
  useEffect(() => { setGroup(initialGroup); setNameDraft(initialGroup?.name || ''); if (initialGroup) load(); }, [initialGroup, load]);
  useEffect(() => { if (!initialGroup) return undefined; const socket = getMessageSocket(session.accessToken); if (!socket) return undefined; const receive = ({ groupId, message }: { groupId?: string; message?: Message }) => { if (String(groupId) !== id || !message?.id) return; setMessages((current) => current.some((item) => item.id === message.id ? true : false) ? current : [...current, message]); }; const deleted = ({ groupId, messageId, scope, hiddenForUserId }: { groupId?: string; messageId?: string; scope?: string; hiddenForUserId?: string }) => { if (String(groupId) !== id || !messageId) return; setMessages((current) => scope === 'me' && hiddenForUserId === myId ? current.filter((item) => item.id !== messageId) : current.map((item) => item.id === messageId ? { ...item, body: 'This message was deleted', deletedAt: new Date().toISOString() } : item)); }; socket.on('group:message', receive); socket.on('group:message-deleted', deleted); return () => { socket.off('group:message', receive); socket.off('group:message-deleted', deleted); }; }, [id, initialGroup, myId, session.accessToken]);
  const append = (message: Message) => { setMessages((current) => [...current, message]); onRefresh(); };
  const send = async () => { const body = text.trim(); if (!body || busy) return; setText(''); setBusy(true); try { append((await api.sendGroupMessage(id, body, newClientMessageId(), null, session.accessToken)).message); } catch (error) { setText(body); Alert.alert('Message failed', error instanceof Error ? error.message : 'Please retry.'); } finally { setBusy(false); } };
  const image = async () => { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .82 }); if (result.canceled || !result.assets[0]) return; const asset = result.assets[0]; const type = imageMime(asset); setBusy(true); try { append((await api.sendGroupImage(id, { uri: asset.uri, name: asset.fileName || uploadName(asset.uri, 'group-photo', type.includes('png') ? 'png' : 'jpg'), type }, newClientMessageId(), session.accessToken)).message); } finally { setBusy(false); } };
  const voice = async (uri: string, _duration: number, waveform: number[]) => { const result = await api.sendGroupVoice(id, { uri, name: uploadName(uri, 'voice', 'm4a'), type: audioMime(uri) }, newClientMessageId(), waveform, session.accessToken); append(result.message); };
  const video = async () => { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) return; const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], cameraType: ImagePicker.CameraType.front, videoMaxDuration: 60, quality: .7 }); if (result.canceled || !result.assets[0]) return; const asset = result.assets[0]; const type = videoMime(asset); setBusy(true); try { append((await api.sendGroupVideo(id, { uri: asset.uri, name: asset.fileName || uploadName(asset.uri, 'group-video', 'mp4'), type }, newClientMessageId(), session.accessToken)).message); } finally { setBusy(false); } };
  const menu = (item: Message, mine: boolean) => Alert.alert('Message', undefined, [...['❤️', '😂', '🔥', '👏'].map((emoji) => ({ text: `React ${emoji}`, onPress: async () => { await api.reactToGroupMessage(item.id, emoji, session.accessToken); setMessages((current) => current.map((message) => message.id === item.id ? { ...message, viewerReaction: emoji } : message)); } })), { text: 'Delete for me', style: 'destructive' as const, onPress: async () => { await api.deleteGroupMessage(item.id, 'me', session.accessToken); setMessages((current) => current.filter((message) => message.id !== item.id)); } }, ...(mine ? [{ text: 'Unsend for everyone', style: 'destructive' as const, onPress: async () => { await api.deleteGroupMessage(item.id, 'everyone', session.accessToken); setMessages((current) => current.map((message) => message.id === item.id ? { ...message, body: 'This message was deleted', deletedAt: new Date().toISOString() } : message)); } }] : []), { text: 'Cancel', style: 'cancel' as const }]);
  const saveName = async () => { if (!group || !nameDraft.trim()) return; try { const result = await api.updateMessageGroup(group.id, { name: nameDraft.trim() }, session.accessToken); setGroup(result.group || { ...group, name: nameDraft.trim() }); onRefresh(); } catch (error) { Alert.alert('Rename failed', error instanceof Error ? error.message : 'Please retry.'); } };
  const changeGroupPhoto = async () => { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .82, allowsEditing: true, aspect: [1, 1] }); if (result.canceled || !result.assets[0]) return; const asset = result.assets[0]; const type = imageMime(asset); try { await api.updateMessageGroupAvatar(id, { uri: asset.uri, name: asset.fileName || uploadName(asset.uri, 'group', type.includes('png') ? 'png' : 'jpg'), type }, session.accessToken); setGroup((current) => current ? { ...current, avatarUrl: asset.uri } : current); onRefresh(); } catch (error) { Alert.alert('Photo update failed', error instanceof Error ? error.message : 'Please retry.'); } };
  const memberMenu = (member: User) => { const memberId = String(member.id || member._id || ''); const admin = group?.admins?.includes(memberId); Alert.alert(userName(member), undefined, [{ text: admin ? 'Remove as admin' : 'Make admin', onPress: async () => { await api.setMessageGroupAdmin(id, memberId, !admin, session.accessToken); load(); } }, { text: 'Remove from group', style: 'destructive', onPress: async () => { await api.removeMessageGroupMember(id, memberId, session.accessToken); load(); } }, { text: 'Cancel', style: 'cancel' }]); };
  const groupAction = () => Alert.alert(group?.name || 'Group', undefined, [{ text: 'Change group photo', onPress: changeGroupPhoto }, { text: group?.muted ? 'Unmute notifications' : 'Mute notifications', onPress: async () => { await api.muteMessageGroup(id, !group?.muted, session.accessToken); setGroup((current) => current ? { ...current, muted: !current.muted } : current); } }, { text: group?.archived ? 'Move to inbox' : 'Archive group', onPress: async () => { await api.archiveMessageGroup(id, !group?.archived, session.accessToken); onRefresh(); } }, { text: 'Pin to profile', onPress: async () => { await api.pinMessageGroup(id, true, session.accessToken); Alert.alert('Pinned', 'This group is now pinned to your profile.'); } }, ...(group?.admins?.includes(myId) ? [{ text: 'Delete group', style: 'destructive' as const, onPress: () => Alert.alert('Delete group?', 'This permanently removes the group.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await api.deleteMessageGroup(id, session.accessToken); onRefresh(); onClose(); } }]) }] : []), { text: 'Cancel', style: 'cancel' }]);
  const render = ({ item }: { item: Message }) => { const mine = String(item.senderId) === myId; const media = resolveMediaUrl(item.image?.url || ''); return <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}><Pressable onLongPress={() => menu(item, mine)} style={[styles.bubble, mine && styles.bubbleMine]}>{!mine && item.senderId ? <Text style={styles.groupSender}>{userName(group?.members?.find((member) => String(member.id || member._id) === String(item.senderId)))}</Text> : null}{media ? <Image source={{ uri: media }} style={styles.messageImage} /> : null}{item.mediaType === 'audio' ? <VoiceBubble audio={item.audio} mine={mine} /> : item.mediaType === 'video' ? <VideoBubble video={item.video} mine={mine} /> : <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{preview(item)}</Text>}<Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{relativeTime(item.createdAt)}</Text>{item.viewerReaction ? <View style={styles.reactionBadge}><Text>{item.viewerReaction}</Text></View> : null}</Pressable></View>; };
  if (!initialGroup) return null;
  return <Modal animationType="slide" visible onRequestClose={onClose}><View style={[styles.safe, { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 10) }]}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatScreen}><View style={styles.chatHeader}><Pressable onPress={onClose}><Ionicons color={colors.text} name="chevron-back" size={22} /></Pressable><Pressable onPress={() => setInfoOpen(true)} style={styles.groupHeaderIdentity}><Avatar size={40} user={{ name: group?.name, avatar: group?.avatarUrl }} /><View style={styles.chatTitleWrap}><Text numberOfLines={1} style={styles.chatTitle}>{group?.name}</Text><Text style={styles.chatSub}>{group?.members?.length || 0} members</Text></View></Pressable><Pressable onPress={groupAction} style={styles.headerIcon}><Ionicons color={colors.muted} name="ellipsis-horizontal" size={20} /></Pressable></View><FlatList ref={listRef} contentContainerStyle={styles.chatList} data={messages} keyExtractor={(item) => item.id} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })} renderItem={render} /><View style={styles.inputBar}><View style={styles.composerPill}><TextInput multiline onChangeText={setText} placeholder="Message..." placeholderTextColor={colors.faint} style={styles.messageInput} value={text} /><Pressable onPress={image} style={styles.inlineAction}><Ionicons color={colors.faint} name="attach" size={19} /></Pressable><VoiceComposer disabled={busy} onSend={voice} /><Pressable onPress={video} style={styles.inlineAction}><Ionicons color={colors.faint} name="videocam-outline" size={18} /></Pressable></View><Pressable disabled={busy || !text.trim()} onPress={send} style={[styles.sendButton, (!text.trim() || busy) && styles.sendButtonIdle]}><Ionicons color={colors.bg} name="send" size={17} /></Pressable></View><Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={infoOpen} onRequestClose={() => setInfoOpen(false)}><Pressable onPress={() => setInfoOpen(false)} style={styles.modalBackdrop}><Pressable onPress={() => undefined} style={styles.groupInfoSheet}><View style={styles.sheetHandle} /><View style={styles.filterHead}><Text style={styles.sheetTitle}>Group info</Text><Pressable onPress={() => setInfoOpen(false)}><Ionicons color={colors.muted} name="close" size={22} /></Pressable></View><View style={styles.groupInfoIdentity}><Avatar size={68} user={{ name: group?.name, avatar: group?.avatarUrl }} /><TextInput onChangeText={setNameDraft} style={styles.groupInfoName} value={nameDraft} /><Pressable onPress={saveName} style={styles.groupInfoSave}><Text style={styles.groupInfoSaveText}>Save</Text></Pressable></View><View style={styles.groupInfoHead}><Text style={styles.groupMembersTitle}>{group?.members?.length || 0} members</Text><Pressable onPress={() => setAddOpen(true)}><Text style={styles.addMemberText}>+ Add</Text></Pressable></View><FlatList data={group?.members || []} keyExtractor={(item, index) => String(item.id || item._id || index)} renderItem={({ item }) => { const memberId = String(item.id || item._id || ''); const admin = group?.admins?.includes(memberId); return <View style={styles.groupPerson}><Avatar size={38} user={item} /><View style={styles.rowCopy}><Text style={styles.rowName}>{userName(item)}</Text><Text style={styles.preview}>{admin ? 'Admin' : `@${item.username || 'member'}`}</Text></View>{memberId !== myId && group?.admins?.includes(myId) ? <Pressable onPress={() => Alert.alert('Remove member?', userName(item), [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { await api.removeMessageGroupMember(id, memberId, session.accessToken); load(); } }])}><Ionicons color="#FF8080" name="person-remove-outline" size={18} /></Pressable> : null}</View>; }} /></Pressable></Pressable></Modal><NewMessageModal title="Add member" visible={addOpen} session={session} onClose={() => setAddOpen(false)} onSelect={async (conversation) => { try { await api.addMessageGroupMember(id, conversation.id, session.accessToken); setAddOpen(false); load(); } catch (error) { Alert.alert('Could not add member', error instanceof Error ? error.message : 'Please retry.'); } }} /></KeyboardAvoidingView></View></Modal>;
}

function NewMessageModal({ onClose, onSelect, session, title = 'New message', visible }: { onClose: () => void; onSelect: (conversation: Conversation) => void | Promise<void>; session: Session; title?: string; visible: boolean }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const search = useCallback(async (value: string) => {
    setQuery(value);
    setLoading(true);
    try {
      setPeople((await api.searchMessagePeople(value, session.accessToken)).people || []);
    } catch {
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, [session.accessToken]);
  useEffect(() => {
    if (visible) search('');
  }, [search, visible]);
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.newSheet}><View style={styles.sheetHandle} /><View style={styles.chatHeaderCompact}><Text style={styles.sheetTitle}>{title}</Text><Pressable onPress={onClose}><Ionicons color={colors.muted} name="close" size={24} /></Pressable></View><TextInput autoFocus onChangeText={search} placeholder="Search people" placeholderTextColor={colors.faint} style={styles.searchInput} value={query} />{loading ? <ActivityIndicator color={colors.blue} style={styles.searchLoading} /> : <FlatList data={people} keyExtractor={(item, index) => String(item.id || item._id || item.username || index)} ListEmptyComponent={<Text style={styles.emptyPeople}>No people found.</Text>} renderItem={({ item }) => <Pressable onPress={() => { void onSelect({ id: String(item.id || item._id), participant: item, status: 'ACTIVE' }); }} style={styles.personRow}><Avatar size={38} user={item} /><View style={styles.rowCopy}><Text style={styles.rowName}>{userName(item)}</Text><Text style={styles.preview}>@{item.username}</Text></View></Pressable>} />}</View></View></Modal>;
}

function NewMessageChoiceSheet({ onChat, onClose, onGroup, visible }: { onChat: () => void; onClose: () => void; onGroup: () => void; visible: boolean }) {
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><Pressable onPress={onClose} style={styles.modalBackdrop}><Pressable onPress={() => undefined} style={styles.newChoiceSheet}><View style={styles.sheetHandle} /><Text style={styles.sheetTitle}>New message</Text><Pressable onPress={onChat} style={styles.choiceRow}><View style={styles.choiceIcon}><Ionicons color={colors.blue} name="chatbubble-outline" size={20} /></View><View style={styles.filterCopy}><Text style={styles.filterLabel}>New Chat</Text><Text style={styles.filterSubtitle}>Message someone directly</Text></View><Ionicons color={colors.faint} name="chevron-forward" size={18} /></Pressable><Pressable onPress={onGroup} style={styles.choiceRow}><View style={[styles.choiceIcon, styles.groupChoiceIcon]}><Ionicons color="#B79CFF" name="person-add-outline" size={20} /></View><View style={styles.filterCopy}><Text style={styles.filterLabel}>New Group</Text><Text style={styles.filterSubtitle}>A private group with the people you choose</Text></View><Ionicons color={colors.faint} name="chevron-forward" size={18} /></Pressable></Pressable></Pressable></Modal>;
}

function NewGroupSheet({ onClose, onCreated, session, visible }: { onClose: () => void; onCreated: (group: MessageGroup) => void; session: Session; visible: boolean }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<User[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const search = useCallback(async (value: string) => { setQuery(value); try { setPeople((await api.searchMessagePeople(value, session.accessToken)).people || []); } catch { setPeople([]); } }, [session.accessToken]);
  useEffect(() => { if (visible) { setName(''); setMembers([]); setAvatar(null); search(''); } }, [search, visible]);
  const chooseAvatar = async () => { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return Alert.alert('Photos needed', 'Allow photo access to choose a group photo.'); const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .8, allowsEditing: true, aspect: [1, 1] }); if (!result.canceled && result.assets[0]) setAvatar(result.assets[0]); };
  const create = async () => { if (!name.trim() || !members.length || busy) return; setBusy(true); try { const result = await api.createMessageGroup(name.trim(), members, session.accessToken); if (avatar && result.group.id) { const type = imageMime(avatar); await api.updateMessageGroupAvatar(result.group.id, { uri: avatar.uri, name: avatar.fileName || uploadName(avatar.uri, 'group', type.includes('png') ? 'png' : 'jpg'), type }, session.accessToken); result.group.avatarUrl = avatar.uri; } onCreated(result.group); onClose(); } catch (error) { Alert.alert('Could not create group', error instanceof Error ? error.message : 'Please retry.'); } finally { setBusy(false); } };
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><Pressable onPress={onClose} style={styles.modalBackdrop}><Pressable onPress={() => undefined} style={styles.newGroupSheet}><View style={styles.sheetHandle} /><View style={styles.filterHead}><Text style={styles.sheetTitle}>New Group</Text><Pressable onPress={onClose} style={styles.filterClose}><Ionicons color={colors.muted} name="close" size={22} /></Pressable></View><View style={styles.groupIdentity}><Pressable accessibilityLabel="Choose group photo" onPress={chooseAvatar} style={styles.groupAvatar}>{avatar ? <Image source={{ uri: avatar.uri }} style={styles.groupAvatarImage} /> : <Ionicons color={colors.faint} name="camera-outline" size={22} />}</Pressable><TextInput maxLength={60} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.faint} style={[styles.searchInput, styles.groupName]} value={name} /></View><Text style={styles.groupMembersTitle}>Add members</Text><View style={styles.groupSearch}><Ionicons color={colors.faint} name="search" size={17} /><TextInput onChangeText={search} placeholder="Search people" placeholderTextColor={colors.faint} style={styles.groupSearchInput} value={query} /></View><FlatList data={people} keyExtractor={(item, index) => String(item.id || item._id || index)} renderItem={({ item }) => { const id = String(item.id || item._id || ''); const checked = members.includes(id); return <Pressable onPress={() => setMembers((current) => checked ? current.filter((value) => value !== id) : [...current, id])} style={styles.groupPerson}><Avatar size={38} user={item} /><View style={styles.rowCopy}><Text style={styles.rowName}>{userName(item)}</Text><Text style={styles.preview}>@{item.username}</Text></View><View style={[styles.memberCheck, checked && styles.memberCheckActive]}>{checked ? <Ionicons color={colors.bg} name="checkmark" size={14} /> : null}</View></Pressable>; }} /><Pressable disabled={!name.trim() || !members.length || busy} onPress={create} style={[styles.createGroupButton, (!name.trim() || !members.length || busy) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.createGroupText}>Create Group</Text>}</Pressable></Pressable></Pressable></Modal>;
}

function FilterSheet({ creator, onClose, onSelect, selected, visible }: { creator: boolean; onClose: () => void; onSelect: (filter: InboxFilter) => void; selected: InboxFilter; visible: boolean }) {
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close filters" onPress={onClose} style={styles.modalBackdrop}>
      <Pressable accessibilityRole="none" onPress={() => undefined} style={styles.filterSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.filterHead}><Text style={styles.filterTitle}>Filter</Text><Pressable accessibilityLabel="Close filters" onPress={onClose} style={styles.filterClose}><Ionicons color={colors.muted} name="close" size={22} /></Pressable></View>
        {INBOX_FILTERS.filter((item) => creator || !item.creatorOnly).map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected === item.id }} key={item.id} onPress={() => { onSelect(item.id); onClose(); }} style={[styles.filterRow, item.id === 'members' && styles.filterCreatorStart]}>
          <Ionicons color={selected === item.id ? colors.blue : colors.faint} name={item.icon} size={20} />
          <View style={styles.filterCopy}><Text style={styles.filterLabel}>{item.label}</Text>{item.subtitle ? <Text style={styles.filterSubtitle}>{item.subtitle}</Text> : null}</View>
          {selected === item.id ? <Ionicons color={colors.blue} name="checkmark" size={20} /> : null}
        </Pressable>)}
      </Pressable>
    </Pressable>
  </Modal>;
}

type DirectSettings = { enabled: boolean; priceStars: number; callEnabled: boolean; callPriceStars: number; callDurationMinutes: number; callAutoDeclineAway: boolean };

function DirectAccessSetup({ initial, onClose, onSaved, visible }: { initial: DirectSettings; onClose: () => void; onSaved: (settings: DirectSettings) => void; visible: boolean }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setForm(initial); }, [initial, visible]);
  const numberField = (key: 'priceStars' | 'callPriceStars' | 'callDurationMinutes', value: string) => setForm((current) => ({ ...current, [key]: Math.max(0, Number(value.replace(/\D/g, '')) || 0) }));
  const save = async () => { setBusy(true); try { await api.updateDirectAccess(form); onSaved(form); onClose(); } catch (error) { Alert.alert('Could not save', error instanceof Error ? error.message : 'Please retry.'); } finally { setBusy(false); } };
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><Pressable onPress={onClose} style={styles.modalBackdrop}><Pressable onPress={() => undefined} style={styles.directSetupSheet}><View style={styles.sheetHandle} /><View style={styles.filterHead}><View><Text style={styles.filterTitle}>Set up Direct Access</Text><Text style={styles.giftHint}>Your prices for messages and calls</Text></View><Pressable onPress={onClose} style={styles.filterClose}><Ionicons color={colors.muted} name="close" size={22} /></Pressable></View><View style={styles.settingRow}><View style={styles.filterCopy}><Text style={styles.filterLabel}>Direct Access messages</Text><Text style={styles.filterSubtitle}>Fans pay to open a priority window</Text></View><Switch onValueChange={(enabled) => setForm((current) => ({ ...current, enabled }))} trackColor={{ false: colors.surface2, true: 'rgba(156,203,255,.45)' }} thumbColor={form.enabled ? colors.blue : colors.faint} value={form.enabled} /></View><Text style={styles.fieldLabel}>Message price · Stars</Text><TextInput keyboardType="number-pad" onChangeText={(value) => numberField('priceStars', value)} style={styles.settingInput} value={String(form.priceStars)} /><View style={styles.settingRow}><View style={styles.filterCopy}><Text style={styles.filterLabel}>Paid calls</Text><Text style={styles.filterSubtitle}>Offer private timed calls</Text></View><Switch onValueChange={(callEnabled) => setForm((current) => ({ ...current, callEnabled }))} trackColor={{ false: colors.surface2, true: 'rgba(156,203,255,.45)' }} thumbColor={form.callEnabled ? colors.blue : colors.faint} value={form.callEnabled} /></View>{form.callEnabled ? <View style={styles.settingFields}><View style={styles.settingField}><Text style={styles.fieldLabel}>Call price · Stars</Text><TextInput keyboardType="number-pad" onChangeText={(value) => numberField('callPriceStars', value)} style={styles.settingInput} value={String(form.callPriceStars)} /></View><View style={styles.settingField}><Text style={styles.fieldLabel}>Minutes</Text><TextInput keyboardType="number-pad" onChangeText={(value) => numberField('callDurationMinutes', value)} style={styles.settingInput} value={String(form.callDurationMinutes)} /></View></View> : null}<View style={styles.settingRow}><View style={styles.filterCopy}><Text style={styles.filterLabel}>Auto-decline when away</Text><Text style={styles.filterSubtitle}>Avoid paid calls while unavailable</Text></View><Switch onValueChange={(callAutoDeclineAway) => setForm((current) => ({ ...current, callAutoDeclineAway }))} trackColor={{ false: colors.surface2, true: 'rgba(156,203,255,.45)' }} thumbColor={form.callAutoDeclineAway ? colors.blue : colors.faint} value={form.callAutoDeclineAway} /></View><Pressable disabled={busy} onPress={save} style={[styles.saveSettings, busy && styles.disabled]}>{busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.saveSettingsText}>Save settings</Text>}</Pressable></Pressable></Pressable></Modal>;
}

export function MessagesScreen({ onNavigate, session, initialTab = 'all' }: { onNavigate: (key: MainTab) => void; session: Session; initialTab?: InboxTab }) {
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [windows, setWindows] = useState<DirectAccessWindow[]>([]);
  const [groups, setGroups] = useState<MessageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<MessageGroup | null>(null);
  const [newOpen, setNewOpenState] = useState(false);
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const setNewOpen = (value: boolean) => value ? setNewFlowOpen(true) : setNewOpenState(false);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [directSetupOpen, setDirectSetupOpen] = useState(false);
  const [directSettings, setDirectSettings] = useState<DirectSettings>({ enabled: false, priceStars: 100, callEnabled: false, callPriceStars: 500, callDurationMinutes: 5, callAutoDeclineAway: false });
  const selectedRef = useRef<Conversation | null>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      const [conversationData, windowData, groupData] = await Promise.all([api.listConversations(session.accessToken), api.listDirectAccessWindows(session.accessToken), api.listMessageGroups(session.accessToken)]);
      setConversations(conversationData.conversations || []);
      setWindows(windowData.windows || []);
      setGroups(groupData.groups || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Messages are unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.accessToken]);
  const creatorMode = Boolean(session.user.isCreator || session.user.role === 'creator' || session.user.accountRole === 'creator');
  const openDirectSetup = useCallback(async () => {
    setDirectSetupOpen(true);
    try {
      const offer = await api.getDirectAccessOffer(String(session.user.id || session.user._id || ''), session.accessToken);
      setDirectSettings({ enabled: Boolean(offer.enabled), priceStars: Number(offer.priceStars || 100), callEnabled: Boolean(offer.callEnabled), callPriceStars: Number(offer.callPriceStars || 500), callDurationMinutes: Number(offer.callDurationMinutes || 5), callAutoDeclineAway: Boolean(offer.callAutoDeclineAway) });
    } catch (error) { Alert.alert('Settings unavailable', error instanceof Error ? error.message : 'Please retry.'); }
  }, [session.accessToken, session.user.id, session.user._id]);
  useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { if (selected) setNewOpen(false); }, [selected]);
  useEffect(() => {
    const socket = getMessageSocket(session.accessToken);
    if (!socket) return undefined;
    const refresh = () => load();
    const receiveMessage = ({ message, participant, conversationStatus = 'ACTIVE' }: { message?: Message; participant?: User; conversationStatus?: string }) => {
      if (!message?.id) return;
      const otherId = message.senderId === String(session.user.id || session.user._id) ? message.recipientId : message.senderId;
      if (!otherId) return;
      if (message.directAccessWindowId) {
        refresh();
        return;
      }
      setConversations((current) => {
        const active = selectedRef.current?.id === otherId && !selectedRef.current?.directAccessWindow;
        const existing = current.find((item) => item.id === otherId);
        const next: Conversation = existing
          ? { ...existing, lastMessage: message, status: conversationStatus, unreadCount: active || message.senderId === String(session.user.id || session.user._id) ? existing.unreadCount || 0 : (existing.unreadCount || 0) + 1 }
          : { id: otherId, participant: participant || { id: otherId }, lastMessage: message, status: conversationStatus, unreadCount: active ? 0 : 1 };
        return [next, ...current.filter((item) => item.id !== otherId)];
      });
    };
    const updateStatus = ({ otherUserId, status }: { otherUserId?: string; status?: string }) => {
      if (!otherUserId) return;
      setConversations((current) => current.map((item) => item.id === otherUserId ? { ...item, status } : item));
    };
    const hideConversation = ({ otherUserId, hiddenForUserId }: { otherUserId?: string; hiddenForUserId?: string }) => {
      if (!otherUserId || hiddenForUserId !== String(session.user.id || session.user._id)) return;
      setConversations((current) => current.filter((item) => item.id !== otherUserId));
      if (selectedRef.current?.id === otherUserId) setSelected(null);
    };
    socket.on('connect', refresh);
    socket.on('message:new', receiveMessage);
    socket.on('conversation:status', updateStatus);
    socket.on('conversation:hidden', hideConversation);
    socket.on('direct-access:updated', refresh);
    socket.on('direct-access:opened', refresh);
    return () => {
      socket.off('connect', refresh);
      socket.off('message:new', receiveMessage);
      socket.off('conversation:status', updateStatus);
      socket.off('conversation:hidden', hideConversation);
      socket.off('direct-access:updated', refresh);
      socket.off('direct-access:opened', refresh);
    };
  }, [load, session.accessToken, session.user.id, session.user._id]);
  const merged = useMemo(() => decorateConversations(conversations, windows, session), [conversations, session, windows]);
  const requestCount = merged.filter((item) => item.status === 'REQUEST' || item.requestReceived).length;
  const directCount = merged.filter((item) => item.directAccessWindow).length;
  const myId = String(session.user.id || session.user._id || '');
  const visible = merged.filter((item) => {
    if (tab === 'requests') return item.status === 'REQUEST' || item.requestReceived;
    if (tab === 'direct') return false;
    if (item.archived || item.status === 'DECLINED') return false;
    if (filter === 'unread') return Number(item.unreadCount) > 0;
    if (filter === 'unanswered') return item.isUnanswered ?? item.lastMessage?.senderId !== myId;
    if (filter === 'verified') return Boolean(item.participant?.isVerified || item.participant?.verified);
    if (filter === 'story') return Boolean(item.hasStoryReply || item.lastMessage?.messageKind === 'STORY_REPLY');
    if (filter === 'members') return Boolean(item.isWorldMember);
    if (filter === 'experience') return Boolean(item.unlockedExperience);
    if (filter === 'dream') return Boolean(item.isDreamKeeper);
    return true;
  });
  const receivedWindows = windows.filter((item) => String(item.creatorId) === myId);
  const purchasedWindows = windows.filter((item) => String(item.fanId) === myId);
  const directSections = creatorMode ? [
    { label: 'INCOMING · PAID', items: receivedWindows.filter((item) => ['HELD', 'INCLUDED'].includes(String(item.settlementStatus)) && !item.firstCreatorReplyAt) },
    { label: 'ANSWERED', items: receivedWindows.filter((item) => ['CAPTURED', 'INCLUDED'].includes(String(item.settlementStatus)) && Boolean(item.firstCreatorReplyAt || item.answeredAt)) },
    { label: 'MY DIRECT ACCESS', items: purchasedWindows },
  ] : [{ label: 'MY DIRECT ACCESS', items: windows }];
  const directContent = tab === 'direct' ? <View style={styles.directContent}>{creatorMode ? <Pressable onPress={openDirectSetup} style={styles.directSetupCard}><View style={styles.directSetupIcon}><Ionicons color={colors.blue} name="settings-outline" size={16} /></View><View style={styles.rowCopy}><Text style={styles.directSetupTitle}>Set up Direct Access</Text><Text style={styles.directSetupCopy}>Your prices for messages and calls</Text></View><Ionicons color={colors.faint} name="chevron-forward" size={16} /></Pressable> : null}{directSections.map((section) => section.items.length ? <View key={section.label} style={styles.directSection}><Text style={styles.directSectionTitle}>{section.label} <Text style={styles.directSectionCount}>{section.items.length}</Text></Text>{section.items.map((window) => { const person = otherForWindow(window, session); const viewerIsCreator = String(window.creatorId) === myId; const incoming = viewerIsCreator && ['HELD', 'INCLUDED'].includes(String(window.settlementStatus)) && !window.firstCreatorReplyAt; const answered = Boolean(window.firstCreatorReplyAt || window.answeredAt) && ['CAPTURED', 'INCLUDED'].includes(String(window.settlementStatus)); const expires = new Date(window.expiresAt || 0).getTime(); const hoursLeft = Math.max(0, Math.ceil((expires - Date.now()) / 3600000)); const status = window.settlementStatus === 'REFUNDED' ? 'Refunded' : answered ? 'Answered' : hoursLeft > 0 ? 'Pending' : 'Expired'; return <Pressable key={window.id} onPress={() => setSelected({ id: String(person.id || person._id), participant: person, status: 'ACTIVE', directAccessWindow: window })} style={styles.directRow}><Avatar size={44} user={person} /><View style={styles.directRowCopy}><Text numberOfLines={1} style={styles.rowName}>{userName(person)}</Text><Text numberOfLines={1} style={styles.directSnippet}>{incoming && window.questionQuote ? `“${window.questionQuote}”` : window.questionQuote || `Direct Access ${status.toLowerCase()}`}</Text><View style={styles.directMeta}>{incoming ? <><View style={styles.directPill}><Text style={styles.directPillText}>Message · ✦ {window.priceStars || 0}</Text></View><Text style={styles.directEarn}>≈ ${Number(window.creatorNetUsd || 0).toFixed(2)} to you</Text><Text style={styles.directHours}>◷ {hoursLeft}h left</Text></> : viewerIsCreator && answered ? <View style={styles.directPill}><Text style={styles.directPillText}>+${Number(window.creatorNetUsd || 0).toFixed(2)} earned</Text></View> : null}</View></View><View style={styles.directRight}><Text style={styles.time}>{relativeTime(window.latestMessage?.createdAt || window.updatedAt || window.createdAt)}</Text>{!viewerIsCreator ? <View style={[styles.directStatus, status === 'Answered' && styles.directStatusAnswered, status === 'Refunded' && styles.directStatusRefunded]}><Text style={[styles.directStatusText, status === 'Answered' && styles.directStatusTextAnswered, status === 'Refunded' && styles.directStatusTextRefunded]}>{status}</Text></View> : null}</View></Pressable>; })}</View> : null)}</View> : null;
  const groupConversations: Conversation[] = tab === 'all' && filter === 'all' ? groups.filter((group) => !group.archived).map((group) => ({ id: group.id, type: 'group', group, participant: { name: group.name, displayName: group.name, avatar: group.avatarUrl }, lastMessage: group.lastMessage, unreadCount: group.unreadCount, archived: group.archived, muted: group.muted, status: 'ACTIVE' })) : [];
  const inboxRows = [...groupConversations, ...visible].sort((left, right) => new Date(right.lastMessage?.createdAt || 0).getTime() - new Date(left.lastMessage?.createdAt || 0).getTime());
  const archive = (conversation: Conversation) => conversation.group ? Alert.alert(conversation.archived ? 'Unarchive group?' : 'Archive group?', conversation.group.name, [{ text: 'Cancel', style: 'cancel' }, { text: conversation.archived ? 'Unarchive' : 'Archive', onPress: async () => { await api.archiveMessageGroup(conversation.id, !conversation.archived, session.accessToken); load(); } }]) : Alert.alert(conversation.archived ? 'Unarchive conversation?' : 'Archive conversation?', userName(conversation.participant), [{ text: 'Cancel', style: 'cancel' }, { text: conversation.archived ? 'Unarchive' : 'Archive', onPress: async () => { try { await api.archiveConversation(conversation.id, !conversation.archived, session.accessToken); load(); } catch (error) { Alert.alert('Archive failed', error instanceof Error ? error.message : 'Please retry.'); } } }]);
  const header = <><View style={styles.header}><Text style={styles.username}><Text style={styles.at}>@</Text>{session.user.username || 'seen'}</Text><View style={styles.headerActions}><Pressable accessibilityLabel="New message" style={styles.round} onPress={() => setNewOpen(true)}><Ionicons color={colors.muted} name="add" size={21} /></Pressable><Pressable accessibilityLabel="Refresh messages" style={styles.round} onPress={load}><Ionicons color={colors.blue} name="sparkles" size={17} /></Pressable></View></View><View style={styles.inboxControls}><View style={styles.segment}>{([{ key: 'all', label: 'All', count: 0 }, { key: 'requests', label: 'Requests', count: requestCount }, { key: 'direct', label: 'Direct Access', count: directCount }] as const).map((item) => <Pressable key={item.key} onPress={() => { setTab(item.key); if (item.key !== 'all') setFilter('all'); }} style={[styles.segmentItem, tab === item.key && styles.segmentActive]}><Text style={[styles.segmentText, tab === item.key && styles.segmentTextActive]}>{item.label}{item.count ? ` ${item.count}` : ''}</Text></Pressable>)}</View><Pressable accessibilityLabel="Filter conversations" onPress={() => setFilterOpen(true)} style={[styles.filterButton, filter !== 'all' && styles.filterButtonActive]}><Ionicons color={filter !== 'all' ? colors.blue : colors.faint} name="filter" size={18} /></Pressable></View>{tab === 'requests' ? <Text style={styles.requestHint}>People you don’t follow yet. They won’t know you’ve seen it until you accept.</Text> : null}{directContent}</>;
  return <SafeAreaView style={styles.safe}><View style={styles.screen}>
    {loading ? <><View style={styles.header}><Text style={styles.username}><Text style={styles.at}>@</Text>{session.user.username}</Text></View><SkeletonRows count={5} /></> : <FlatList contentContainerStyle={styles.list} data={inboxRows} keyExtractor={(item) => `${item.type || 'direct'}-${tab}-${item.id}-${item.directAccessWindow?.id || ''}`} ListEmptyComponent={tab === 'direct' && windows.length ? <View /> : <ScreenState icon="chatbubble-outline" title={error ? 'Inbox could not load' : tab === 'requests' ? 'No message requests.' : tab === 'direct' ? 'No Direct Access conversations.' : filter !== 'all' ? 'No matching conversations.' : 'No conversations yet.'} message={error || undefined} onPress={error ? load : undefined} />} ListHeaderComponent={header} refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.blue} onRefresh={() => { setRefreshing(true); load(); }} />} renderItem={({ item }) => <MessageRow conversation={item} onArchive={archive} onOpen={(conversation) => conversation.group ? setSelectedGroup(conversation.group) : setSelected(conversation)} />} />}
    <NewMessageModal onClose={() => setNewOpen(false)} onSelect={setSelected} session={session} visible={newOpen} />
    <NewMessageChoiceSheet visible={newFlowOpen} onClose={() => setNewFlowOpen(false)} onChat={() => { setNewFlowOpen(false); setNewOpenState(true); }} onGroup={() => { setNewFlowOpen(false); setNewGroupOpen(true); }} />
    <NewGroupSheet visible={newGroupOpen} session={session} onClose={() => setNewGroupOpen(false)} onCreated={(created) => { setGroups((current) => [created, ...current.filter((item) => item.id !== created.id)]); setSelectedGroup(created); load(); }} />
    <FilterSheet creator={creatorMode} onClose={() => setFilterOpen(false)} onSelect={(next) => { setFilter(next); setTab('all'); }} selected={filter} visible={filterOpen} />
    <DirectAccessSetup initial={directSettings} onClose={() => setDirectSetupOpen(false)} onSaved={setDirectSettings} visible={directSetupOpen} />
    <ChatModal conversation={selected} onClose={() => setSelected(null)} onRefresh={load} session={session} />
    <GroupChatModal group={selectedGroup} onClose={() => setSelectedGroup(null)} onRefresh={load} session={session} />
    <BottomNav active="messages" avatar={session.user.avatar} name={session.user.name || session.user.username} onSelect={onNavigate} />
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: 12 },
  header: { height: 86, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  username: { color: colors.text, fontSize: 14, fontWeight: '900' },
  at: { color: colors.blue },
  headerActions: { flexDirection: 'row', gap: 8 },
  round: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  inboxControls: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, marginBottom: 16 },
  segment: { flex: 1, flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  segmentItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentActive: { backgroundColor: colors.surface2 },
  segmentText: { color: colors.faint, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  segmentTextActive: { color: colors.text },
  filterButton: { width: 42, height: 42, flexShrink: 0, borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  filterButtonActive: { borderColor: 'rgba(156,203,255,.42)', backgroundColor: 'rgba(156,203,255,.10)' },
  requestHint: { color: colors.faint, fontSize: 10, lineHeight: 15, paddingHorizontal: 20, marginTop: -7, marginBottom: 12 },
  directContent: { paddingBottom: 10 },
  directSetupCard: { marginHorizontal: 18, marginTop: 2, marginBottom: 20, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: 'rgba(156,203,255,.25)', borderRadius: 14, backgroundColor: 'rgba(156,203,255,.035)', paddingHorizontal: 12, paddingVertical: 10 },
  directSetupIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(156,203,255,.10)', alignItems: 'center', justifyContent: 'center' },
  directSetupTitle: { color: colors.blue, fontSize: 12, fontWeight: '900' },
  directSetupCopy: { color: colors.faint, fontSize: 9, marginTop: 3 },
  directSection: { marginBottom: 22 },
  directSectionTitle: { color: colors.faint, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, paddingHorizontal: 20, paddingBottom: 6 },
  directSectionCount: { color: colors.blue },
  directRow: { minHeight: 76, flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingHorizontal: 20, paddingVertical: 11 },
  directRowCopy: { flex: 1, minWidth: 0 },
  directSnippet: { color: colors.faint, fontSize: 11, lineHeight: 18 },
  directMeta: { minHeight: 19, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 3 },
  directPill: { borderRadius: 99, backgroundColor: '#202734', paddingHorizontal: 7, paddingVertical: 3 },
  directPillText: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  directEarn: { color: '#6ECF97', fontSize: 9, fontWeight: '800' },
  directHours: { color: colors.faint, fontSize: 9 },
  directRight: { flexShrink: 0, alignItems: 'flex-end', gap: 8 },
  directStatus: { borderRadius: 99, backgroundColor: 'rgba(255,255,255,.07)', paddingHorizontal: 9, paddingVertical: 4 },
  directStatusAnswered: { backgroundColor: 'rgba(156,203,255,.10)' },
  directStatusRefunded: { backgroundColor: 'rgba(110,207,151,.10)' },
  directStatusText: { color: colors.faint, fontSize: 9, fontWeight: '900' },
  directStatusTextAnswered: { color: colors.blue },
  directStatusTextRefunded: { color: '#6ECF97' },
  row: { minHeight: 78, paddingHorizontal: 28, paddingVertical: 10, flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '900' },
  time: { color: colors.faint, fontSize: 10 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 8 },
  preview: { flex: 1, color: colors.faint, fontSize: 12, lineHeight: 17 },
  unreadPreview: { color: colors.muted, fontWeight: '800' },
  unreadDot: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText: { color: colors.bg, fontSize: 10, fontWeight: '900' },
  badgeLine: { minHeight: 21, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  requestBadge: { borderRadius: 99, backgroundColor: 'rgba(156,203,255,.12)', paddingHorizontal: 8, paddingVertical: 3 },
  requestText: { color: colors.blue, fontSize: 9, fontWeight: '900' },
  daBadge: { borderRadius: 99, backgroundColor: 'rgba(156,203,255,.14)', paddingHorizontal: 8, paddingVertical: 3 },
  daText: { color: colors.blue, fontSize: 9, fontWeight: '900' },
  refundBadge: { backgroundColor: 'rgba(110,207,151,.14)' },
  refundText: { color: '#6ECF97' },
  chatScreen: { flex: 1, backgroundColor: colors.bg },
  chatHeader: { height: 64, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  chatHeaderCompact: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chatTitleWrap: { flex: 1, minWidth: 0 },
  chatTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  chatNameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatSub: { color: colors.faint, fontSize: 10, marginTop: 2 },
  headerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  chatList: { paddingHorizontal: 16, paddingBottom: 14, gap: 9, flexGrow: 1 },
  chatIntro: { alignItems: 'center', paddingTop: 18, paddingBottom: 22 },
  aiNotice: { height: 27, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(156,203,255,.42)', paddingHorizontal: 12 },
  aiNoticeText: { color: colors.blue, fontSize: 10, fontWeight: '900' },
  aiQuote: { maxWidth: 300, color: colors.text, fontSize: 11, fontStyle: 'italic', lineHeight: 18, textAlign: 'center', fontWeight: '700', marginTop: 10 },
  noReply: { color: colors.faint, fontSize: 9, marginTop: 2 },
  privateNotice: { color: colors.faint, fontSize: 9, marginTop: 28 },
  dayChip: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginTop: 27 },
  dayChipText: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  bubbleWrap: { alignItems: 'flex-start' },
  bubbleWrapMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: 17, borderBottomLeftRadius: 5, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface2 },
  bubbleMine: { borderBottomLeftRadius: 17, borderBottomRightRadius: 5, backgroundColor: colors.blue },
  bubbleText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  bubbleTextMine: { color: colors.bg, fontWeight: '700' },
  bubbleTime: { color: colors.faint, fontSize: 9, marginTop: 4 },
  bubbleTimeMine: { color: 'rgba(10,12,15,.58)' },
  replyQuote: { marginBottom: 7, borderLeftWidth: 2, borderLeftColor: colors.blue, backgroundColor: 'rgba(0,0,0,.14)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  replyQuoteMine: { borderLeftColor: 'rgba(10,12,15,.42)' },
  replyName: { color: colors.blue, fontSize: 9, fontWeight: '900' },
  replyBody: { color: colors.faint, fontSize: 11, marginTop: 2 },
  forwarded: { color: colors.faint, fontSize: 9, fontStyle: 'italic', marginBottom: 4 },
  disappearingBubble: { minWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  giftBubble: { minWidth: 155, alignItems: 'center', paddingVertical: 3 },
  giftBubbleArt: { width: 94, height: 94 },
  giftBubblePrice: { color: '#E9B85D', fontSize: 11, fontWeight: '900', marginTop: 3 },
  giftMessageBubble: { width: 264, maxWidth: '82%', minHeight: 158, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  storyReplyWrap: { alignItems: 'flex-start', marginBottom: 3 },
  storyReplyLabel: { color: colors.faint, fontSize: 9, marginBottom: 5 },
  storyReplyCard: { width: 112, height: 162, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 },
  storyReplyImage: { width: '100%', height: '100%' },
  storyUnavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  storyUnavailableText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  storyTime: { position: 'absolute', right: 6, bottom: 5, color: '#FFF', fontSize: 8, fontWeight: '900' },
  storyReaction: { fontSize: 27, lineHeight: 30, marginTop: -13, marginLeft: -5 },
  storyReactionMine: { alignSelf: 'flex-end', marginLeft: 0, marginRight: -5 },
  reactionBadge: { position: 'absolute', right: -9, bottom: -10, minWidth: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: colors.bg, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  reactionBadgeMine: { right: -8 },
  reactionText: { fontSize: 13 },
  messageImage: { width: 180, height: 104, borderRadius: 12, marginBottom: 7 },
  mediaPill: { minWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mediaPillMine: {},
  mediaPlay: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(156,203,255,.14)', alignItems: 'center', justifyContent: 'center' },
  mediaPlayMine: { backgroundColor: 'rgba(10,12,15,.16)' },
  waveform: { flex: 1, minWidth: 82, height: 30, flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: colors.blue },
  waveBarMine: { backgroundColor: 'rgba(10,12,15,.62)' },
  mediaDuration: { color: colors.faint, fontSize: 10, fontWeight: '800' },
  mediaDurationMine: { color: 'rgba(10,12,15,.62)' },
  videoBubble: { minWidth: 170, flexDirection: 'row', alignItems: 'center', gap: 10 },
  videoBubbleMine: {},
  videoIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(156,203,255,.14)', alignItems: 'center', justifyContent: 'center' },
  videoIconMine: { backgroundColor: 'rgba(10,12,15,.16)' },
  videoCopy: { flex: 1, minWidth: 0 },
  videoTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  videoTitleMine: { color: colors.bg },
  composerWrap: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg, paddingTop: 7 },
  composerActions: { height: 34, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 4 },
  composerAction: { minWidth: 32, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  composerActionActive: { backgroundColor: 'rgba(156,203,255,.12)' },
  timerBadge: { color: colors.blue, fontSize: 8, fontWeight: '900', marginLeft: -2, marginTop: -12 },
  replyPreview: { marginHorizontal: 12, marginTop: 8, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, borderLeftWidth: 2, borderLeftColor: colors.blue, borderRadius: 10, backgroundColor: colors.surface2, paddingHorizontal: 11, paddingVertical: 7 },
  replyPreviewCopy: { flex: 1, minWidth: 0 },
  replyPreviewTitle: { color: colors.blue, fontSize: 10, fontWeight: '900' },
  replyPreviewBody: { color: colors.faint, fontSize: 11, marginTop: 2 },
  inputBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 7, alignItems: 'flex-end' },
  composerPill: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', borderRadius: 23, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingLeft: 4, paddingRight: 4 },
  inlineAction: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  inputIcon: { width: 30, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  messageInput: { flex: 1, minWidth: 78, maxHeight: 92, color: colors.text, paddingLeft: 12, paddingRight: 3, paddingVertical: 10, fontSize: 13 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue, marginBottom: 1 },
  sendButtonIdle: { opacity: 1, backgroundColor: '#426084' },
  priorityFooter: { color: colors.faint, fontSize: 8.5, textAlign: 'center', paddingBottom: 5 },
  priorityStrong: { color: colors.blue, fontWeight: '900' },
  sendButtonSmall: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue },
  recordingTray: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B6B' },
  recordingTime: { color: colors.text, fontSize: 11, fontWeight: '900', minWidth: 34 },
  recordingBars: { flex: 1, minWidth: 40, height: 26, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' },
  recordingBar: { width: 3, borderRadius: 2, backgroundColor: colors.blue },
  stopButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  requestPanel: { borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  requestTitle: { color: colors.text, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  requestCopy: { color: colors.faint, fontSize: 11, textAlign: 'center', marginTop: 4 },
  requestActions: { flexDirection: 'row', gap: 10, marginTop: 13 },
  requestDecline: { flex: 1, height: 43, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  requestDeclineText: { color: '#FF8080', fontSize: 13, fontWeight: '900' },
  requestAccept: { flex: 1, height: 43, borderRadius: 22, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  requestAcceptText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.58)' },
  filterSheet: { maxHeight: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, backgroundColor: '#0D1015', paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 26 : 18 },
  filterHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  filterClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  filterRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.07)' },
  filterCreatorStart: { marginTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.07)' },
  filterCopy: { flex: 1, minWidth: 0 },
  filterLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  filterSubtitle: { color: colors.faint, fontSize: 11, marginTop: 2 },
  giftSheet: { height: '72%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, backgroundColor: '#0D1015', paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 26 : 18 },
  giftHint: { color: colors.faint, fontSize: 11, marginTop: 3 },
  giftGrid: { paddingTop: 14, paddingBottom: 20 },
  giftColumns: { gap: 9, marginBottom: 9 },
  giftCard: { flex: 1, minWidth: 0, maxWidth: '32%', minHeight: 136, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 8 },
  giftArt: { width: 68, height: 68 },
  giftName: { color: colors.text, fontSize: 10, fontWeight: '800', marginTop: 5, maxWidth: '100%' },
  giftPrice: { color: '#E9B85D', fontSize: 9, fontWeight: '900', marginTop: 3 },
  timerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, backgroundColor: '#1B212C', paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 26 : 18 },
  timerLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  timerNotice: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 12 },
  disappearingViewer: { flex: 1, backgroundColor: '#000' },
  viewerHead: { height: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  viewerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  viewerMedia: { width: '100%', height: '100%' },
  viewerText: { color: '#FFF', fontSize: 24, lineHeight: 34, textAlign: 'center', fontWeight: '700' },
  directSetupSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, backgroundColor: '#1B212C', paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 20 },
  settingRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.07)', paddingVertical: 9 },
  fieldLabel: { color: colors.faint, fontSize: 10, fontWeight: '700', marginTop: 12, marginBottom: 5 },
  settingInput: { height: 43, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, color: colors.text, paddingHorizontal: 12, fontSize: 14, fontWeight: '800' },
  settingFields: { flexDirection: 'row', gap: 10 },
  settingField: { flex: 1 },
  saveSettings: { height: 46, borderRadius: 23, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveSettingsText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  newSheet: { maxHeight: '82%', minHeight: '62%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18 },
  newChoiceSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, backgroundColor: '#1B212C', paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 22 },
  choiceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.07)', paddingVertical: 10 },
  choiceIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  groupChoiceIcon: { backgroundColor: 'rgba(183,156,255,.08)', borderRadius: 16 },
  newGroupSheet: { height: '78%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, backgroundColor: '#1B212C', paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 18 },
  groupIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupAvatar: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.faint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupAvatarImage: { width: '100%', height: '100%' },
  groupName: { flex: 1, marginTop: 0, marginBottom: 0 },
  groupMembersTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 18, marginBottom: 8 },
  groupSearch: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, paddingHorizontal: 12, marginBottom: 4 },
  groupSearchInput: { flex: 1, color: colors.text, fontSize: 13 },
  groupPerson: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.07)' },
  groupHeaderIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  groupSender: { color: colors.blue, fontSize: 9, fontWeight: '900', marginBottom: 3 },
  groupInfoSheet: { height: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, backgroundColor: '#1B212C', paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 18 },
  groupInfoIdentity: { alignItems: 'center', gap: 9, paddingVertical: 12 },
  groupInfoName: { minWidth: 180, maxWidth: '90%', height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.line, color: colors.text, textAlign: 'center', fontSize: 16, fontWeight: '900', paddingHorizontal: 12 },
  groupInfoSave: { borderRadius: 99, backgroundColor: 'rgba(156,203,255,.12)', paddingHorizontal: 18, paddingVertical: 8 },
  groupInfoSaveText: { color: colors.blue, fontSize: 11, fontWeight: '900' },
  groupInfoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addMemberText: { color: colors.blue, fontSize: 12, fontWeight: '900' },
  memberCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  memberCheckActive: { borderColor: colors.blue, backgroundColor: colors.blue },
  createGroupButton: { height: 47, borderRadius: 13, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  createGroupText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.25)', marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  searchInput: { height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, color: colors.text, paddingHorizontal: 13, marginTop: 10, marginBottom: 8 },
  searchLoading: { paddingVertical: 20 },
  emptyPeople: { color: colors.muted, textAlign: 'center', paddingVertical: 28 },
  personRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  disabled: { opacity: .55 },
});
