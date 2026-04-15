'use strict';

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, tripWsUrl } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { getVessel, clearSession } from '../storage/auth';

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

export default function TripDashboardScreen({ navigation, route }) {
  const { operator } = route.params || {};

  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [passengers, setPassengers] = useState([]);
  const [headcount, setHeadcount] = useState(0);
  const [capacity, setCapacity] = useState(0);
  const [vessel, setVessel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const wsUrl = activeTrip ? tripWsUrl(activeTrip.id) : null;

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'manifest_update') {
      setHeadcount(msg.headcount);
      setPassengers((prev) => {
        const idx = prev.findIndex((p) => p.guest_id === msg.passenger.guest_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = msg.passenger;
          return next;
        }
        return [...prev, msg.passenger];
      });
    }
  }, []);

  const { connected } = useWebSocket(wsUrl, handleWsMessage);

  async function bootstrap() {
    try {
      const savedVessel = await getVessel();
      let v = savedVessel;
      if (!v) {
        const vessels = await api.getVessels();
        v = vessels[0] || null;
      }
      setVessel(v);
      if (v) {
        setCapacity(v.capacity || 0);
        const tripList = await api.getTrips(v.id);
        setTrips(tripList);
        const openTrip = tripList.find((t) => !t.locked_at) || tripList[0];
        if (openTrip) await loadTrip(openTrip);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrip(trip) {
    setActiveTrip(trip);
    try {
      const manifest = await api.getManifest(trip.id);
      setPassengers(manifest.passengers || []);
      setHeadcount(manifest.headcount || 0);
      setCapacity(manifest.vessel?.capacity || trip.vessel?.capacity || 0);
    } catch (_) {}
  }

  async function handleCreateTrip() {
    if (!vessel) {
      Alert.alert('No vessel', 'Set up a vessel first in Reader Pairing.');
      return;
    }
    try {
      const trip = await api.createTrip({ vessel_id: vessel.id });
      setTrips((prev) => [...prev, trip]);
      await loadTrip(trip);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }

  async function handleOverride(passenger) {
    if (!activeTrip) return;
    const newStatus = passenger.status === 'on_board' ? 'disembarked' : 'on_board';
    Alert.alert(
      'Override check-in',
      `Set ${passenger.name} to ${STATUS_LABELS[newStatus]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await api.overrideCheckin(activeTrip.id, passenger.guest_id, newStatus);
              setPassengers((prev) =>
                prev.map((p) =>
                  p.guest_id === passenger.guest_id ? { ...p, status: newStatus } : p,
                ),
              );
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ],
    );
  }

  async function handleLogout() {
    await clearSession();
    navigation.replace('Login');
  }

  async function onRefresh() {
    setRefreshing(true);
    if (activeTrip) await loadTrip(activeTrip);
    setRefreshing(false);
  }

  useEffect(() => {
    bootstrap();
  }, []);

  function renderPassenger({ item }) {
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text style={styles.passengerName}>{item.name}</Text>
          <Text style={styles.passengerMeta}>
            {item.last_reader ? `Zone: ${item.last_reader}` : 'No scan yet'}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: STATUS_COLORS[item.status] || '#888' },
            ]}
          >
            <Text style={styles.statusText}>{STATUS_LABELS[item.status] || item.status}</Text>
          </View>
          <TouchableOpacity
            style={styles.overrideBtn}
            onPress={() => handleOverride(item)}
          >
            <Text style={styles.overrideBtnText}>Override</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0057FF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.vesselName}>{vessel?.name || 'No Vessel'}</Text>
          <Text style={styles.tripLabel}>
            {activeTrip ? `Trip ${activeTrip.id.slice(0, 8)}` : 'No Active Trip'}
            {'  '}
            <Text style={{ color: connected ? '#22c55e' : '#f87171' }}>
              {connected ? '● Live' : '○ Offline'}
            </Text>
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutBtn}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headcountCard}>
        <Text style={styles.headcountNum}>
          {headcount} / {capacity || '—'}
        </Text>
        <Text style={styles.headcountLabel}>Passengers On Board</Text>
      </View>

      <View style={styles.actionRow}>
        {!activeTrip && (
          <TouchableOpacity style={styles.actionBtn} onPress={handleCreateTrip}>
            <Text style={styles.actionBtnText}>+ Start Trip</Text>
          </TouchableOpacity>
        )}
        {activeTrip && (
          <>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('ReaderPairing', { vessel, activeTrip })}
            >
              <Text style={styles.actionBtnText}>Readers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.lockBtn]}
              onPress={() =>
                navigation.navigate('ManifestLock', { activeTrip, passengers, headcount })
              }
            >
              <Text style={styles.actionBtnText}>Lock & Export</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <FlatList
        data={passengers}
        keyExtractor={(item) => item.guest_id}
        renderItem={renderPassenger}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {activeTrip ? 'No passengers yet. Tap wristbands to board.' : 'Start a trip to see the manifest.'}
          </Text>
        }
        contentContainerStyle={passengers.length === 0 && styles.emptyContainer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7ff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0057FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  vesselName: { color: '#fff', fontWeight: '700', fontSize: 17 },
  tripLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  logoutBtn: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textDecorationLine: 'underline' },
  headcountCard: {
    backgroundColor: '#0057FF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
  },
  headcountNum: { color: '#fff', fontSize: 48, fontWeight: '800' },
  headcountLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#0057FF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  lockBtn: { backgroundColor: '#16a34a' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  rowLeft: { flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passengerName: { fontSize: 15, fontWeight: '600', color: '#111' },
  passengerMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  overrideBtn: {
    borderWidth: 1,
    borderColor: '#0057FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  overrideBtnText: { color: '#0057FF', fontSize: 11, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: '#aaa', padding: 32, fontSize: 14 },
});
