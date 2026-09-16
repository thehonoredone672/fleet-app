import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderWidth } from '../constants/theme';

// One consistent top-of-screen header — title on the left, an optional
// short meta string on the right (a count, a freshness indicator) — used
// across every screen instead of each one inventing its own heading
// layout. A bottom rule (not a shadow — one-bit system) separates it from
// content below.
export default function ScreenHeader({ title, meta }) {
  return (
    <View style={styles.container}>
      <Text style={typography.title}>{title}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: colors.ink,
  },
  meta: {
    ...typography.caption,
  },
});
