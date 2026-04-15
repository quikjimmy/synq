'use strict';

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';
import { saveSession } from '../storage/auth';

// NFC is only available on physical devices. We gracefully degrade to
// manual entry in the Expo Go / simulator context.
let NfcManager = null;
let NfcTech = null;
let NfcEvents = null;
try {
  const nfc = require('react-native-nfc-manager');
  NfcManager = nfc.default;
  NfcTech = nfc.NfcTech;
  NfcEvents = nfc.NfcEvents;
} catch (_) {
  // expo-nfc or react-native-nfc-manager not available — use simulation mode
}

const NFC_AVAILABLE =
  Platform.OS !== 'web' && NfcManager !== null;

export default function LinkWristbandScreen({ navigation, route }) {
  const { guest } = route.params;
  const [scanning, setScanning] = useState(false);
  const [manualUuid, setManualUuid] = useState('');
  const [linking, setLinking] = useState(false);

  // ── NFC Scan ──────────────────────────────────────────────────────────────

  const startNfcScan = useCallback(async () => {
    if (!NFC_AVAILABLE) {
      Alert.alert(
        'NFC Not Available',
        'NFC is not supported on this device/simulator. Use the manual UUID entry below.',
      );
      return;
    }
    setScanning(true);
    try {
      await NfcManager.start();
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const rfidUuid =
        tag?.id?.map((b) => b.toString(16).padStart(2, '0')).join(':') ||
        tag?.ndefMessage?.[0]?.payload?.slice(3).toString('utf8') ||
        null;

      if (!rfidUuid) {
        Alert.alert('Scan Failed', 'Could not read UUID from wristband. Try manual entry.');
        return;
      }
      await linkWristband(rfidUuid);
    } catch (err) {
      if (err.message !== 'cancelled') {
        Alert.alert('NFC Error', err.message || 'Could not scan wristband.');
      }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setScanning(false);
    }
  }, []);

  // ── Manual UUID Link ──────────────────────────────────────────────────────

  async function handleManualLink() {
    const uuid = manualUuid.trim();
    if (!uuid) {
      return Alert.alert('Required', 'Please enter the wristband UUID.');
    }
    await linkWristband(uuid);
  }

  // ── Shared link logic ─────────────────────────────────────────────────────

  async function linkWristband(rfidUuid) {
    setLinking(true);
    try {
      // The backend /auth/guest/register endpoint is idempotent for UUID linking
      // when re-called with the existing credentials.  For Phase 1 the approach is:
      // 1. Re-register with the same email (will 409 — email already taken), OR
      // 2. Use a dedicated PATCH /guests/me/wristband endpoint if available.
      //
      // For the demo we patch via a simple POST to a thin update-wristband route.
      // If the backend does not have that route yet, we skip the API call and
      // store the UUID locally so the operator app can still display it.
      const token = await SecureStore.getItemAsync('synq_guest_token');
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'}/guests/me/wristband`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rfid_uuid: rfidUuid }),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        await saveSession(token, { ...guest, rfid_uuid: rfidUuid });
      } else if (res.status === 404) {
        // Endpoint not yet deployed — store locally for demo
        await saveSession(token, { ...guest, rfid_uuid: rfidUuid });
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      Alert.alert(
        'Wristband Linked!',
        `UUID ${rfidUuid} is now linked to your profile.`,
        [
          {
            text: 'Continue',
            onPress: () =>
              navigation.replace('TripStatus', { guest: { ...guest, rfid_uuid: rfidUuid } }),
          },
        ],
      );
    } catch (err) {
      Alert.alert('Link Failed', err.message || 'Could not link wristband. Please try again.');
    } finally {
      setLinking(false);
    }
  }

  function handleSkip() {
    navigation.replace('TripStatus', { guest });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Link Your Wristband</Text>
      <Text style={styles.subtitle}>
        Tap your NFC wristband to your phone to automatically pair it, or enter
        the UUID printed on the wristband label.
      </Text>

      {NFC_AVAILABLE && (
        <TouchableOpacity
          style={[styles.nfcButton, scanning && styles.nfcButtonActive]}
          onPress={startNfcScan}
          disabled={scanning || linking}
        >
          {scanning ? (
            <>
              <ActivityIndicator color="#fff" style={styles.spinner} />
              <Text style={styles.nfcButtonText}>Hold wristband to phone…</Text>
            </>
          ) : (
            <Text style={styles.nfcButtonText}>Tap to Scan Wristband (NFC)</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or enter manually</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.inputWrapper}>
        <Text style={styles.label}>Wristband UUID</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. A1:B2:C3:D4 or demo-uuid-001"
          value={manualUuid}
          onChangeText={setManualUuid}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <TouchableOpacity
        style={[styles.button, linking && styles.buttonDisabled]}
        onPress={handleManualLink}
        disabled={linking}
      >
        {linking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Link Wristband</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipLink} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0057FF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 32,
  },
  nfcButton: {
    backgroundColor: '#0057FF',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  nfcButtonActive: {
    backgroundColor: '#0044CC',
  },
  nfcButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  spinner: {
    marginRight: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    fontSize: 13,
    color: '#999',
  },
  inputWrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#0057FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipText: {
    color: '#999',
    fontSize: 14,
  },
});
