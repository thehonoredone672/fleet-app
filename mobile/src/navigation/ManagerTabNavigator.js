import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import LiveMapScreen from '../screens/tracking/LiveMapScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import { colors, borderWidth } from '../constants/theme';

// Only tabs that are actually functional today. The full manager
// navigation (Fleet, Drivers, Trips, Maintenance, Fuel, Expenses,
// Alerts, Settings — see docs/architecture.md) is built out
// incrementally as each area's mobile screens are added, rather than
// stubbing placeholder tabs that do nothing.
const Tab = createBottomTabNavigator();

const ICONS = { Dashboard: 'stats-chart', LiveMap: 'map', Profile: 'person-circle' };

export default function ManagerTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.ink, borderTopWidth: borderWidth.thin },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="LiveMap" component={LiveMapScreen} options={{ title: 'Live Map' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
