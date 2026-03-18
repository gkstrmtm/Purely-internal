import React, { useEffect, useMemo, useState } from "react";
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
} from "react-native";

import { AppConfig } from "./config/app";
import { portalLogin, portalLogout } from "./api/portalAuth";
import { portalMe } from "./api/portalMe";
import { portalSignup } from "./api/portalSignup";
import { theme } from "./ui/theme";

type Screen = "loading" | "login" | "signup" | "home";

export default function RootApp() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [me, setMe] = useState<{ email: string; name: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const user = await portalMe();
      if (!mounted) return;
      setMe(user);
      setScreen(user ? "home" : "login");
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshMe() {
    const user = await portalMe();
    setMe(user);
    setScreen(user ? "home" : "login");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      {screen === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Checking session…</Text>
        </View>
      ) : screen === "home" ? (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="Portal" subtitle={me?.email ? `Signed in as ${me.email}` : "Signed in"} />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Continuity check</Text>
            <Text style={styles.cardBody}>This session is coming from the same backend/database as the desktop portal.</Text>
            <Text style={styles.cardBody}>Cookie-based auth is proxied through this mobile deployment.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>
            <Text style={styles.cardBody}>Email: {me?.email || "(unknown)"}</Text>
            <Text style={styles.cardBody}>Name: {me?.name || "(not set)"}</Text>
            <Text style={styles.cardBody}>Role: {me?.role || "(unknown)"}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Portal areas (next to implement)</Text>
            <Text style={styles.cardBody}>• Dashboard</Text>
            <Text style={styles.cardBody}>• Inbox</Text>
            <Text style={styles.cardBody}>• People</Text>
            <Text style={styles.cardBody}>• Booking</Text>
            <Text style={styles.cardBody}>• Funnel Builder</Text>
            <Text style={styles.cardBody}>• Automations</Text>
            <Text style={styles.cardBody}>• Billing</Text>
          </View>

          <View style={styles.row}>
            <PrimaryButton
              label={busy ? "Working…" : "Refresh"}
              disabled={busy}
              onPress={async () => {
                setError(null);
                setBusy(true);
                try {
                  await refreshMe();
                } finally {
                  setBusy(false);
                }
              }}
            />
            <SecondaryButton
              label={busy ? "Working…" : "Log out"}
              disabled={busy}
              onPress={async () => {
                setError(null);
                setBusy(true);
                try {
                  await portalLogout();
                } finally {
                  setBusy(false);
                }
                await refreshMe();
              }}
            />
          </View>
        </ScrollView>
      ) : (
        <AuthScreen
          mode={screen === "signup" ? "signup" : "login"}
          error={error}
          busy={busy}
          onSwitchMode={() => {
            setError(null);
            setScreen(screen === "login" ? "signup" : "login");
          }}
          onLogin={async ({ email, password }) => {
            setError(null);
            setBusy(true);
            try {
              await portalLogin(email, password);
              await refreshMe();
            } catch (e: any) {
              setError(e instanceof Error ? e.message : "Unable to sign in");
            } finally {
              setBusy(false);
            }
          }}
          onSignup={async ({ name, email, password, businessName, city, state }) => {
            setError(null);
            setBusy(true);
            try {
              await portalSignup({ name, email, password, businessName, city, state });
              await refreshMe();
            } catch (e: any) {
              setError(e instanceof Error ? e.message : "Unable to create account");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function PrimaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={[styles.button, styles.primaryButton, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={[styles.button, styles.secondaryButton, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function AuthScreen({
  mode,
  error,
  busy,
  onSwitchMode,
  onLogin,
  onSignup,
}: {
  mode: "login" | "signup";
  error: string | null;
  busy: boolean;
  onSwitchMode: () => void;
  onLogin: (input: { email: string; password: string }) => Promise<void>;
  onSignup: (input: { name: string; email: string; password: string; businessName: string; city: string; state: string }) => Promise<void>;
}) {
  const isLogin = mode === "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (isLogin) return password.trim().length >= 6;
    if (password.trim().length < 8) return false;
    if (!name.trim() || name.trim().length < 2) return false;
    if (!businessName.trim() || businessName.trim().length < 2) return false;
    if (!city.trim() || city.trim().length < 2) return false;
    if (!state.trim() || state.trim().length < 2) return false;
    return true;
  }, [email, password, isLogin, name, businessName, city, state]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Header title={isLogin ? "Sign in" : "Get started"} subtitle={isLogin ? "Use your Portal login" : "Create your Portal account"} />

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          {!isLogin ? (
            <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          ) : null}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@domain.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
            secureTextEntry
            autoCapitalize="none"
          />

          {!isLogin ? (
            <>
              <Divider />
              <Field
                label="Business name"
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Business LLC"
                autoCapitalize="words"
              />
              <View style={styles.row}>
                <View style={styles.half}>
                  <Field label="City" value={city} onChangeText={setCity} placeholder="City" autoCapitalize="words" />
                </View>
                <View style={styles.half}>
                  <Field label="State" value={state} onChangeText={setState} placeholder="State" autoCapitalize="characters" />
                </View>
              </View>
            </>
          ) : null}
        </View>

        <PrimaryButton
          label={busy ? "Working…" : isLogin ? "Sign in" : "Create account"}
          disabled={busy || !canSubmit}
          onPress={() => {
            if (isLogin) {
              void onLogin({ email, password });
            } else {
              void onSignup({ name, email, password, businessName, city, state });
            }
          }}
        />

        <Pressable accessibilityRole="button" onPress={busy ? undefined : onSwitchMode} style={styles.linkButton}>
          <Text style={styles.linkText}>
            {isLogin ? "New here? Create an account" : "Already have an account? Sign in"}
          </Text>
        </Pressable>

        <View style={styles.hint}>
          <Text style={styles.hintText}>
            Requests include `{AppConfig.appHeaderName}: {AppConfig.appHeaderValue}` and proxy to the Portal backend via Vercel rewrites.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: any;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={"#8a8a8a"}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: 20,
    gap: 14,
  },
  header: {
    gap: 6,
    paddingVertical: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.muted,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  cardBody: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  mutedText: {
    fontSize: 14,
    color: theme.colors.muted,
  },
  errorBox: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fff5f5",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: {
    color: "#991b1b",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: theme.colors.muted,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: "#fff",
    outlineStyle: "none" as any,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 6,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  half: {
    flex: 1,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linkButton: {
    paddingVertical: 8,
    alignItems: "center",
  },
  linkText: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  hint: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#f6f7ff",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  hintText: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
