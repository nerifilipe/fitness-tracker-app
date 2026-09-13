import { StyleSheet, Text as NativeText, TextProps } from 'react-native';
import { theme } from '../../theme';

type Props = TextProps & { variant?: 'body' | 'label' | 'title' | 'section'; muted?: boolean };

export function Text({ variant = 'body', muted = false, style, ...props }: Props) {
  return <NativeText {...props} style={[styles.base, styles[variant], muted && styles.muted, style]} />;
}

const styles = StyleSheet.create({
  base: { color: theme.colors.text },
  body: { fontSize: theme.type.body, lineHeight: 25 },
  label: { fontSize: theme.type.label, fontWeight: '700', letterSpacing: 1.5, lineHeight: 18 },
  section: { fontSize: theme.type.section, fontWeight: '600', lineHeight: 28 },
  title: { fontSize: theme.type.title, fontWeight: '700', lineHeight: 40 },
  muted: { color: theme.colors.muted },
});
