import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../store/authStore';
import PrimaryButton from '../../components/PrimaryButton';
import { colors, spacing, typography, borderWidth } from '../../constants/theme';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // No manual navigation call needed — RootNavigator re-renders into
      // the authenticated stack the moment the store's `user` is set.
    } catch (err) {
      const message = err.response?.data?.message || 'Unable to sign in. Check your connection and try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.brand}>
            <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={typography.title}>Fleet Management</Text>
            <Text style={[typography.body, styles.subtitle]}>Sign in to continue</Text>
          </View>

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={typography.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@company.com"
              placeholderTextColor={colors.inkFaint}
              editable={!submitting}
              accessibilityLabel="Email"
            />
          </View>

          <View style={styles.field}>
            <Text style={typography.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor={colors.inkFaint}
              editable={!submitting}
              onSubmitEditing={handleSubmit}
              accessibilityLabel="Password"
            />
          </View>

          <PrimaryButton title="Sign In" onPress={handleSubmit} loading={submitting} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  brand: { alignItems: 'flex-start', marginBottom: spacing.sm, gap: 2 },
  mark: { width: 28, height: 28, backgroundColor: colors.ink, marginBottom: spacing.sm },
  subtitle: { color: colors.inkMuted },
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
  errorBox: {
    borderWidth: borderWidth.thick,
    borderColor: colors.ink,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
});
