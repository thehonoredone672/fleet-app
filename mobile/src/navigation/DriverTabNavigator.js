import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import DriverHomeScreen from '../screens/driver/DriverHomeScreen';
import RecordFuelScreen from '../screens/driver/RecordFuelScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import { colors, borderWidth } from '../constants/theme';

// Trips/Vehicle-detail/Notifications/Report-Issue (§8/§29) are added as
// we next revisit those areas — Report Issue specifically has no
// backend API yet (IssueReport was never given its own phase). Home,
// Fuel, and Profile are real and fully working today, including offline
// queuing for trip start/end and fuel submission (§19).
const Tab = createBottomTabNavigator();

const ICONS = { Home: 'home', Fuel: 'water', Profile: 'person-circle' };

export default function DriverTabNavigator() {
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
      <Tab.Screen name="Home" component={DriverHomeScreen} />
      <Tab.Screen name="Fuel" component={RecordFuelScreen} options={{ title: 'Add Fuel' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
