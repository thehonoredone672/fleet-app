import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderWidth } from '../constants/theme';

// One consistent status pill — no color-coding by status (one-bit
// design: black/white only). Meaning comes entirely from the label text,
// not hue. `emphasis` fills the badge solid black for a status that
// should draw the eye (e.g. a vehicle currently moving).
export default function StatusBadge({ label, emphasis = false }) {
  return (
    <View style={[styles.badge, emphasis && styles.badgeEmphasis]} accessible accessibilityLabel={`Status: ${label}`}>
      <Text style={[styles.text, emphasis && styles.textEmphasis]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: borderWidth.thin,
    borderColor: colors.ink,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  badgeEmphasis: {
    backgroundColor: colors.ink,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textEmphasis: {
    color: colors.inverse,
  },
});
