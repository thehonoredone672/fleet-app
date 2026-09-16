import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as vehicleService from '../../services/vehicleService';
import * as tripService from '../../services/tripService';
import * as fuelService from '../../services/fuelService';
import useOfflineQueue from '../../hooks/useOfflineQueue';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';
import StatTile from '../../components/StatTile';
import PrimaryButton from '../../components/PrimaryButton';
import PendingSyncBadge from '../../components/PendingSyncBadge';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography, borderWidth } from '../../constants/theme';

const isToday = (isoDate) => new Date(isoDate).toDateString() === new Date().toDateString();

export default function DriverHomeScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const queue = useOfflineQueue();
  const [submitting, setSubmitting] = useState(false);

  const vehicleQuery = useQuery({ queryKey: ['my-vehicle'], queryFn: vehicleService.getMyVehicle, retry: false });
  const tripsQuery = useQuery({ queryKey: ['trips-mine'], queryFn: () => tripService.listMine({ limit: 20 }) });
  const fuelQuery = useQuery({ queryKey: ['fuel-mine'], queryFn: () => fuelService.listMine({ limit: 20 }) });

  // Re-sync the screen whenever the offline queue changes size — an item
  // added (optimistic-ish immediate feedback) or removed (flushed,
  // whether just now while online or later on reconnect).
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['trips-mine'] });
    queryClient.invalidateQueries({ queryKey: ['fuel-mine'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const currentTrip = useMemo(() => {
    const trips = tripsQuery.data || [];
    return (
      trips.find((t) => ['IN_PROGRESS', 'PAUSED'].includes(t.status)) ||
      trips.find((t) => t.status === 'SCHEDULED') ||
      null
    );
  }, [tripsQuery.data]);

  const todaysDistance = useMemo(() => {
    const trips = tripsQuery.data || [];
    return trips
      .filter((t) => t.status === 'COMPLETED' && t.endTime && isToday(t.endTime))
      .reduce((sum, t) => sum + (t.distance || 0), 0);
  }, [tripsQuery.data]);

  const todaysFuelCost = useMemo(() => {
    const records = fuelQuery.data || [];
    return records.filter((r) => isToday(r.date)).reduce((sum, r) => sum + (r.totalCost || 0), 0);
  }, [fuelQuery.data]);

  const handleStart = async () => {
    setSubmitting(true);
    await tripService.startTrip(currentTrip.id);
    setSubmitting(false);
  };

  const handleEnd = async () => {
    setSubmitting(true);
    await tripService.endTrip(currentTrip.id);
    setSubmitting(false);
  };

  const isLoading = vehicleQuery.isLoading || tripsQuery.isLoading;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Home" />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <PendingSyncBadge />

          <View style={styles.card}>
            <Text style={typography.label}>Assigned Vehicle</Text>
            {vehicleQuery.data ? (
              <>
                <Text style={typography.subtitle}>{vehicleQuery.data.registrationNumber}</Text>
                <View style={styles.badgeRow}>
                  <StatusBadge label={vehicleQuery.data.status} emphasis={vehicleQuery.data.status === 'ACTIVE'} />
                </View>
              </>
            ) : (
              <Text style={typography.caption}>No vehicle currently assigned</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={typography.label}>Today's Trip</Text>
            {currentTrip ? (
              <>
                <Text style={typography.subtitle}>
                  {currentTrip.source} → {currentTrip.destination}
                </Text>
                <View style={styles.badgeRow}>
                  <StatusBadge label={currentTrip.status.replace('_', ' ')} emphasis={currentTrip.status === 'IN_PROGRESS'} />
                </View>

                <View style={styles.actions}>
                  {currentTrip.status === 'SCHEDULED' ? (
                    <PrimaryButton title="Start Trip" onPress={handleStart} loading={submitting} />
                  ) : null}
                  {['IN_PROGRESS', 'PAUSED'].includes(currentTrip.status) ? (
                    <PrimaryButton title="End Trip" onPress={handleEnd} loading={submitting} />
                  ) : null}
                </View>
              </>
            ) : (
              <Text style={typography.caption}>No trip scheduled right now</Text>
            )}
          </View>

          <View style={styles.grid}>
            <StatTile label="Today's Distance" value={Math.round(todaysDistance)} caption="km" />
            <StatTile label="Today's Fuel Cost" value={Math.round(todaysFuelCost * 100) / 100} />
          </View>

          <PrimaryButton title="Add Fuel" variant="secondary" onPress={() => navigation.navigate('Fuel')} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thick,
    borderColor: colors.ink,
    padding: spacing.md,
    gap: spacing.xs,
  },
  badgeRow: { marginTop: spacing.xs, alignItems: 'flex-start' },
  actions: { marginTop: spacing.sm, gap: spacing.sm },
  grid: { flexDirection: 'row', gap: spacing.sm },
});
