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

type Screen = 'loading' | 'login' | 'signup' | 'home';

const BRAND_MIST = '#f1f5f9';
const BRAND_INK = '#334155';
const ZINC_200 = '#e4e4e7';
const ZINC_600 = '#52525b';
const ZINC_900 = '#18181b';

export default function RootApp() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [me, setMe] = useState<{ email: string; name: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
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

  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle='dark-content' />
        <ScrollView contentContainerStyle={styles.containerCenter}>
          <View style={styles.card}>
            <Image source={{ uri: 'https://purely-internal-i5d62brbc-tabari-ropers-projects-6f2e090b.vercel.app/brand/1.png' }} style={styles.logo} />
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>{me?.email}</Text>
            <Pressable style={styles.primaryButton} onPress={async () => {
              setBusy(true);
              await portalLogout().catch(() => {});
              await refreshMe();
              setBusy(false);
            }}>
              <Text style={styles.primaryButtonText}>{busy ? 'Logging out...' : 'Log out'}</Text>
            </Pressable>
          </View>
        </ScrollView>
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
              <Image source={{ uri: 'https://purely-internal-i5d62brbc-tabari-ropers-projects-6f2e090b.vercel.app/brand/1.png' }} style={styles.logo} />
            </View>

            <Text style={styles.title}>
              {screen === 'login' ? 'Client Portal Login' : 'Create your account'}
            </Text>
            <Text style={styles.subtitle}>
              {screen === 'login' ? 'Sign in to your client portal.' : 'Set up your portal in a few quick steps.'}
            </Text>

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
                <Text style={styles.footerText}>
                  Need an account? <Text style={styles.linkText} onPress={() => { setError(null); setScreen('signup'); }}>Get started</Text>
                </Text>
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

function SignupForm({ busy, onSubmit }: { busy: boolean; onSubmit: (f: any) => void; }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [phone, setPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [hasWebsite, setHasWebsite] = useState<'YES' | 'NO' | 'NOT_SURE'>('YES');
  const [callsPerMonthRange, setCallsPerMonthRange] = useState<'NOT_SURE' | '0_10' | '11_30' | '31_60' | '61_120' | '120_PLUS'>('NOT_SURE');
  const [acquisitionMethodsText, setAcquisitionMethodsText] = useState('');
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [targetCustomer, setTargetCustomer] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [industry, setIndustry] = useState('');
  const [businessModel, setBusinessModel] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [couponCode, setCouponCode] = useState('');

  const goals = [
    { id: 'appointments', label: 'Book more appointments' },
    { id: 'reviews', label: 'Get more reviews' },
    { id: 'leads', label: 'Get more leads' },
    { id: 'followup', label: 'Spend less time on follow-up' },
    { id: 'content', label: 'Publish content regularly (SEO)' },
    { id: 'inbox', label: 'Keep email + SMS in one inbox' },
    { id: 'receptionist', label: 'Answer common questions 24/7' },
    { id: 'outbound', label: 'Do more outbound calling' },
    { id: 'unsure', label: 'Not sure yet' },
  ];

  function toggleGoal(id: string) {
    setGoalIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return Array.from(s);
    });
  }

  const acquisitionMethods = acquisitionMethodsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const canNextFromBusiness = businessName.trim().length >= 2 && city.trim().length >= 2 && state.trim().length >= 2;
  const canSubmit = name && email && password.length >= 8 && businessName && city && state;

  return (
    <View style={styles.form}>
      {step === 0 && (
        <>
          <Text style={styles.stepTitle}>Business details</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Business name</Text>
            <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} editable={!busy} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Phone (optional)</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} editable={!busy} keyboardType='phone-pad' />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>City</Text>
            <TextInput style={styles.input} value={city} onChangeText={setCity} editable={!busy} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>State</Text>
            <TextInput style={styles.input} value={state} onChangeText={setState} editable={!busy} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Website URL (optional)</Text>
            <TextInput style={styles.input} value={websiteUrl} onChangeText={setWebsiteUrl} editable={!busy} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Do you have a website?</Text>
                      <View style={styles.field}>
                        <Text style={styles.label}>Industry (optional)</Text>
                        <TextInput style={styles.input} value={industry} onChangeText={setIndustry} editable={!busy} />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>Business model (optional)</Text>
                        <TextInput style={styles.input} value={businessModel} onChangeText={setBusinessModel} editable={!busy} />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>Referral code (optional)</Text>
                        <TextInput style={styles.input} value={referralCode} onChangeText={setReferralCode} editable={!busy} />
                      </View>
            <View style={styles.chipRow}>
              {['YES', 'NO', 'NOT_SURE'].map((v) => (
                <Pressable
                  key={v}
                  style={[styles.chip, hasWebsite === v ? styles.chipSelected : null]}
                  onPress={() => setHasWebsite(v as any)}
                >
                  <Text style={hasWebsite === v ? styles.chipTextSelected : styles.chipText}>{v}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>How many calls per month?</Text>
            <View style={styles.chipRow}>
              {[
                'NOT_SURE',
                '0_10',
                '11_30',
                '31_60',
                '61_120',
                '120_PLUS',
              ].map((v) => (
                <Pressable
                  key={v}
                  style={[styles.chip, callsPerMonthRange === v ? styles.chipSelected : null]}
                  onPress={() => setCallsPerMonthRange(v as any)}
                >
                  <Text style={callsPerMonthRange === v ? styles.chipTextSelected : styles.chipText}>{v.replace('_', '-')}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>How do you get clients today? (comma separated)</Text>
            <TextInput
              style={styles.input}
              value={acquisitionMethodsText}
              onChangeText={setAcquisitionMethodsText}
              editable={!busy}
              placeholder='Referrals, Google, Facebook'
            />
          </View>
          <Pressable
            style={[styles.primaryButton, (!canNextFromBusiness || busy) ? styles.buttonDisabled : null]}
            onPress={() => canNextFromBusiness && !busy && setStep(1)}
            disabled={!canNextFromBusiness || busy}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </>
      )}

      {step === 1 && (
        <>
          <Text style={styles.stepTitle}>What are your goals?</Text>
          <View style={styles.chipRowWrap}>
            {goals.map((g) => (
              <Pressable
                key={g.id}
                style={[styles.chip, goalIds.includes(g.id) ? styles.chipSelected : null]}
                onPress={() => toggleGoal(g.id)}
              >
                <Text style={goalIds.includes(g.id) ? styles.chipTextSelected : styles.chipText}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.stepButtonsRow}>
            <Pressable style={[styles.secondaryButton]} onPress={() => setStep(0)}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton]} onPress={() => setStep(2)}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <Text style={styles.stepTitle}>Create your account</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} editable={!busy} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize='none'
              keyboardType='email-address'
              editable={!busy}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize='none'
              editable={!busy}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Who is your ideal customer? (optional)</Text>
            <TextInput
              style={styles.input}
              value={targetCustomer}
              onChangeText={setTargetCustomer}
              editable={!busy}
              placeholder='e.g., local service businesses in Austin'
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Describe your brand voice (optional)</Text>
            <TextInput
              style={styles.input}
              value={brandVoice}
              onChangeText={setBrandVoice}
              editable={!busy}
              placeholder='Friendly, professional, casual, etc.'
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Coupon code (optional)</Text>
            <TextInput
              style={styles.input}
              value={couponCode}
              onChangeText={setCouponCode}
              editable={!busy}
              autoCapitalize='characters'
            />
          </View>
          <View style={styles.stepButtonsRow}>
            <Pressable style={[styles.secondaryButton]} onPress={() => setStep(1)}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (busy || !canSubmit) ? styles.buttonDisabled : null]}
              onPress={() => {
                if (!canSubmit || busy) return;
                onSubmit({
                  name,
                  email,
                  password,
                  businessName,
                  city,
                  state,
                  phone,
                  websiteUrl,
                  hasWebsite,
                  callsPerMonthRange,
                  acquisitionMethods,
                  goalIds,
                  targetCustomer,
                  brandVoice,
                  industry,
                  businessModel,
                  referralCode,
                  couponCode,
                  billingPreference: 'credits',
                  selectedPlanIds: ['core'],
                });
              }}
              disabled={busy || !canSubmit}
            >
              <Text style={styles.primaryButtonText}>{busy ? 'Creating account...' : 'Create account'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
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
  logo: { height: 64, width: '100%', resizeMode: 'contain' },
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
  stepTitle: { fontSize: 18, fontWeight: '600', color: ZINC_900, marginBottom: 12 },
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
