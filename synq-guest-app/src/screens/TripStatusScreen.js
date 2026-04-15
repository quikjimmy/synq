'use strict';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api, tripWsUrl } from '../api/client';
import { getGuest, clearSession } from '../storage/auth';
import { useWebSocket } from '../hooks/useWebSocket';

// ── Notification setup ────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function requestNotificationPermissions() {
  if (!Device.isDevice) return null; // no push in simulator
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;
  const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
  return tokenData?.data ?? null;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pre_board: {
    label: 'Pre-Board',
    description: 'You are not yet checked in for this trip.',
    color: '#888',
    bg: '#f5f5f5',
    icon: '⏳',
  },
  on_board: {
    label: 'On Board',
    description: 'You are currently on the vessel.',
    color: '#16a34a',
    bg: '#f0fdf4',
    icon: '⚓',
  },
  disembarked: {
    label: 'Disembarked',
    description: 'You have left the vessel.',
    color: '#2563eb',
    bg: '#eff6ff',
    icon: '🏁',
  },
};

function deriveGuestStatus(manifest, guestId) {
  if (!manifest || !guestId) return 'pre_board';
  const entry = manifest.find((m) => m.guest?.id === guestId);
  if (!entry) return 'pre_board';
  if (entry.boarded_at) return 'on_board';
  return 'pre_board';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TripStatusScreen({ navigation, route }) {
  const initialGuest = route.params?.guest || null;
  const [guest, setGuest] = useState(initialGuest);
  const [trip, setTrip] = useState(null);
  const [guestStatus, setGuestStatus] = useState('pre_board');
  const [tripId, setTripId] = useState(route.params?.tripId || null);
  const [refreshing, setRefreshing] = useState(false);
  const [pushToken, setPushToken] = useState(null);
  const prevStatusRef = useRef(null);
  const notifSubscriptionRef = useRef(null);

  // ── Load session on mount ────────────────────────────────────────────────

  useEffect(() => {
    async function loadSession() {
      const stored = await getGuest();
      if (stored) setGuest(stored);
    }
    if (!guest) loadSession();
  }, []);

  // ── Notification permissions ──────────────────────────────────────────────

  useEffect(() => {
    requestNotificationPermissions().then((token) => {
      if (token) {
        setPushToken(token);
        // In production, send this token to /guests/me/push-token
      }
    });

    notifSubscriptionRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const body = notification.request.content.body || '';
        if (body.toLowerCase().includes('board') && tripId) {
          fetchTrip(tripId);
        }
      },
    );

    return () => {
      notifSubscriptionRef.current?.remove();
    };
  }, [tripId]);

  // ── Fetch trip ─────────────────────────────────────────────────────────────

  const fetchTrip = useCallback(async (id) => {
    if (!id) return;
    try {
      const data = await api.getTrip(id);
      setTrip(data);
      if (guest?.id) {
        setGuestStatus(deriveGuestStatus(data.manifest, guest.id));
      }
    } catch (err) {
      if (err.status === 404) {
        setTrip(null);
      }
    }
  }, [guest]);

  useEffect(() => {
    if (tripId) fetchTrip(tripId);
  }, [tripId, fetchTrip]);

  // ── WebSocket real-time updates ───────────────────────────────────────────

  const wsUrl = tripId ? tripWsUrl(tripId) : null;

  const handleWsMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'manifest_update':
      case 'rfid_event': {
        if (msg.manifest) {
          setTrip((prev) => prev ? { ...prev, manifest: msg.manifest } : prev);
          if (guest?.id) {
            const newStatus = deriveGuestStatus(msg.manifest, guest.id);
            setGuestStatus((prev) => {
              if (newStatus !== prev && newStatus === 'on_board') {
                // Send a local notification to confirm boarding
                Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'You\'re on board!',
                    body: `Your wristband was scanned. Welcome aboard ${trip?.vessel?.name || 'the vessel'}.`,
                    sound: true,
                  },
                  trigger: null, // immediately
                }).catch(() => {});
              }
              return newStatus;
            });
          }
        }
        break;
      }
      case 'trip_locked': {
        setTrip((prev) => prev ? { ...prev, locked: true, locked_at: msg.locked_at } : prev);
        break;
      }
      default:
        break;
    }
  }, [guest, trip]);

  const { connected } = useWebSocket(wsUrl, handleWsMessage);

  // ── Pull-to-refresh ────────────────────────────────────────────────────────

  async function onRefresh() {
    setRefreshing(true);
    await fetchTrip(tripId);
    setRefreshing(false);
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  const statusCfg = STATUS_CONFIG[guestStatus] || STATUS_CONFIG.pre_board;

  async function handleLogout() {
    await clearSession();
    navigation.replace('Login');
  }

  // If no active trip is linked to this guest, show a waiting state
  const noTrip = !trip;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hi, {guest?.first_name || 'Guest'}
          </Text>
          {guest?.rfid_uuid && (
            <Text style={styles.wristbandId}>
              Wristband: {guest.rfid_uuid}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      {/* Connection indicator */}
      {tripId && (
        <View style={[styles.connBadge, connected ? styles.connOn : styles.connOff]}>
          <Text style={styles.connText}>
            {connected ? '● Live' : '○ Reconnecting…'}
          </Text>
        </View>
      )}

      {/* Status card */}
      <View style={[styles.statusCard, { backgroundColor: statusCfg.bg }]}>
        <Text style={styles.statusIcon}>{statusCfg.icon}</Text>
        <Text style={[styles.statusLabel, { color: statusCfg.color }]}>
          {statusCfg.label}
        </Text>
        <Text style={styles.statusDesc}>{statusCfg.description}</Text>
      </View>

      {/* Trip details */}
      {trip ? (
        <View style={styles.tripCard}>
          <Text style={styles.tripTitle}>{trip.name}</Text>
          <Text style={styles.tripMeta}>Vessel: {trip.vessel?.name}</Text>
          {trip.destination && (
            <Text style={styles.tripMeta}>Destination: {trip.destination}</Text>
          )}
          {trip.departure_at && (
            <Text style={styles.tripMeta}>
              Departure: {new Date(trip.departure_at).toLocaleString()}
            </Text>
          )}
          {trip.locked && (
            <View style={styles.lockedBadge}>
              <Text style={styles.lockedText}>Manifest Locked</Text>
            </View>
          )}
          <Text style={styles.passengerCount}>
            {trip.passenger_count ?? trip.manifest?.length ?? 0} passenger
            {trip.manifest?.length !== 1 ? 's' : ''} on manifest
          </Text>
        </View>
      ) : (
        <View style={styles.noTripCard}>
          <Text style={styles.noTripText}>No active trip found.</Text>
          <Text style={styles.noTripSub}>
            Your operator will assign you to a trip. Pull down to refresh, or
            enter a Trip ID below.
          </Text>
        </View>
      )}

      {/* Trip ID entry for demo / testing */}
      {!tripId && (
        <TripIdEntry onSubmit={setTripId} />
      )}

      {!guest?.rfid_uuid && (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => navigation.navigate('LinkWristband', { guest })}
        >
          <Text style={styles.linkBtnText}>Link Wristband</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ── TripIdEntry sub-component ─────────────────────────────────────────────────

import { TextInput } from 'react-native';

function TripIdEntry({ onSubmit }) {
  const [value, setValue] = useState('');
  return (
    <View style={styles.tripIdCard}>
      <Text style={styles.tripIdLabel}>Enter Trip ID</Text>
      <View style={styles.tripIdRow}>
        <TextInput
          style={styles.tripIdInput}
          placeholder="e.g. abc123"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={styles.tripIdBtn}
          onPress={() => value.trim() && onSubmit(value.trim())}
        >
          <Text style={styles.tripIdBtnText}>Go</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f9f9f9' },
  container: { padding: 20, paddingBottom: 48 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0057FF',
  },
  wristbandId: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  logoutText: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },

  connBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  connOn: { backgroundColor: '#dcfce7' },
  connOff: { backgroundColor: '#fef9c3' },
  connText: { fontSize: 12, fontWeight: '600', color: '#444' },

  statusCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: { fontSize: 48, marginBottom: 8 },
  statusLabel: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  statusDesc: { fontSize: 14, color: '#555', textAlign: 'center' },

  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tripTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 8 },
  tripMeta: { fontSize: 14, color: '#555', marginBottom: 4 },
  lockedBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  lockedText: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  passengerCount: { fontSize: 13, color: '#888', marginTop: 8 },

  noTripCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  noTripText: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 6 },
  noTripSub: { fontSize: 13, color: '#999', textAlign: 'center', lineHeight: 18 },

  tripIdCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  tripIdLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8 },
  tripIdRow: { flexDirection: 'row', gap: 8 },
  tripIdInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  tripIdBtn: {
    backgroundColor: '#0057FF',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  tripIdBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  linkBtn: {
    borderWidth: 1.5,
    borderColor: '#0057FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  linkBtnText: { color: '#0057FF', fontWeight: '700', fontSize: 15 },
});
