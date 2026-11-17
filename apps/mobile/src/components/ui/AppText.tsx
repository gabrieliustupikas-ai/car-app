import { Text, type TextProps } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { type as typeScale, type Colors } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

export function AppText({ variant = 'body', color = 'text', style, ...rest }: TextProps & { variant?: Variant; color?: keyof Colors }) {
  const { colors } = useTheme();
  return <Text allowFontScaling maxFontSizeMultiplier={1.8} style={[typeScale[variant], { color: colors[color] }, style]} {...rest} />;
}
