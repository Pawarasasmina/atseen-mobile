import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

const items = [{ label: 'Seen', icon: 'eye-outline' }, { label: 'Saved', icon: 'copy-outline' }, { label: 'Studio', icon: 'easel-outline' }, { label: 'Messages', icon: 'chatbubble-outline' }, { label: 'Profile', icon: 'person-circle-outline' }] as const;
export function BottomNav() { return <View style={styles.nav}>{items.map((item, index) => <Pressable accessibilityRole="button" disabled={index !== 0} key={item.label} style={styles.item}><Ionicons name={item.icon} size={23} color={index === 0 ? colors.blue : colors.faint} /><Text style={[styles.label, index === 0 && styles.active]}>{item.label}</Text></Pressable>)}</View>; }
const styles = StyleSheet.create({ nav: { height: 78, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', borderTopColor: colors.line, borderTopWidth: 1, backgroundColor: '#0D1014', paddingTop: 12 }, item: { width: 64, alignItems: 'center', gap: 4 }, label: { color: colors.faint, fontSize: 10, fontWeight: '700' }, active: { color: colors.blue } });
