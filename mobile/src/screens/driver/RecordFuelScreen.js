import { useState } from 'react';
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as vehicleService from '../../services/vehicleService';
import * as fuelService from '../../services/fuelService';
import ScreenHeader from '../../components/ScreenHeader';
import PrimaryButton from '../../components/PrimaryButton';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography, borderWidth } from '../../constants/theme';

const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'];

export default function RecordFuelScreen() {
  const queryClient = useQueryClient();
  const { data: vehicle, isLoading } = useQuery({ queryKey: ['my-vehicle'], queryFn: vehicleService.getMyVehicle, retry: false });

  const [fuelType, setFuelType] = useState('DIESEL');
  const [quantity, setQuantity] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [odometer, setOdometer] = useState('');
  const [station, setStation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async () => {
    if (!quantity || !pricePerLiter || !odometer) {
      setSaved(false);
      setError('Quantity, price per liter, and odometer are required.');
      return;
    }
    setError(null);
    setSaved(false);
    setSubmitting(true);

    try {
      await fuelService.submitFuelRecord({
        vehicleId: vehicle.id,
        fuelType,
        quantity: Number(quantity),
        pricePerLiter: Number(pricePerLiter),
        odometer: Number(odometer),
        station: station || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['fuel-mine'] });
      setQuantity('');
      setPricePerLiter('');
      setOdometer('');
      setStation('');
      setSaved(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return null;

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Add Fuel" />
        <View style={styles.centered}>
          <EmptyState title="No vehicle assigned" message="You need an assigned vehicle to record fuel." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Add Fuel" meta={vehicle.registrationNumber} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {saved ? (
            <View style={styles.successBox} accessibilityRole="alert">
              <Text style={styles.successText}>Saved. It will sync automatically if you are offline.</Text>
            </View>
          ) : null}

          <Text style={typography.label}>Fuel Type</Text>
          <View style={styles.chipRow}>
            {FUEL_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setFuelType(t)}
                style={[styles.chip, fuelType === t && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: fuelType === t }}
              >
                <Text style={[styles.chipText, fuelType === t && styles.chipTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          <Field label="Quantity (L)" value={quantity} onChangeText={setQuantity} />
          <Field label="Price per Liter" value={pricePerLiter} onChangeText={setPricePerLiter} />
          <Field label="Odometer" value={odometer} onChangeText={setOdometer} />
          <Field label="Station (optional)" value={station} onChangeText={setStation} keyboardType="default" />

          <PrimaryButton title="Save" onPress={handleSubmit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, keyboardType = 'decimal-pad' }) {
  return (
    <View style={styles.field}>
      <Text style={typography.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md },
  field: { gap: spacing.xs },
  input: {
    minHeight: 50,
    borderWidth: borderWidth.thick,
    borderColor: colors.ink,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.ink,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: borderWidth.thin,
    borderColor: colors.ink,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  chipTextActive: { color: colors.inverse },
  errorBox: { borderWidth: borderWidth.thick, borderColor: colors.ink, padding: spacing.sm },
  errorText: { color: colors.ink, fontWeight: '700' },
  successBox: { backgroundColor: colors.ink, padding: spacing.sm },
  successText: { color: colors.inverse, fontWeight: '700' },
});
