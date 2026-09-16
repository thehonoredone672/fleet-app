import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';

// Register/forgot-password/reset-password screens are deferred — the
// backend fully supports them (Phase 3), but this pass only builds the
// mobile screens a phase actually needs; they're added whenever we next
// touch the auth area.
const Stack = createNativeStackNavigator();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}
