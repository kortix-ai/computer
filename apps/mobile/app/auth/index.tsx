/**
 * Auth Screen — matches the Computer frontend's self-hosted auth.
 *
 * Simple email + password form. No OAuth, no magic links, no billing checks.
 * For self-hosted local sandbox instances.
 */

import * as React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/hooks/useAuth';
import { useAuthContext } from '@/contexts';
import { log } from '@/lib/logger';
import { supabase } from '@/api/supabase';

export default function AuthScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuthContext();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const passwordRef = React.useRef<TextInput>(null);

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/home');
    }
  }, [isAuthenticated, router]);

  const handleSignIn = React.useCallback(async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      log.log('🔐 Signing in with email/password...');

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (error) {
        log.error('❌ Sign in error:', error.message);

        // If user doesn't exist, try to create account (self-hosted first-time setup)
        if (
          error.message.includes('Invalid login credentials') ||
          error.message.includes('Email not confirmed')
        ) {
          log.log('🔄 Trying to create account (self-hosted first-time setup)...');

          const { data: signUpData, error: signUpError } =
            await supabase.auth.signUp({
              email: trimmedEmail,
              password: trimmedPassword,
              options: {
                data: { full_name: trimmedEmail.split('@')[0] },
              },
            });

          if (signUpError) {
            log.error('❌ Sign up error:', signUpError.message);
            setErrorMessage(signUpError.message);
            setLoading(false);
            return;
          }

          // If sign up succeeded but needs confirmation
          if (signUpData.user && !signUpData.session) {
            // In local Supabase, email confirmation is typically disabled
            // Try signing in again
            const { data: retryData, error: retryError } =
              await supabase.auth.signInWithPassword({
                email: trimmedEmail,
                password: trimmedPassword,
              });

            if (retryError) {
              setErrorMessage(
                'Account created but email confirmation may be required. Check your Supabase settings.',
              );
              setLoading(false);
              return;
            }

            if (retryData.session) {
              log.log('✅ Account created and signed in');
              router.replace('/home');
              return;
            }
          }

          if (signUpData.session) {
            log.log('✅ Account created and signed in');
            router.replace('/home');
            return;
          }

          setErrorMessage('Account created. Please sign in.');
          setLoading(false);
          return;
        }

        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        log.log('✅ Signed in successfully');
        router.replace('/home');
      }
    } catch (err: any) {
      log.error('❌ Auth exception:', err);
      setErrorMessage(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          {/* Card */}
          <View
            className="w-full max-w-sm rounded-2xl px-6 py-8 bg-card border border-border"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.3 : 0.08,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            {/* Header */}
            <View className="items-center mb-8">
              <Text className="text-xl font-semibold mb-1 text-foreground">
                Sign in to Kortix
              </Text>
              <Text className="text-sm text-muted-foreground">
                Your AI Computer
              </Text>
            </View>

            {/* Email input */}
            <View className="mb-3">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor={isDark ? '#999999' : '#6e6e6e'}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!loading}
                className="rounded-xl px-4 py-3.5 text-base bg-muted text-foreground"
              />
            </View>

            {/* Password input */}
            <View className="mb-5">
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={isDark ? '#999999' : '#6e6e6e'}
                secureTextEntry
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={handleSignIn}
                editable={!loading}
                className="rounded-xl px-4 py-3.5 text-base bg-muted text-foreground"
              />
            </View>

            {/* Error message */}
            {errorMessage && (
              <View className="mb-4 rounded-lg bg-destructive/10 px-3 py-2">
                <Text className="text-sm text-destructive text-center">
                  {errorMessage}
                </Text>
              </View>
            )}

            {/* Sign in button */}
            <TouchableOpacity
              onPress={handleSignIn}
              disabled={loading}
              className={`rounded-xl py-3.5 items-center bg-primary ${
                loading ? 'opacity-70' : ''
              }`}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color={isDark ? '#121215' : '#F8F8F8'}
                />
              ) : (
                <Text className="text-base font-semibold text-primary-foreground">
                  Sign in
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
