import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';
import type { CreateTarget } from '../types';

const items = [
  { key: 'story', title: 'Story', description: 'Gone in 24 hours' },
  { key: 'seen', title: 'Seen', description: 'Chapters · free or paid' },
  { key: 'note', title: 'Wall post', description: 'Ask, offer, recommend' },
] as const;

function CreateIcon({ kind }: { kind: CreateTarget }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={kind === 'world' ? colors.muted : '#EDEFF3'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {kind === 'story' ? <><Circle cx={12} cy={12} r={8.5} strokeDasharray="4 3" /><Circle cx={12} cy={12} r={3.6} /></> : kind === 'seen' ? <><Path d="M2 12C5.3 7.8 18.7 7.8 22 12 18.7 16.2 5.3 16.2 2 12z" /><Circle cx={12} cy={12} r={2.4} /></> : kind === 'world' ? <><Circle cx={12} cy={12} r={5.5} /><Ellipse cx={12} cy={12} rx={10} ry={3.6} rotation={-18} origin="12, 12" /></> : <><Rect x={3.5} y={4.5} width={17} height={12} rx={3} /><Path d="M9 20.5h6" /></>}
  </Svg>;
}

export function CreateMenu({ onClose, onSelect, targets }: { onClose: () => void; onSelect: (target: CreateTarget) => void; targets?: CreateTarget[] }) {
  const [visible, setVisible] = useState(true);
  const insets = useSafeAreaInsets();
  const closing = useRef(false), selected = useRef<CreateTarget | null>(null), completed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const finish = () => {
    if (completed.current) return;
    completed.current = true;
    if (selected.current) onSelect(selected.current); else onClose();
  };
  const dismiss = (target?: CreateTarget) => {
    if (closing.current) return;
    closing.current = true; selected.current = target || null; setVisible(false);
    // iOS supplies onDismiss; Android needs to finish the native slide before opening another flow.
    if (Platform.OS !== 'ios') timer.current = setTimeout(finish, 350);
  };
  const allowed = (target: CreateTarget) => !targets || targets.includes(target);
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={() => dismiss()} onDismiss={finish} presentationStyle="overFullScreen" statusBarTranslucent>
    <View style={s.layer}><Pressable accessibilityLabel="Close create menu" onPress={() => dismiss()} style={s.scrim} /><View accessibilityViewIsModal accessibilityLabel="Create" style={[s.sheet, { paddingBottom: 20 + insets.bottom }]}>
      <View style={s.handle} />
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        <Text style={s.heading}>Create</Text>
        <View style={s.cards}>{items.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`Create ${item.title}. ${item.description}`} accessibilityState={{ disabled: !allowed(item.key) }} disabled={!allowed(item.key)} key={item.key} onPress={() => dismiss(item.key)} style={({ pressed }) => [s.card, pressed && s.pressed, !allowed(item.key) && s.disabled]}><CreateIcon kind={item.key} /><Text style={s.cardTitle}>{item.title}</Text><Text style={s.description}>{item.description}</Text></Pressable>)}</View>
        <Text style={s.section}>FOR CREATORS</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Open my World. Your subscription — everything you share" accessibilityState={{ disabled: !allowed('world') }} disabled={!allowed('world')} onPress={() => dismiss('world')} style={({ pressed }) => [s.world, pressed && s.pressed, !allowed('world') && s.disabled]}><CreateIcon kind="world" /><View style={s.worldCopy}><Text style={s.worldTitle}>Open my World</Text><Text style={s.worldDescription}>Your subscription — everything you share</Text></View><Feather name="chevron-right" size={14} color={colors.faint} /></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({ layer: { flex: 1, justifyContent: 'flex-end' }, scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.65)' }, sheet: { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#0C1014', paddingHorizontal: 20 }, handle: { width: 36, height: 4, borderRadius: 3, alignSelf: 'center', marginTop: 11, marginBottom: 12, backgroundColor: 'rgba(255,255,255,.3)' }, heading: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -.3 }, cards: { flexDirection: 'row', gap: 8, marginTop: 14 }, card: { flex: 1, minWidth: 0, minHeight: 129, borderRadius: 22, padding: 12, backgroundColor: 'rgba(255,255,255,.05)' }, cardTitle: { color: colors.text, fontSize: 14, fontWeight: '800', letterSpacing: -.2, marginTop: 14 }, description: { color: 'rgba(255,255,255,.48)', fontSize: 11, lineHeight: 15, marginTop: 3 }, section: { color: 'rgba(255,255,255,.34)', fontSize: 10.5, fontWeight: '600', letterSpacing: 1.4, marginTop: 22, marginBottom: 2 }, world: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.06)' }, worldCopy: { flex: 1, minWidth: 0 }, worldTitle: { color: colors.text, fontSize: 14.5, fontWeight: '600', letterSpacing: -.15 }, worldDescription: { color: 'rgba(255,255,255,.45)', fontSize: 12, lineHeight: 17, marginTop: 3 }, pressed: { backgroundColor: 'rgba(255,255,255,.09)' }, disabled: { opacity: .38 } });
