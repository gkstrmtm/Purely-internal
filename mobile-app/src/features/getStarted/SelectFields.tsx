import React, { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type Option = { value: string; label: string };

const BRAND_INK = "#334155";
const ZINC_200 = "#e4e4e7";
const ZINC_600 = "#52525b";
const ZINC_900 = "#18181b";

export function PortalSingleSelectField({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled,
  searchable,
}: {
  label: string;
  value: string;
  placeholder?: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s));
  }, [options, q]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.selectBtn, disabled ? styles.disabled : null]}
        onPress={() => {
          if (disabled) return;
          setQ("");
          setOpen(true);
        }}
      >
        <Text style={selected ? styles.selectText : styles.selectPlaceholder} numberOfLines={1}>
          {selected ? selected.label : placeholder || "Select"}
        </Text>
        <Text style={styles.chev}>{"▾"}</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>

            {searchable ? (
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search"
                style={styles.search}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}

            <ScrollView contentContainerStyle={styles.modalList} keyboardShouldPersistTaps="handled">
              {filtered.map((o) => {
                const checked = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    style={[styles.optionRow, checked ? styles.optionRowChecked : null]}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={styles.optionLabel}>{o.label}</Text>
                    <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]} />
                  </Pressable>
                );
              })}
              {!filtered.length ? <Text style={styles.empty}>No results</Text> : null}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function PortalMultiSelectField({
  label,
  values,
  placeholder,
  options,
  onChange,
  disabled,
  searchable,
}: {
  label: string;
  values: string[];
  placeholder?: string;
  options: Option[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const summary = values
    .map((v) => byValue.get(v)?.label)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s));
  }, [options, q]);

  function toggle(v: string) {
    const set = new Set(values);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange(Array.from(set));
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.selectBtn, disabled ? styles.disabled : null]}
        onPress={() => {
          if (disabled) return;
          setQ("");
          setOpen(true);
        }}
      >
        <Text style={values.length ? styles.selectText : styles.selectPlaceholder} numberOfLines={1}>
          {values.length ? summary : placeholder || "Select"}
        </Text>
        <Text style={styles.chev}>{"▾"}</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>

            {searchable ? (
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search"
                style={styles.search}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}

            <ScrollView contentContainerStyle={styles.modalList} keyboardShouldPersistTaps="handled">
              {filtered.map((o) => {
                const checked = values.includes(o.value);
                return (
                  <Pressable
                    key={o.value}
                    style={[styles.optionRow, checked ? styles.optionRowChecked : null]}
                    onPress={() => toggle(o.value)}
                  >
                    <Text style={styles.optionLabel}>{o.label}</Text>
                    <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]} />
                  </Pressable>
                );
              })}
              {!filtered.length ? <Text style={styles.empty}>No results</Text> : null}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { fontSize: 16, fontWeight: "600", color: ZINC_900 },

  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  disabled: { opacity: 0.6 },
  selectText: { color: ZINC_900, fontSize: 16, fontWeight: "500" },
  selectPlaceholder: { color: ZINC_600, fontSize: 16, fontWeight: "500" },
  chev: { color: ZINC_600, fontSize: 14, fontWeight: "800" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: ZINC_200,
    maxHeight: "85%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: ZINC_200,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: ZINC_900 },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  modalCloseText: { color: BRAND_INK, fontWeight: "900", fontSize: 18, lineHeight: 18 },

  search: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },

  modalList: { padding: 16, gap: 10, paddingBottom: 28 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  optionRowChecked: { borderColor: "#bbf7d0", backgroundColor: "#ecfdf5" },
  optionLabel: { fontSize: 14, fontWeight: "700", color: ZINC_900, flex: 1, paddingRight: 10 },
  checkbox: { height: 16, width: 16, borderRadius: 4, borderWidth: 1, borderColor: "#d4d4d8", backgroundColor: "#fff" },
  checkboxChecked: { borderColor: "#10b981", backgroundColor: "#10b981" },

  empty: { color: ZINC_600, paddingVertical: 12, textAlign: "center" },
});
