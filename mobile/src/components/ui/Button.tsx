import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { Text } from './Text';

type Props = { label: string; onPress: () => void; loading?: boolean };

export function Button({ label, onPress, loading = false }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: loading, busy: loading }} disabled={loading}
      onPress={onPress} style={({ pressed }) => [styles.button, (pressed || loading) && styles.dimmed]}>
      {loading && <ActivityIndicator color={theme.colors.onAccent} />}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: theme.minTouchTarget, padding: theme.space.md, borderRadius: theme.radius.control,
    backgroundColor: theme.colors.accent, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: theme.space.sm,
  },
  label: { color: theme.colors.onAccent, fontWeight: '700', flexShrink: 1 },
  dimmed: { opacity: 0.7 },
});
