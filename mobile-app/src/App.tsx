import * as React from "react";
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";

import { AppConfig } from "./config/app";

function FeatureCard(props: { title: string; subtitle: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{props.title}</Text>
      <Text style={styles.cardSubtitle}>{props.subtitle}</Text>
    </View>
  );
}

export default function RootApp() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Purely (Mobile)</Text>
        <Text style={styles.subtitle}>Scaffold only — separate from the web portal.</Text>

        <FeatureCard title="Tutorials" subtitle="Mobile walkthroughs for each service." />
        <FeatureCard title="Funnel Builder" subtitle="Funnels, forms, domains, responses." />
        <FeatureCard title="Inbox" subtitle="Email + SMS threads in one place." />
        <FeatureCard title="People" subtitle="Contacts, tags, custom variables." />
        <FeatureCard title="Booking" subtitle="Appointments, reminders, availability." />

        <View style={styles.footer}>
          <Text style={styles.footerText}>API base URL: {AppConfig.apiBaseUrl ?? "(not set)"}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  container: { padding: 18, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 14, color: "#6b7280" },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fafafa",
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  cardSubtitle: { fontSize: 13, marginTop: 4, color: "#6b7280" },
  footer: { marginTop: 8 },
  footerText: { fontSize: 12, color: "#6b7280" },
});
