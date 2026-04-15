'use strict';

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from '../api/client';
import { getToken } from '../storage/auth';

export default function ManifestExportScreen({ route }) {
  const { activeTrip } = route.params || {};
  const [exporting, setExporting] = useState(false);
  const [elapsed, setElapsed] = useState(null);

  async function handleExport() {
    if (!activeTrip) {
      Alert.alert('No trip', 'No active trip to export.');
      return;
    }
    setExporting(true);
    setElapsed(null);
    const start = Date.now();

    try {
      const token = await getToken();
      const url = api.manifestPdfUrl(activeTrip.id);
      const destPath = `${FileSystem.cacheDirectory}manifest_${activeTrip.id.slice(0, 8)}.pdf`;

      const downloadResumable = FileSystem.createDownloadResumable(url, destPath, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { uri } = await downloadResumable.downloadAsync();
      const ms = Date.now() - start;
      setElapsed(ms);

      if (ms > 30000) {
        Alert.alert(
          'Slow export',
          `PDF generated in ${(ms / 1000).toFixed(1)}s (target <30s). Opening anyway.`,
        );
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Manifest PDF' });
      } else {
        Alert.alert('Downloaded', `Saved to: ${uri}`);
      }
    } catch (err) {
      Alert.alert('Export failed', err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.icon}>📋</Text>
          <Text style={styles.title}>Coast Guard Manifest</Text>
          <Text style={styles.subtitle}>
            {activeTrip
              ? `Trip ${activeTrip.id.slice(0, 8)}`
              : 'No active trip'}
          </Text>

          <Text style={styles.description}>
            Generates a PDF with vessel info, full passenger list (name, DOB, emergency contact,
            boarding status), and operator signature field.
          </Text>

          {elapsed !== null && (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>
                Generated in {(elapsed / 1000).toFixed(1)}s
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, (exporting || !activeTrip) && styles.btnDisabled]}
            onPress={handleExport}
            disabled={exporting || !activeTrip}
          >
            {exporting ? (
              <View style={styles.exportingRow}>
                <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Generating PDF…</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>Export PDF</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.targetNote}>Target: &lt;30 seconds</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7ff' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 16 },
  description: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: '#0057FF',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginBottom: 8,
    minWidth: 200,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  exportingRow: { flexDirection: 'row', alignItems: 'center' },
  targetNote: { fontSize: 12, color: '#aaa', marginTop: 4 },
  successBanner: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  successText: { color: '#16a34a', fontWeight: '600', fontSize: 14 },
});
