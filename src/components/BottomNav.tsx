import { Pressable, StyleSheet, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { colors } from '../theme';
import type { MainTab } from '../types';

const items = [
  { key: 'seen', label: 'Seen', icon: 'eye-outline', thin: 'eye' },
  { key: 'discover', label: 'Discover', icon: null, thin: null },
  { key: 'wall', label: 'Wall', icon: 'easel-outline', thin: 'monitor' },
  { key: 'messages', label: 'Messages', icon: 'chatbubble-outline', thin: 'message-circle' },
  { key: 'profile', label: 'Profile', icon: 'person-circle-outline', thin: null },
] as const;
function DiscoverIcon({ color, compact }: { color: string; compact: boolean }) {
  return <View style={[styles.discoverIcon, compact && { transform: [{ scale: .8 }] }]}><View style={[styles.discoverRect, styles.discoverFirst, { borderColor: color }]} /><View style={[styles.discoverRect, styles.discoverSecond, { borderColor: color }]} /></View>;
}
export function BottomNav({ active, avatar, name, onSelect, compactProfile = false }: { active: MainTab; avatar?: string; name?: string; onSelect: (key: MainTab) => void; compactProfile?: boolean }) {
  return <View style={[styles.nav, compactProfile && styles.compactNav]}>{items.map((item) => {
    const selected = active === item.key;
    const color = selected ? colors.blue : colors.faint;
    return <Pressable accessibilityLabel={item.label} accessibilityRole="button" accessibilityState={{ selected }} hitSlop={4} key={item.key} onPress={() => onSelect(item.key)} style={styles.item}>
      {item.key === 'profile' ? <View style={[styles.avatarShell, selected && styles.avatarActive, compactProfile && styles.compactAvatar]}><Avatar size={compactProfile ? 23 : 26} user={{ avatar, name }} /></View>
        : compactProfile && item.thin ? <Feather name={item.thin} size={item.key === 'seen' ? 21 : 20} color={color} />
          : item.icon ? <Ionicons name={selected ? item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : item.icon} size={24} color={color} /> : <DiscoverIcon color={color} compact={compactProfile} />}
      {!compactProfile ? <View style={[styles.dot, selected && styles.dotActive]} /> : null}
    </Pressable>;
  })}</View>;
}
const styles = StyleSheet.create({
  nav: { height: 64, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', borderTopColor: colors.line, borderTopWidth: 1, backgroundColor: '#0D1014', paddingTop: 12 }, compactNav: { height: 54, backgroundColor: colors.bg, paddingHorizontal: 8 }, item: { width: '20%', height: 42, alignItems: 'center', justifyContent: 'flex-start' }, dot: { width: 3, height: 3, borderRadius: 2, marginTop: 5, backgroundColor: 'transparent' }, dotActive: { backgroundColor: colors.blue }, discoverIcon: { width: 25, height: 25 }, discoverRect: { position: 'absolute', width: 10, height: 16, borderWidth: 1.8, borderRadius: 3 }, discoverFirst: { left: 3, top: 1 }, discoverSecond: { right: 3, bottom: 1 }, avatarShell: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, avatarActive: { borderWidth: 1.5, borderColor: colors.blue }, compactAvatar: { width: 26, height: 26, borderRadius: 13 },
});
