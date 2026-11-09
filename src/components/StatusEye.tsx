import Svg, { Path, Circle } from 'react-native-svg';
export function StatusEye({ color = '#A7ADB7', size = 12 }: { color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}><Path d="M2 12C5.3 7.8 18.7 7.8 22 12 18.7 16.2 5.3 16.2 2 12z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" /><Circle cx="12" cy="12" r="2.6" fill={color} /></Svg>;
}
