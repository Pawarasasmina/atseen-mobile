import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { BottomNav } from '../components/BottomNav';
import { ScreenState, SkeletonRows } from '../components/ScreenState';
import { api, resolveMediaUrl } from '../services/api';
import { getMessageSocket } from '../services/messageSocket';
import { colors } from '../theme';
import { newClientMessageId, relativeTime, userName } from '../utils/format';
import type { Conversation, DirectAccessWindow, MainTab, Message, Session, User } from '../types';

type InboxTab = 'all' | 'requests' | 'direct';

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

function ChatModal({ conversation, onClose, onRefresh, session }: { conversation: Conversation | null; onClose: () => void; onRefresh: () => void; session: Session }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const otherId = conversation?.id || '';
  const windowId = conversation?.directAccessWindow?.id || null;
  const myId = String(session.user.id || session.user._id || '');
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
      const result = await api.sendMessage(otherId, body, clientMessageId, windowId, session.accessToken);
      setMessages((current) => [...current, result.message]);
      onRefresh();
    } catch (error) {
      setText(body);
      Alert.alert('Message failed', error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setSending(false);
    }
  };
  return <Modal animationType="slide" visible={Boolean(conversation)} onRequestClose={onClose}><SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatScreen}><View style={styles.chatHeader}><Pressable accessibilityLabel="Back to inbox" hitSlop={8} onPress={onClose}><Ionicons color={colors.text} name="chevron-back" size={26} /></Pressable><Avatar size={34} user={conversation?.participant} /><View style={styles.chatTitleWrap}><Text numberOfLines={1} style={styles.chatTitle}>{userName(conversation?.participant)}</Text>{conversation?.directAccessWindow ? <Text style={styles.chatSub}>Direct Access · {daLabel(conversation.directAccessWindow)}</Text> : <Text style={styles.chatSub}>{conversation?.status === 'REQUEST' ? 'Message request' : 'Conversation'}</Text>}</View></View>{loading ? <ScreenState loading title="Opening conversation" /> : <FlatList contentContainerStyle={styles.chatList} data={messages} keyExtractor={(item) => item.id} ListEmptyComponent={<ScreenState icon="chatbubble-outline" title="No messages yet." />} renderItem={({ item }) => { const mine = String(item.senderId) === myId; const image = resolveMediaUrl(item.image?.url || item.sharedContent?.imageUrl || ''); return <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}><View style={[styles.bubble, mine && styles.bubbleMine]}>{image ? <Image source={{ uri: image }} style={styles.messageImage} /> : null}<Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{preview(item)}</Text><Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{relativeTime(item.createdAt)}</Text></View></View>; }} />}<View style={styles.inputBar}><TextInput onChangeText={setText} placeholder="Message..." placeholderTextColor={colors.faint} style={styles.messageInput} value={text} /><Pressable accessibilityLabel="Send message" disabled={sending || !text.trim()} onPress={send} style={[styles.sendButton, (!text.trim() || sending) && styles.disabled]}>{sending ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons color={colors.bg} name="send" size={17} />}</Pressable></View></KeyboardAvoidingView></SafeAreaView></Modal>;
}

function NewMessageModal({ onClose, onSelect, session, visible }: { onClose: () => void; onSelect: (conversation: Conversation) => void; session: Session; visible: boolean }) {
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
  return <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={visible} onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.newSheet}><View style={styles.sheetHandle} /><View style={styles.chatHeaderCompact}><Text style={styles.sheetTitle}>New message</Text><Pressable onPress={onClose}><Ionicons color={colors.muted} name="close" size={24} /></Pressable></View><TextInput autoFocus onChangeText={search} placeholder="Search people" placeholderTextColor={colors.faint} style={styles.searchInput} value={query} />{loading ? <ActivityIndicator color={colors.blue} style={styles.searchLoading} /> : <FlatList data={people} keyExtractor={(item, index) => String(item.id || item._id || item.username || index)} ListEmptyComponent={<Text style={styles.emptyPeople}>No people found.</Text>} renderItem={({ item }) => <Pressable onPress={() => { onClose(); onSelect({ id: String(item.id || item._id), participant: item, status: 'ACTIVE' }); }} style={styles.personRow}><Avatar size={38} user={item} /><View style={styles.rowCopy}><Text style={styles.rowName}>{userName(item)}</Text><Text style={styles.preview}>@{item.username}</Text></View></Pressable>} />}</View></View></Modal>;
}

