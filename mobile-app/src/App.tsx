import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';

import { portalLogin, portalLogout } from './api/portalAuth';
import { portalMe } from './api/portalMe';
import { portalSignup } from './api/portalSignup';
import type { PortalSignupInput } from './api/portalSignup';
import { portalOnboardingCheckout, portalOnboardingConfirm } from './api/portalOnboardingBilling';
import { portalLogoUrl } from './config/app';
import { PortalAppShell } from './features/portal/PortalAppShell';
import { registerPushToken } from './features/portal/api';
import { GetStartedWizard } from './features/getStarted/GetStartedWizard';

import * as WebBrowser from 'expo-web-browser';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

type Screen = 'loading' | 'login' | 'signup' | 'home';

const BRAND_MIST = '#f1f5f9';
const BRAND_INK = '#334155';
const ZINC_200 = '#e4e4e7';
const ZINC_600 = '#52525b';
const ZINC_900 = '#18181b';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId ||
    (Constants as any)?.expoConfig?.extra?.projectId;

  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

export default function RootApp() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [me, setMe] = useState<{ email: string; name: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalDeepLinkPath, setPortalDeepLinkPath] = useState<string | null>(null);
  const [pushRegisteredForUser, setPushRegisteredForUser] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Web-only: Stripe returns to /portal/get-started/complete with a session_id.
      // Confirm it here so the app stays "app-like" (no portal-page proxying).
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const url = new URL(window.location.href);
          if (url.pathname.startsWith('/portal/get-started/complete')) {
            const sessionId = url.searchParams.get('session_id') || '';
            if (sessionId) {
              await portalOnboardingConfirm({ sessionId });
            }

            // Avoid re-running on reload.
            window.history.replaceState(null, '', '/');
          } else if (url.pathname.startsWith('/portal/get-started') && url.searchParams.get('checkout') === 'cancel') {
            setError('Checkout canceled. You can try again.');
            window.history.replaceState(null, '', '/');
          }
        } catch {
          // ignore
        }
      }

      const user = await portalMe().catch(() => null);
      if (!mounted) return;
      setMe(user);
      setScreen(user ? 'home' : 'login');
    })();
    return () => { mounted = false; };
  }, []);

  async function refreshMe() {
    const user = await portalMe().catch(() => null);
    setMe(user);
    setScreen(user ? 'home' : 'login');
  }

  useEffect(() => {
    if (!me?.email) return;
    if (pushRegisteredForUser === me.email) return;

    let cancelled = false;
    (async () => {
      const expoPushToken = await registerForPushNotificationsAsync().catch(() => null);
      if (!expoPushToken || cancelled) return;
      await registerPushToken({
        expoPushToken,
        platform: Platform.OS,
        deviceName: (Device as any)?.deviceName || null,
      }).catch(() => null);
      if (!cancelled) setPushRegisteredForUser(me.email);
    })();

    return () => {
      cancelled = true;
    };
  }, [me?.email, pushRegisteredForUser]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let mounted = true;

    (async () => {
      const last = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      if (!mounted || !last) return;
      const data: any = last.notification.request.content.data;
      const path = typeof data?.path === 'string' ? data.path : null;
      setPortalDeepLinkPath(path || '/portal/app/inbox');
    })();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data;
      const path = typeof data?.path === 'string' ? data.path : null;
      setPortalDeepLinkPath(path || '/portal/app/inbox');
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle='dark-content' />
        <PortalAppShell
          me={me}
          deepLinkPath={portalDeepLinkPath}
          onDeepLinkHandled={() => setPortalDeepLinkPath(null)}
          onLogout={async () => {
            setBusy(true);
            await portalLogout().catch(() => {});
            await refreshMe();
            setBusy(false);
          }}
        />
      </SafeAreaView>
    );
  }

  if (screen === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size='large' color={BRAND_INK} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle='dark-content' />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.containerCenter} keyboardShouldPersistTaps='handled'>
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <Image
                source={{ uri: portalLogoUrl }}
                style={styles.logo}
              />
            </View>

            {screen === 'login' ? (
              <>
                <Text style={styles.title}>Client Portal Login</Text>
                <Text style={styles.subtitle}>Sign in to your client portal.</Text>
              </>
            ) : (
              <Text style={styles.subtitle}>Set up your portal in a few quick steps.</Text>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {screen === 'login' ? (
              <LoginForm
                busy={busy}
                onSubmit={async (email, password) => {
                  setError(null);
                  setBusy(true);
                  try {
                    await portalLogin(email, password);
                    await refreshMe();
                  } catch (err: any) {
                    setError(err.message || 'Incorrect username or incorrect password');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : (
              <SignupForm
                busy={busy}
                onSubmit={async (form) => {
                  setError(null);
                  setBusy(true);
                  try {
                    await portalSignup(form);

                    if (form.billingPreference === 'subscription') {
                      const planIds = form.selectedPlanIds && form.selectedPlanIds.length ? form.selectedPlanIds : ['core'];
                      const checkout = await portalOnboardingCheckout({
                        planIds,
                        planQuantities: form.selectedPlanQuantities,
                        couponCode: form.couponCode,
                      });

                      if (checkout && (checkout as any).ok === true && (checkout as any).bypass) {
                        await portalOnboardingConfirm({ bypass: true });
                        await refreshMe();
                        return;
                      }

                      const url = checkout && (checkout as any).ok === true ? String((checkout as any).url || '') : '';
                      const sessionId = checkout && (checkout as any).ok === true ? String((checkout as any).sessionId || '') : '';
                      if (!url) {
                        throw new Error((checkout as any)?.error || 'Unable to start checkout');
                      }

                      if (typeof window !== 'undefined') {
                        window.location.href = url;
                        return;
                      }

                      // Native: open in an in-app browser (SafariViewController / Chrome Custom Tab)
                      // and then confirm payment using the Stripe session id.
                      await WebBrowser.openBrowserAsync(url);
                      if (!sessionId) {
                        throw new Error('Missing Stripe session id');
                      }
                      try {
                        await portalOnboardingConfirm({ sessionId });
                      } catch {
                        throw new Error(
                          'Checkout may not be complete yet. If you finished payment, open the portal Billing page to finish activation.',
                        );
                      }
                      await refreshMe();
                      return;
                    }

                    await refreshMe();
                  } catch (err: any) {
                    setError(err.message || 'Unable to create account.');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}

            <View style={styles.footerContainer}>
              {screen === 'login' ? (
                <>
                  <Text style={styles.footerText}>
                    Need an account?{' '}
                    <Text
                      style={styles.linkText}
                      onPress={() => {
                        setError(null);
                        setScreen('signup');
                      }}
                    >
                      Get started
                    </Text>
                  </Text>
                  <Text style={[styles.footerText, { marginTop: 8 }]}>
                    Employee?{' '}
                    <Text
                      style={styles.linkText}
                      onPress={() => {
                        if (typeof window === 'undefined') return;
                        window.open('https://purelyautomation.com/employee-login', '_blank', 'noopener,noreferrer');
                      }}
                    >
                      Log in as an employee
                    </Text>
                  </Text>
                </>
              ) : (
                <Text style={styles.footerText}>
                  Already have an account? <Text style={styles.linkText} onPress={() => { setError(null); setScreen('login'); }}>Sign in</Text>
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoginForm({ busy, onSubmit }: { busy: boolean; onSubmit: (e: string, p: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize='none' keyboardType='email-address' editable={!busy} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize='none' editable={!busy} />
      </View>
      <Pressable style={[styles.primaryButton, busy || !email || !password ? styles.buttonDisabled : null]} onPress={() => onSubmit(email, password)} disabled={busy || !email || !password}>
        <Text style={styles.primaryButtonText}>{busy ? 'Signing in...' : 'Sign in'}</Text>
      </Pressable>
    </View>
  );
}

function SignupForm({ busy, onSubmit }: { busy: boolean; onSubmit: (f: PortalSignupInput) => void }) {
  return <GetStartedWizard busy={busy} onSubmit={onSubmit} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: BRAND_MIST },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BRAND_MIST },
  containerCenter: { flexGrow: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 512,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ZINC_200,
    padding: 32,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  logoContainer: { alignItems: 'center', marginBottom: 24 },
  logo: { height: 80, width: 260, resizeMode: 'contain' },
  title: { fontSize: 20, fontWeight: '600', color: ZINC_900, marginTop: 24 },
  subtitle: { fontSize: 16, color: ZINC_600, marginTop: 8 },
  errorBox: { marginTop: 16, borderRadius: 8, backgroundColor: '#fef2f2', padding: 12, borderWidth: 1, borderColor: '#fecaca' },
  errorText: { color: '#991b1b', fontSize: 14 },
  form: { marginTop: 24, gap: 20 },
  field: { marginBottom: 0 },
  label: { fontSize: 16, fontWeight: '500', color: ZINC_900, marginBottom: 8 },
  input: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: ZINC_900,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  primaryButton: {
    width: '100%',
    backgroundColor: BRAND_INK,
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  buttonDisabled: { opacity: 0.6 },

  // Portal-like stepper pills
  stepperPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  stepperPill: {
    flexGrow: 1,
    flexBasis: '48%',
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  stepperPillActive: { backgroundColor: BRAND_INK, borderColor: BRAND_INK },
  stepperPillComplete: { backgroundColor: '#fafafa', borderColor: ZINC_200 },
  stepperPillFuture: { backgroundColor: '#ffffff', borderColor: ZINC_200 },
  stepperPillTextActive: { fontSize: 12, fontWeight: '600', color: '#ffffff' },
  stepperPillTextComplete: { fontSize: 12, fontWeight: '600', color: '#3f3f46' },
  stepperPillTextFuture: { fontSize: 12, fontWeight: '600', color: '#a1a1aa' },

  // Portal-like nested panels per step
  stepPanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: '#ffffff',
    padding: 16,
  },
  panelTitle: { fontSize: 14, fontWeight: '600', color: ZINC_900 },
  panelSubtitle: { fontSize: 14, color: ZINC_600, marginTop: 4, marginBottom: 16 },
  twoColRow: { flexDirection: 'row', gap: 12 },
  twoColItem: { flex: 1 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 4,
    marginBottom: 4,
    backgroundColor: '#ffffff',
  },
  chipSelected: {
    backgroundColor: BRAND_INK,
    borderColor: BRAND_INK,
  },
  chipText: { color: ZINC_600, fontSize: 14 },
  chipTextSelected: { color: '#ffffff', fontSize: 14 },
  stepButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, gap: 12 },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '500', color: ZINC_900 },
  footerContainer: { marginTop: 24 },
  footerText: { fontSize: 16, color: ZINC_600 },
  linkText: { fontWeight: '500', color: BRAND_INK },
});
