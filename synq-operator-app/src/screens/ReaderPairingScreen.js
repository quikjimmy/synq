'use strict';

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';

// NFC is hardware-dependent; gracefully degrade if not available.
let NfcManager, NfcTech, Ndef;
try {
  const nfc = require('expo-nfc');
  NfcManager = nfc.NfcManager;
  NfcTech = nfc.NfcTech;
  Ndef = nfc.Ndef;
} catch (_) {
  // NFC unavailable in this environment — manual UUID entry used instead
}

const READER_KEYS_STORE = 'synq_reader_api_keys';

async function loadStoredApiKeys() {
  try {
    const raw = await SecureStore.getItemAsync(READER_KEYS_STORE);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

async function saveReaderApiKey(readerId, apiKey) {
  try {
    const existing = await loadStoredApiKeys();
    await SecureStore.setItemAsync(
      READER_KEYS_STORE,
      JSON.stringify({ ...existing, [readerId]: apiKey }),
    );
  } catch (_) {}
}

export default function ReaderPairingScreen({ navigation, route }) {
  const { vessel: initialVessel, activeTrip } = route.params || {};

  const [vessel] = useState(initialVessel || null);
  const [readers, setReaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newReaderName, setNewReaderName] = useState('');
  const [isExitReader, setIsExitReader] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [activeSimReader, setActiveSimReader] = useState(null);
  // Per-reader manual UUID inputs (readerId -> string)
  const [manualUuids, setManualUuids] = useState({});
  const [manualFiring, setManualFiring] = useState({});

  async function loadReaders() {
    if (!vessel) { setLoading(false); return; }
    try {
      const list = await api.getReaders(vessel.id);
      const storedKeys = await loadStoredApiKeys();
      const now = Date.now();
      setReaders(
        list.map((r) => ({
          ...r,
          online: r.last_seen_at && now - new Date(r.last_seen_at).getTime() < 60000,
          api_key: storedKeys[r.id] || null,
        })),
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddReader() {
    if (!newReaderName.trim()) {
      Alert.alert('Name required', 'Enter a name for this reader (e.g. "Dock A").');
      return;
    }
    setAdding(true);
    try {
      const { reader, api_key } = await api.createReader(vessel.id, {
        name: newReaderName.trim(),
        is_exit: isExitReader,
      });
      // Persist so future sessions can fire events without re-creating the reader
      await saveReaderApiKey(reader.id, api_key);
      Alert.alert('Reader added', `"${reader.name}" is ready. API key saved on device.`);
      setNewReaderName('');
      setIsExitReader(false);
      await loadReaders();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleNfcSim(reader) {
    if (!activeTrip) {
      Alert.alert('No active trip', 'Start a trip first from the dashboard.');
      return;
    }
    if (!reader.api_key) {
      Alert.alert(
        'No API key',
        'This reader\'s API key is not stored. Remove and re-add the reader to generate a new key.',
      );
      return;
    }
    if (!NfcManager) {
      Alert.alert('NFC unavailable', 'Use the manual UUID entry below to fire a boarding event.');
      return;
    }

    setNfcScanning(true);
    setActiveSimReader(reader.id);
    try {
      await NfcManager.start();
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const rfidUuid = tag?.ndefMessage?.[0]?.payload
        ? Ndef.text.decodePayload(new Uint8Array(tag.ndefMessage[0].payload))
        : null;
      if (!rfidUuid) {
        Alert.alert('Bad tag', 'Could not read UUID from wristband NFC tag. Use manual entry.');
        return;
      }
      await api.fireRfidEvent(rfidUuid, reader.id, reader.api_key);
      Alert.alert('Scanned', `Wristband ${rfidUuid.slice(0, 8)}… logged to manifest.`);
    } catch (err) {
      if (err.message !== 'cancelled') Alert.alert('NFC Error', err.message);
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setNfcScanning(false);
      setActiveSimReader(null);
    }
  }

  async function handleManualFire(reader) {
    if (!activeTrip) {
      Alert.alert('No active trip', 'Start a trip first from the dashboard.');
      return;
    }
    if (!reader.api_key) {
      Alert.alert(
        'No API key',
        'This reader\'s API key is not stored. Remove and re-add the reader.',
      );
      return;
    }
    const uuid = (manualUuids[reader.id] || '').trim();
    if (!uuid) {
      Alert.alert('UUID required', 'Enter the guest wristband UUID.');
      return;
    }

    setManualFiring((prev) => ({ ...prev, [reader.id]: true }));
    try {
      const result = await api.fireRfidEvent(uuid, reader.id, reader.api_key);
      if (result.ok) {
        const statusLabel = { pre_board: 'Pre-Board', on_board: 'On Board', disembarked: 'Disembarked' }[result.status] || result.status;
        Alert.alert('Boarding event fired', `Status: ${statusLabel}  •  Headcount: ${result.headcount}`);
        setManualUuids((prev) => ({ ...prev, [reader.id]: '' }));
      } else {
        Alert.alert('Error', result.error || 'Unknown error from server.');
      }
    } catch (err) {
      Alert.alert('Fire failed', err.message);
    } finally {
      setManualFiring((prev) => ({ ...prev, [reader.id]: false }));
    }
  }

  useEffect(() => {
    loadReaders();
  }, [vessel]);

  function renderReader({ item }) {
    const nfcActive = nfcScanning && activeSimReader === item.id;
    const firing = !!manualFiring[item.id];
    const uuid = manualUuids[item.id] || '';

    return (
      <View style={styles.readerCard}>
        <View style={styles.readerHeader}>
          <View style={styles.readerLeft}>
            <Text style={styles.readerName}>{item.name}</Text>
            <Text style={styles.readerMeta}>
              {item.is_exit ? 'Exit zone  •  ' : 'Boarding  •  '}
              <Text style={{ color: item.online ? '#22c55e' : '#f87171' }}>
                {item.online ? 'Online' : 'Offline'}
              </Text>
              {!item.api_key && <Text style={{ color: '#f59e0b' }}>  •  No key</Text>}
            </Text>
          </View>
          {NfcManager && (
            <TouchableOpacity
              style={[styles.simBtn, nfcActive && styles.simBtnActive]}
              onPress={() => handleNfcSim(item)}
              disabled={nfcScanning || firing}
            >
              <Text style={styles.simBtnText}>
                {nfcActive ? 'Scanning…' : 'Tap NFC'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Manual UUID entry — always shown so demo works without NFC */}
        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            value={uuid}
            onChangeText={(v) => setManualUuids((prev) => ({ ...prev, [item.id]: v }))}
            placeholder="Guest UUID (manual fire)"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.fireBtn, (firing || !uuid) && styles.fireBtnDisabled]}
            onPress={() => handleManualFire(item)}
            disabled={firing || !uuid}
          >
            {firing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.fireBtnText}>Fire</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {vessel ? `Readers — ${vessel.name}` : 'No Vessel Selected'}
          </Text>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#0057FF" />
          ) : (
            <FlatList
              data={readers}
              keyExtractor={(r) => r.id}
              renderItem={renderReader}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No readers yet. Add one below.</Text>
              }
              scrollEnabled={false}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Reader</Text>
          <TextInput
            style={styles.input}
            value={newReaderName}
            onChangeText={setNewReaderName}
            placeholder="Reader name (e.g. Dock A)"
          />
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setIsExitReader((v) => !v)}
          >
            <View style={[styles.toggle, isExitReader && styles.toggleOn]} />
            <Text style={styles.toggleLabel}>
              {isExitReader ? 'Exit zone reader' : 'Boarding reader'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, adding && styles.btnDisabled]}
            onPress={handleAddReader}
            disabled={adding}
          >
            {adding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Add Reader</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>Demo Flow</Text>
          <Text style={styles.helpText}>
            1. Guest registers in the guest app and notes their UUID{'\n'}
            2. Operator adds a "Boarding" reader and an "Exit" reader here{'\n'}
            3. To board a guest: paste their UUID into the boarding reader's field → Fire{'\n'}
            4. To disembark: paste UUID into the exit reader's field → Fire{'\n'}
            5. Manifest updates in real-time on the dashboard
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7ff' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 12 },
  readerCard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    paddingVertical: 12,
  },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  readerLeft: { flex: 1 },
  readerName: { fontSize: 14, fontWeight: '600', color: '#111' },
  readerMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  simBtn: {
    backgroundColor: '#0057FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  simBtnActive: { backgroundColor: '#6366f1' },
  simBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  fireBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 52,
  },
  fireBtnDisabled: { opacity: 0.4 },
  fireBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyText: { color: '#aaa', textAlign: 'center', paddingVertical: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ddd',
  },
  toggleOn: { backgroundColor: '#0057FF' },
  toggleLabel: { fontSize: 14, color: '#333' },
  btn: {
    backgroundColor: '#0057FF',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  helpCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    margin: 16,
  },
  helpTitle: { fontSize: 13, fontWeight: '700', color: '#1d4ed8', marginBottom: 6 },
  helpText: { fontSize: 12, color: '#1e40af', lineHeight: 20 },
});
