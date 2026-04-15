'use strict';

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';

const STATUS_COLORS = {
  pre_board: '#888',
  on_board: '#22c55e',
  disembarked: '#f59e0b',
};

const STATUS_LABELS = {
  pre_board: 'Pre-board',
  on_board: 'On Board',
  disembarked: 'Disembarked',
};

export default function ManifestLockScreen({ navigation, route }) {
  const { activeTrip, passengers = [], headcount = 0 } = route.params || {};
  const [locking, setLocking] = useState(false);
  const [locked, setLocked] = useState(!!activeTrip?.locked_at);

  async function handleLock() {
    Alert.alert(
      'Lock Manifest?',
      `This will lock the manifest with ${headcount} passengers. No further boarding changes will be recorded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock',
          style: 'destructive',
          onPress: async () => {
            setLocking(true);
            try {
              await api.lockTrip(activeTrip.id);
              setLocked(true);
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setLocking(false);
            }
          },
        },
      ],
    );
  }

  function handleExport() {
    navigation.navigate('ManifestExport', { activeTrip });
  }

  const onBoardCount = passengers.filter((p) => p.status === 'on_board').length;
  const disembarkedCount = passengers.filter((p) => p.status === 'disembarked').length;
  const preboardCount = passengers.filter((p) => p.status === 'pre_board').length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Manifest Summary</Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: '#22c55e' }]}>{onBoardCount}</Text>
              <Text style={styles.statLabel}>On Board</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: '#f59e0b' }]}>{disembarkedCount}</Text>
              <Text style={styles.statLabel}>Disembarked</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: '#888' }]}>{preboardCount}</Text>
              <Text style={styles.statLabel}>Pre-board</Text>
            </View>
          </View>
        </View>

        {locked ? (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedText}>Manifest Locked</Text>
            <Text style={styles.lockedSub}>No further RFID updates will be recorded.</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.lockBtn, locking && styles.btnDisabled]}
            onPress={handleLock}
            disabled={locking}
          >
            {locking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.lockBtnText}>Lock Manifest</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Text style={styles.exportBtnText}>Export PDF</Text>
        </TouchableOpacity>

        <View style={styles.passengerSection}>
          <Text style={styles.passengerTitle}>All Passengers ({passengers.length})</Text>
          {passengers.map((p) => (
            <View key={p.guest_id} style={styles.passengerRow}>
              <Text style={styles.passengerName}>{p.name}</Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: STATUS_COLORS[p.status] || '#888' },
                ]}
              >
                <Text style={styles.badgeText}>{STATUS_LABELS[p.status] || p.status}</Text>
              </View>
            </View>
          ))}
          {passengers.length === 0 && (
            <Text style={styles.emptyText}>No passengers recorded.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7ff' },
  container: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 14 },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 36, fontWeight: '800' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  lockedBanner: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  lockedText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  lockedSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  lockBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  lockBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  exportBtn: {
    backgroundColor: '#0057FF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  passengerSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  passengerTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 12 },
  passengerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  passengerName: { fontSize: 14, color: '#111' },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyText: { color: '#aaa', textAlign: 'center', paddingVertical: 12 },
});
