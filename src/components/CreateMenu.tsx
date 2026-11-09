import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import type { CreateTarget } from '../types';

const items = [
  { key: 'seen', label: 'Seen', icon: 'eye-outline' },
  { key: 'experience', label: 'Experience', icon: 'image-outline' },
  { key: 'story', label: 'Story', icon: 'aperture-outline' },
  { key: 'note', label: 'Note', icon: 'create-outline' },
  { key: 'world', label: 'World', icon: 'planet-outline' },
] as const;

export function CreateMenu({ onClose, onSelect, targets }: { onClose: () => void; onSelect: (target: CreateTarget) => void; targets?: CreateTarget[] }) {
  const { width } = useWindowDimensions();
  const menuWidth = Math.min(184, width - 32);
  const menuLeft = Math.max(16, (width - menuWidth) / 2);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable accessibilityLabel="Close create menu" onPress={onClose} style={styles.dismiss} />
      <View accessibilityLabel="Create" style={[styles.menu, { left: menuLeft, width: menuWidth }]}>
        {items.filter((item) => !targets || targets.includes(item.key)).map((item) => (
          <Pressable
            accessibilityLabel={`Create ${item.label}`}
            accessibilityRole="button"
            key={item.key}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Ionicons color={colors.muted} name={item.icon as keyof typeof Ionicons.glyphMap} size={16} />
            <Text style={styles.label}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dismiss: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  menu: { position: 'absolute', bottom: 116, zIndex: 30, elevation: 30, gap: 8 },
  row: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.13)',
    backgroundColor: '#151922',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingHorizontal: 18,
  },
  rowPressed: { backgroundColor: '#1B212B', borderColor: 'rgba(156,203,255,.28)' },
  label: { color: colors.text, fontSize: 12, fontWeight: '900' },
});
