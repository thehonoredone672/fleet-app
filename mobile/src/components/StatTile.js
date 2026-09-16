import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderWidth } from '../constants/theme';

// One stat per tile — label, big number, optional caption. Deliberately
// plain numbers rather than charts: the spec itself asks for a simple,
// uncluttered dashboard (§20), and a numeric grid fits the one-bit system
// more naturally than a chart library would.
export default function StatTile({ label, value, caption }) {
  return (
    <View style={styles.tile}>
      <Text style={typography.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {caption ? <Text style={typography.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '48%',
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thin,
    borderColor: colors.ink,
    padding: spacing.md,
    gap: 2,
  },
  value: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.ink,
  },
});
