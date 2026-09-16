import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as dashboardService from '../../services/dashboardService';
import ScreenHeader from '../../components/ScreenHeader';
import StatTile from '../../components/StatTile';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../constants/theme';

const round1 = (n) => (n == null ? '—' : Math.round(n * 10) / 10);

export default function DashboardScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: dashboardService.getKpis,
    refetchInterval: 60000,
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Dashboard" meta="Last 30 days" />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <EmptyState title="Couldn't load the dashboard" actionLabel="Retry" onAction={refetch} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={typography.subtitle}>Fleet</Text>
          <View style={styles.grid}>
            <StatTile label="Total Vehicles" value={data.fleet.totalVehicles} />
            <StatTile label="Active" value={data.fleet.activeVehicles} />
            <StatTile label="In Maintenance" value={data.fleet.maintenanceVehicles} />
            <StatTile label="Available" value={data.fleet.availableVehicles} />
          </View>

          <Text style={typography.subtitle}>Drivers &amp; Trips</Text>
          <View style={styles.grid}>
            <StatTile label="Total Drivers" value={data.drivers.totalDrivers} />
            <StatTile label="Active Drivers" value={data.drivers.activeDrivers} />
            <StatTile label="Active Trips" value={data.trips.activeTrips} />
            <StatTile label="Completed Trips" value={data.trips.completedTrips} />
          </View>

          <Text style={typography.subtitle}>Costs &amp; Distance</Text>
          <View style={styles.grid}>
            <StatTile label="Fuel Cost" value={round1(data.costs.fuelCost)} />
            <StatTile label="Maintenance Cost" value={round1(data.costs.maintenanceCost)} />
            <StatTile label="Total Distance" value={round1(data.distance.totalKm)} caption="km" />
            <StatTile label="Unresolved Alerts" value={data.alerts.unresolved} />
          </View>

          <Text style={typography.subtitle}>Performance</Text>
          <View style={styles.grid}>
            <StatTile label="Fleet Utilization" value={`${round1(data.fleetUtilizationPercent)}%`} />
            <StatTile label="Avg Fuel Efficiency" value={round1(data.averageFuelEfficiencyKmPerLiter)} caption="km/L" />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
});
