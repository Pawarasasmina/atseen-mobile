import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { api } from '../services/api';
import { colors } from '../theme';
import { compact } from '../utils/format';
import { normalizeSeenReaction, quickSeenReactions, seenReactionCount, seenReactions } from '../utils/seenReactions';
import type { Engagement } from '../types';

type Anchor = { x: number; y: number; width: number; height: number };
type Props = { visible: boolean; initialMode?: 'quick' | 'full'; anchor?: Anchor; id: string; accessToken: string; engagement: Engagement; onUpdate: (next: Engagement) => void; onClose: () => void };

function ReactionIcon({ reaction, size }: { reaction: typeof seenReactions[number]; size: number }) {
  // A vector eye remains crisp on platforms where the prototype's eye glyph is missing.
  if (reaction.key === 'SEE_YOU') return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F5F6F8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><Circle cx={12} cy={12} r={4} /><Circle cx={12} cy={12} r={1.7} fill="#F5F6F8" stroke="none" /></Svg>;
  return <Text accessible={false} style={{ fontSize: size, lineHeight: size + 8, textAlign: 'center' }}>{reaction.icon}</Text>;
}

export function SeenReactionPicker({ visible, initialMode = 'full', anchor, id, accessToken, engagement, onUpdate, onClose }: Props) {
  const [mode, setMode] = useState(initialMode), [error, setError] = useState(''), [pending, setPending] = useState('');
  const [current, setCurrent] = useState(engagement);
  const busy = useRef(false), version = useRef(0);
  const animation = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => { setCurrent(engagement); }, [engagement, id]);
  useEffect(() => {
    if (!visible) return;
    setMode(initialMode); setError('');
    let alive = true; const revision = version.current;
    api.getSeenEngagement(id, accessToken).then((result) => { if (alive && version.current === revision) { setCurrent(result.engagement); onUpdate(result.engagement); } }).catch(() => {});
    return () => { alive = false; };
  }, [visible, id, accessToken, initialMode]);
  useEffect(() => {
    if (!visible) return;
    animation.setValue(0);
    Animated.timing(animation, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, mode, animation]);
  const choose = async (key: string) => {
    if (busy.current) return;
    busy.current = true; version.current++; setPending(key); setError('');
    try {
      const result = normalizeSeenReaction(current.viewerReaction) === key ? await api.removeSeenReaction(id, accessToken) : await api.reactToSeen(id, key, accessToken);
      setCurrent(result.engagement); onUpdate(result.engagement); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save reaction. Please try again.'); }
    finally { busy.current = false; setPending(''); }
  };
  const selected = normalizeSeenReaction(current.viewerReaction);
  const cell = Math.min(40, (width - 40) / 7);
  const trayWidth = cell * 7 + 24;
  const left = Math.max(8, Math.min(width - trayWidth - 8, (anchor ? anchor.x + anchor.width / 2 : width / 2) - trayWidth / 2));
  const top = Math.max(insets.top + 8, Math.min(height - insets.bottom - 86, (anchor?.y || height * .7) - 64));
  return <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent presentationStyle="overFullScreen">
    <View style={s.layer} accessibilityViewIsModal>
      <Pressable accessibilityLabel="Close reaction picker" onPress={onClose} style={[StyleSheet.absoluteFill, mode === 'full' && s.dim]} />
      {mode === 'quick' ? <Animated.View style={[s.quick, { left, top, width: trayWidth, opacity: animation, transform: [{ scale: animation.interpolate({ inputRange: [0, 1], outputRange: [.7, 1] }) }] }]}>
        {quickSeenReactions.map((reaction) => <Pressable accessibilityRole="button" accessibilityLabel={`${selected === reaction.key ? 'Remove' : 'React:'} ${reaction.label}`} accessibilityState={{ selected: selected === reaction.key, disabled: Boolean(pending) }} key={reaction.key} disabled={Boolean(pending)} onPress={() => choose(reaction.key)} style={[s.quickCell, { width: cell, height: cell }, selected === reaction.key && s.quickSelected]}>{pending === reaction.key ? <ActivityIndicator color={colors.blue} /> : <ReactionIcon reaction={reaction} size={25} />}</Pressable>)}
        <Pressable accessibilityRole="button" accessibilityLabel="More reactions" disabled={Boolean(pending)} onPress={() => setMode('full')} style={[s.more, { width: cell - 2, height: cell - 2 }]}><Ionicons name="add" color={colors.muted} size={20} /></Pressable>
        {error ? <View style={s.quickError}><Text accessibilityRole="alert" style={s.error}>{error}</Text></View> : null}
      </Animated.View> : <Animated.View style={[s.full, { paddingBottom: Math.max(insets.bottom, 22), opacity: animation, transform: [{ translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
        <View style={s.handle} />
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        <View style={s.grid}>{seenReactions.map((reaction) => {
          const count = seenReactionCount(current.reactionBreakdown, reaction.key), chosen = selected === reaction.key;
          return <View key={reaction.key} style={s.gridCell}><Pressable accessibilityRole="button" accessibilityLabel={`${chosen ? 'Remove' : 'React:'} ${reaction.label}, ${count} reactions`} accessibilityState={{ selected: chosen, disabled: Boolean(pending) }} disabled={Boolean(pending)} onPress={() => choose(reaction.key)} style={[s.option, chosen && s.selected]}>{pending === reaction.key ? <View style={s.loading}><ActivityIndicator color={colors.blue} /></View> : <ReactionIcon reaction={reaction} size={30} />}<Text style={[s.count, chosen && s.selectedCount]}>{count ? compact(count) : ' '}</Text></Pressable></View>;
        })}</View>
        <Text style={s.caption}>One reaction — make it yours</Text>
      </Animated.View>}
    </View>
  </Modal>;
}

export function SeenReactionButton({ id, accessToken, engagement, onUpdate, disabled = false }: { id: string; accessToken: string; engagement: Engagement; onUpdate: (next: Engagement) => void; disabled?: boolean }) {
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [position, setPosition] = useState<Anchor>(), [open, setOpen] = useState(false);
  const held = useRef(false);
  const show = () => anchor.current?.measureInWindow((x, y, width, height) => { setPosition({ x, y, width, height }); setOpen(true); });
  const selected = normalizeSeenReaction(engagement.viewerReaction);
  const keys = [...new Set((engagement.topReactions?.length ? engagement.topReactions : ['LIKE', 'LOVE']).map(normalizeSeenReaction))].slice(0, 2);
  return <View ref={anchor} collapsable={false}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Change Seen reaction, ${compact(engagement.reactionCount)} reactions`} accessibilityState={{ selected: Boolean(selected), disabled }} disabled={disabled} delayLongPress={420} onPressIn={() => { held.current = false; }} onLongPress={() => { held.current = true; show(); }} onPress={() => { if (!held.current) show(); }} style={[s.pill, selected && s.pillSelected]}><Text style={s.pillEmoji}>{keys.map((key) => seenReactions.find((entry) => entry.key === key)?.icon || '').join(' ')}</Text><Text style={[s.pillCount, selected && s.selectedCount]}>{compact(engagement.reactionCount)}</Text></Pressable>
    <SeenReactionPicker id={id} accessToken={accessToken} engagement={engagement} onUpdate={onUpdate} visible={open} initialMode="quick" anchor={position} onClose={() => setOpen(false)} />
  </View>;
}
const s = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' }, dim: { backgroundColor: 'rgba(0,0,0,.65)' },
  quick: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 2, padding: 6, borderRadius: 99, backgroundColor: 'rgba(28,33,43,.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', shadowColor: '#000', shadowOpacity: .5, shadowRadius: 17, shadowOffset: { width: 0, height: 12 }, elevation: 12 }, quickCell: { borderRadius: 99, alignItems: 'center', justifyContent: 'center' }, quickSelected: { backgroundColor: 'rgba(156,203,255,.22)' }, more: { borderRadius: 99, backgroundColor: 'rgba(255,255,255,.08)', alignItems: 'center', justifyContent: 'center' }, quickError: { position: 'absolute', top: 62, left: 0, right: 0, backgroundColor: '#1C212B', padding: 10, borderRadius: 12 },
  full: { backgroundColor: '#0C1014', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20 }, handle: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,.3)', borderRadius: 3, alignSelf: 'center', marginTop: 13, marginBottom: 24 }, grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, paddingHorizontal: 2 }, gridCell: { width: '20%', alignItems: 'center' }, option: { minWidth: 48, minHeight: 62, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3 }, selected: { backgroundColor: 'rgba(156,203,255,.14)' }, loading: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, count: { minHeight: 12, fontSize: 9.5, lineHeight: 12, fontWeight: '700', color: colors.faint }, selectedCount: { color: colors.blue }, caption: { textAlign: 'center', marginTop: 18, marginBottom: 12, fontSize: 10, color: colors.faint }, error: { color: colors.danger, fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 8 }, pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingHorizontal: 10, minHeight: 31, backgroundColor: 'rgba(255,255,255,.05)' }, pillSelected: { backgroundColor: 'rgba(156,203,255,.12)' }, pillEmoji: { fontSize: 12 }, pillCount: { color: colors.muted, fontSize: 11 },
});
