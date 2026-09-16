import { View, Text, StyleSheet } from 'react-native';
import useOfflineQueue from '../hooks/useOfflineQueue';
import { colors, spacing, borderWidth } from '../constants/theme';

// §19: the app must keep working offline — this makes that state
// visible rather than silent, so a driver knows an action is queued
// rather than lost. Renders nothing when the queue is empty.
export default function PendingSyncBadge() {
  const queue = useOfflineQueue();
  if (queue.length === 0) return null;

  return (
    <View style={styles.badge} accessibilityLabel={`${queue.length} action${queue.length === 1 ? '' : 's'} pending sync`}>
      <Text style={styles.text}>
        {queue.length} PENDING SYNC{queue.length === 1 ? '' : 'S'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: borderWidth.thin,
    borderColor: colors.ink,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.4,
  },
});
