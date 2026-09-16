import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../store/authStore';
import PrimaryButton from '../../components/PrimaryButton';
import StatusBadge from '../../components/StatusBadge';
import ScreenHeader from '../../components/ScreenHeader';
import { colors, spacing, typography, borderWidth } from '../../constants/theme';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Profile" />

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={typography.label}>Name</Text>
          <Text style={[typography.subtitle, styles.fieldValue]}>{user?.name}</Text>

          <View style={styles.divider} />

          <Text style={typography.label}>Email</Text>
          <Text style={[typography.body, styles.fieldValue]}>{user?.email}</Text>

          {user?.phone ? (
            <>
              <View style={styles.divider} />
              <Text style={typography.label}>Phone</Text>
              <Text style={[typography.body, styles.fieldValue]}>{user.phone}</Text>
            </>
          ) : null}

          <View style={styles.divider} />

          <Text style={typography.label}>Role</Text>
          <View style={styles.roleRow}>
            <StatusBadge label={user?.role} emphasis={user?.isActive} />
          </View>
        </View>

        <PrimaryButton title="Log Out" variant="secondary" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth.thick,
    borderColor: colors.ink,
    padding: spacing.md,
  },
  fieldValue: { marginTop: 2 },
  divider: {
    height: borderWidth.thin,
    backgroundColor: colors.ink,
    opacity: 0.15,
    marginVertical: spacing.sm,
  },
  roleRow: { marginTop: spacing.xs, alignItems: 'flex-start' },
});
