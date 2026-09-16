import { View, Text, StyleSheet } from 'react-native';
import PrimaryButton from './PrimaryButton';
import { colors, spacing, typography, borderWidth } from '../constants/theme';

// One consistent "nothing to show" pattern — a message plus an optional
// action (e.g. Retry) — instead of ad hoc inline text per screen.
export default function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <View style={styles.container}>
      {title ? <Text style={typography.subtitle}>{title}</Text> : null}
      {message ? <Text style={[typography.caption, styles.message]}>{message}</Text> : null}
      {actionLabel ? (
        <View style={styles.action}>
          <PrimaryButton title={actionLabel} variant="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thin,
    borderColor: colors.ink,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  message: {
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
});
