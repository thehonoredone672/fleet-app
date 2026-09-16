import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import useAuthStore from '../store/authStore';
import AuthStack from './AuthStack';
import ManagerTabNavigator from './ManagerTabNavigator';
import DriverTabNavigator from './DriverTabNavigator';
import { colors } from '../constants/theme';

const MANAGER_ROLES = ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_MANAGER', 'VIEWER'];

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    restoreSession();
    // Runs once at app launch — restoreSession itself is stable (defined
    // once by the store), so this intentionally has no dependency on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isRestoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  if (!user) return <AuthStack />;

  return MANAGER_ROLES.includes(user.role) ? <ManagerTabNavigator /> : <DriverTabNavigator />;
}