export function MessagesScreen({ onNavigate, session }: { onNavigate: (key: MainTab) => void; session: Session }) {
  const [tab, setTab] = useState<InboxTab>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [windows, setWindows] = useState<DirectAccessWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const selectedRef = useRef<Conversation | null>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      const [conversationData, windowData] = await Promise.all([api.listConversations(session.accessToken), api.listDirectAccessWindows(session.accessToken)]);
      setConversations(conversationData.conversations || []);
      setWindows(windowData.windows || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Messages are unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.accessToken]);
  useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
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
  const visible = merged.filter((item) => tab === 'requests' ? item.status === 'REQUEST' || item.requestReceived : tab === 'direct' ? Boolean(item.directAccessWindow) : !item.archived);
  const archive = (conversation: Conversation) => Alert.alert(conversation.archived ? 'Unarchive conversation?' : 'Archive conversation?', userName(conversation.participant), [{ text: 'Cancel', style: 'cancel' }, { text: conversation.archived ? 'Unarchive' : 'Archive', onPress: async () => { try { await api.archiveConversation(conversation.id, !conversation.archived, session.accessToken); load(); } catch (error) { Alert.alert('Archive failed', error instanceof Error ? error.message : 'Please retry.'); } } }]);
  const header = <><View style={styles.header}><Text style={styles.username}><Text style={styles.at}>@</Text>{session.user.username || 'seen'}</Text><View style={styles.headerActions}><Pressable accessibilityLabel="New message" style={styles.round} onPress={() => setNewOpen(true)}><Ionicons color={colors.muted} name="add" size={21} /></Pressable><Pressable accessibilityLabel="Refresh messages" style={styles.round} onPress={load}><Ionicons color={colors.blue} name="sparkles" size={17} /></Pressable></View></View><View style={styles.segment}>{([{ key: 'all', label: 'All', count: 0 }, { key: 'requests', label: 'Requests', count: requestCount }, { key: 'direct', label: 'Direct Access', count: directCount }] as const).map((item) => <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.segmentItem, tab === item.key && styles.segmentActive]}><Text style={[styles.segmentText, tab === item.key && styles.segmentTextActive]}>{item.label}{item.count ? ` ${item.count}` : ''}</Text></Pressable>)}</View></>;
  return <SafeAreaView style={styles.safe}><View style={styles.screen}>{loading ? <><View style={styles.header}><Text style={styles.username}><Text style={styles.at}>@</Text>{session.user.username}</Text></View><SkeletonRows count={5} /></> : <FlatList contentContainerStyle={styles.list} data={visible} keyExtractor={(item) => `${tab}-${item.id}-${item.directAccessWindow?.id || ''}`} ListEmptyComponent={<ScreenState icon="chatbubble-outline" title={error ? 'Inbox could not load' : tab === 'requests' ? 'No message requests.' : tab === 'direct' ? 'No Direct Access conversations.' : 'No conversations yet.'} message={error || undefined} onPress={error ? load : undefined} />} ListHeaderComponent={header} refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.blue} onRefresh={() => { setRefreshing(true); load(); }} />} renderItem={({ item }) => <MessageRow conversation={item} onArchive={archive} onOpen={setSelected} />} /> }<NewMessageModal onClose={() => setNewOpen(false)} onSelect={setSelected} session={session} visible={newOpen} /><ChatModal conversation={selected} onClose={() => setSelected(null)} onRefresh={load} session={session} /><BottomNav active="messages" avatar={session.user.avatar} name={session.user.name || session.user.username} onSelect={onNavigate} /></View></SafeAreaView>;
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
  segment: { flexDirection: 'row', marginHorizontal: 46, marginBottom: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  segmentItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentActive: { backgroundColor: colors.surface2 },
  segmentText: { color: colors.faint, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  segmentTextActive: { color: colors.text },
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
  chatHeader: { height: 62, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  chatHeaderCompact: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chatTitleWrap: { flex: 1, minWidth: 0 },
  chatTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  chatSub: { color: colors.faint, fontSize: 10, marginTop: 2 },
  chatList: { padding: 14, gap: 9 },
  bubbleWrap: { alignItems: 'flex-start' },
  bubbleWrapMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 17, borderBottomLeftRadius: 5, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface2 },
  bubbleMine: { borderBottomLeftRadius: 17, borderBottomRightRadius: 5, backgroundColor: colors.blue },
  bubbleText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  bubbleTextMine: { color: colors.bg, fontWeight: '700' },
  bubbleTime: { color: colors.faint, fontSize: 9, marginTop: 4 },
  bubbleTimeMine: { color: 'rgba(10,12,15,.58)' },
  messageImage: { width: 180, height: 104, borderRadius: 12, marginBottom: 7 },
  inputBar: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.line },
  messageInput: { flex: 1, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.58)' },
  newSheet: { maxHeight: '82%', minHeight: '62%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.25)', marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  searchInput: { height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, color: colors.text, paddingHorizontal: 13, marginTop: 10, marginBottom: 8 },
  searchLoading: { paddingVertical: 20 },
  emptyPeople: { color: colors.muted, textAlign: 'center', paddingVertical: 28 },
  personRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  disabled: { opacity: .55 },
});
