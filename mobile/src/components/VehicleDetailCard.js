import { View, Text, StyleSheet, Pressable } from 'react-native';
import StatusBadge from './StatusBadge';
import { colors, spacing, typography, borderWidth } from '../constants/theme';
import { timeAgo } from '../utils/timeAgo';
import { deriveMapStatus } from '../utils/vehicleMapStatus';

// The marker-tap detail card from the product spec (§11):
//   TN 38 AB 1234 / Driver: Arun / Status: In Transit / Speed: 48 km/h /
//   Last updated: 12 sec ago
export default function VehicleDetailCard({ vehicle, onClose }) {
  const mapStatus = deriveMapStatus(vehicle);
  const speedKmh = vehicle.location?.speed != null ? Math.round(vehicle.location.speed * 3.6) : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={typography.subtitle}>{vehicle.registrationNumber}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>

      <Text style={styles.row}>
        Driver: <Text style={styles.value}>{vehicle.assignedDriver?.name || 'Unassigned'}</Text>
      </Text>

      <View style={styles.row}>
        <StatusBadge label={mapStatus.label} emphasis={mapStatus.code === 'MOVING'} />
      </View>

      <Text style={styles.row}>
        Speed: <Text style={styles.value}>{speedKmh != null ? `${speedKmh} km/h` : '—'}</Text>
      </Text>

      <Text style={[styles.row, styles.caption]}>
        Last updated: {vehicle.location ? timeAgo(vehicle.location.timestamp) : 'no data yet'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thick,
    borderColor: colors.ink,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  close: {
    ...typography.label,
  },
  row: {
    ...typography.body,
  },
  value: {
    fontWeight: '700',
  },
  caption: {
    ...typography.caption,
  },
});
