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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { saveVessel } from '../storage/auth';

// NFC is hardware-dependent; gracefully degrade if not available.
let NfcManager, NfcTech, Ndef;
try {
  const nfc = require('expo-nfc');
  NfcManager = nfc.NfcManager;
  NfcTech = nfc.NfcTech;
  Ndef = nfc.Ndef;
} catch (_) {
  // NFC unavailable in this environment — NFC sim disabled
}

export default function ReaderPairingScreen({ navigation, route }) {
  const { vessel: initialVessel, activeTrip } = route.params || {};

  const [vessel, setVessel] = useState(initialVessel || null);
  const [readers, setReaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newReaderName, setNewReaderName] = useState('');
  const [isExitReader, setIsExitReader] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [activeSimReader, setActiveSimReader] = useState(null);

  async function loadReaders() {
    if (!vessel) { setLoading(false); return; }
    try {
      const list = await api.getReaders(vessel.id);
      // Treat last_seen_at within 60s as online
      const now = Date.now();
      setReaders(
        list.map((r) => ({
          ...r,
          online: r.last_seen_at && now - new Date(r.last_seen_at).getTime() < 60000,
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
      Alert.alert(
        'Reader added',
        `API Key (save this — shown once):\n\n${api_key}`,
        [{ text: 'OK' }],
      );
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
    if (!NfcManager) {
      Alert.alert('NFC unavailable', 'NFC is not supported on this device/emulator.');
      return;
    }
    if (!activeTrip) {
      Alert.alert('No active trip', 'Start a trip first.');
      return;
    }
    if (!reader.api_key) {
      Alert.alert(
        'No API key',
        'This reader\'s API key is not stored on device. Remove and re-add the reader to get the key.',
      );
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
        Alert.alert('Bad tag', 'Could not read UUID from wristband NFC tag.');
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

  useEffect(() => {
    loadReaders();
  }, [vessel]);

  function renderReader({ item }) {
    const scanning = nfcScanning && activeSimReader === item.id;
    return (
      <View style={styles.readerRow}>
        <View style={styles.readerLeft}>
          <Text style={styles.readerName}>{item.name}</Text>
          <Text style={styles.readerMeta}>
            {item.is_exit ? 'Exit zone  •  ' : 'Boarding  •  '}
            <Text style={{ color: item.online ? '#22c55e' : '#f87171' }}>
              {item.online ? 'Online' : 'Offline'}
            </Text>
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.simBtn, scanning && styles.simBtnActive]}
          onPress={() => handleNfcSim(item)}
          disabled={nfcScanning}
        >
          <Text style={styles.simBtnText}>
            {scanning ? 'Scanning…' : 'Tap NFC'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
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

      {Platform.OS !== 'web' && (
        <View style={styles.nfcNote}>
          <Text style={styles.nfcNoteText}>
            "Tap NFC" simulates the RFID reader: your phone reads the guest wristband NFC tag
            and fires a boarding event to the API.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7ff', padding: 16 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 12 },
  readerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
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
  nfcNote: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  nfcNoteText: { fontSize: 12, color: '#3b82f6', lineHeight: 18 },
});
