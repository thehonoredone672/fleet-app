import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as fleetService from '../../services/fleetService';
import * as geofenceService from '../../services/geofenceService';
import { connectSocket, disconnectSocket } from '../../services/socketService';
import useAuthStore from '../../store/authStore';
import VehicleDetailCard from '../../components/VehicleDetailCard';
import EmptyState from '../../components/EmptyState';
import { MAP_FILTERS, deriveMapStatus, matchesFilter } from '../../utils/vehicleMapStatus';
import { timeAgo } from '../../utils/timeAgo';
import { grayscaleMapStyle } from '../../constants/mapStyle';
import { colors, spacing, typography, borderWidth } from '../../constants/theme';

const DEFAULT_REGION = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 20, longitudeDelta: 20 };
const FILTER_LABELS = { ALL: 'All', MOVING: 'Moving', IDLE: 'Idle', MAINTENANCE: 'Maintenance' };

export default function LiveMapScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [showZones, setShowZones] = useState(true);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({ queryKey: ['fleet-live'], queryFn: fleetService.getLiveFleet, refetchInterval: 30000 });

  // Zones change rarely (a manager sets one up once), unlike vehicle
  // positions — a long staleTime avoids refetching on every screen focus.
  const { data: geofences = [] } = useQuery({
    queryKey: ['geofences'],
    queryFn: geofenceService.getGeofences,
    staleTime: 5 * 60 * 1000,
  });

  // Cold-load snapshot from the query seeds local state; from then on,
  // live updates from the socket patch individual vehicles in place so a
  // 30s snapshot refetch never overwrites more-recent socket data.
  useEffect(() => {
    if (data) {
      setVehicles(data);
      setLastSyncAt(new Date());
    }
  }, [data]);

  useEffect(() => {
    if (!accessToken) return undefined;

    const socket = connectSocket(accessToken);
    const onLocation = (point) => {
      setVehicles((prev) => prev.map((v) => (v.id === point.vehicleId ? { ...v, location: point } : v)));
      setLastSyncAt(new Date());
    };

    socket.on('vehicle:location', onLocation);
    return () => {
      socket.off('vehicle:location', onLocation);
      disconnectSocket();
    };
  }, [accessToken]);

  const filteredVehicles = useMemo(() => vehicles.filter((v) => matchesFilter(v, filter)), [vehicles, filter]);
  const selectedVehicle = filteredVehicles.find((v) => v.id === selectedId) || null;
  const withLocationCount = filteredVehicles.filter((v) => v.location).length;

  const initialRegion = useMemo(() => {
    const withLocation = vehicles.find((v) => v.location);
    if (!withLocation) return DEFAULT_REGION;
    return {
      latitude: withLocation.location.latitude,
      longitude: withLocation.location.longitude,
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    };
  }, [vehicles]);

  const handleMarkerPress = useCallback((vehicleId) => setSelectedId(vehicleId), []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.ink} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.centered}>
        <EmptyState
          title="Couldn't load the fleet map"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={refetch}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={initialRegion} customMapStyle={grayscaleMapStyle}>
        {showZones &&
          geofences.map((zone) => (
            <Circle
              key={zone.id}
              center={{ latitude: zone.latitude, longitude: zone.longitude }}
              radius={zone.radiusMeters}
              strokeColor={colors.ink}
              strokeWidth={1}
              fillColor="rgba(0,0,0,0.06)"
            />
          ))}
        {showZones &&
          geofences.map((zone) => (
            <Marker
              key={`${zone.id}-label`}
              coordinate={{ latitude: zone.latitude, longitude: zone.longitude }}
              title={zone.name}
              description={`${zone.radiusMeters}m radius`}
              anchor={{ x: 0.5, y: 0.5 }}
              accessibilityLabel={`Zone: ${zone.name}`}
            >
              <View style={styles.zoneMarker} />
            </Marker>
          ))}
        {filteredVehicles
          .filter((v) => v.location)
          .map((v) => {
            const status = deriveMapStatus(v);
            return (
              <Marker
                key={v.id}
                coordinate={{ latitude: v.location.latitude, longitude: v.location.longitude }}
                title={v.registrationNumber}
                description={status.label}
                pinColor={colors.ink}
                onPress={() => handleMarkerPress(v.id)}
                accessibilityLabel={`${v.registrationNumber}, ${status.label}`}
              />
            );
          })}
      </MapView>

      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={typography.title}>Live Map</Text>
            <Text style={styles.headerMeta}>
              {withLocationCount} of {filteredVehicles.length} tracked
              {lastSyncAt ? ` · synced ${timeAgo(lastSyncAt)}` : ''}
            </Text>
          </View>
          {isRefetching ? <ActivityIndicator color={colors.ink} /> : null}
        </View>

        <View style={styles.filterBar}>
          {MAP_FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f }}
              accessibilityLabel={`Filter: ${FILTER_LABELS[f]}`}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{FILTER_LABELS[f]}</Text>
            </Pressable>
          ))}
          <View style={styles.filterDivider} />
          <Pressable
            onPress={() => setShowZones((v) => !v)}
            style={[styles.filterChip, showZones && styles.filterChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: showZones }}
            accessibilityLabel={`${showZones ? 'Hide' : 'Show'} zones`}
          >
            <Text style={[styles.filterText, showZones && styles.filterTextActive]}>Zones</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {vehicles.length === 0 ? (
        <View style={styles.emptyOverlay}>
          <EmptyState title="No vehicles yet" message="Vehicles will appear here once added to your fleet." />
        </View>
      ) : null}

      {selectedVehicle ? (
        <View style={styles.bottomOverlay}>
          <VehicleDetailCard vehicle={selectedVehicle} onClose={() => setSelectedId(null)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.background },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: colors.ink,
  },
  headerMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  filterBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thin,
    borderColor: colors.ink,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: colors.ink,
  },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.ink, textTransform: 'uppercase', letterSpacing: 0.4 },
  filterTextActive: { color: colors.inverse },
  filterDivider: {
    width: borderWidth.thin,
    backgroundColor: colors.ink,
    opacity: 0.2,
    marginHorizontal: spacing.xs,
  },
  zoneMarker: {
    width: 10,
    height: 10,
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thick,
    borderColor: colors.ink,
  },
  emptyOverlay: {
    position: 'absolute',
    top: '40%',
    left: spacing.lg,
    right: spacing.lg,
  },
  bottomOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
  },
});
