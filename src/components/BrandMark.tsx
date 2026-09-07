import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export function BrandMark() { return <View style={styles.row}><Ionicons name="eye" color={colors.blue} size={25} /><Text style={styles.text}>@seen</Text></View>; }
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 9 }, text: { color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: -1 } });
