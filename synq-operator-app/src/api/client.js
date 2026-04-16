'use strict';

import * as SecureStore from 'expo-secure-store';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ||
  'http://72.62.128.211:3200';

const WS_BASE_URL = BASE_URL.replace(/^http/, 'ws');

async function getToken() {
  return SecureStore.getItemAsync('synq_operator_token');
}

async function request(method, path, body, authenticated = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (authenticated) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  /** Register a new operator account. Returns { token, operator }. */
  operatorRegister(payload) {
    return request('POST', '/auth/operator/register', payload, false);
  },

  /** Log in as operator. Returns { token, operator }. */
  operatorLogin(payload) {
    return request('POST', '/auth/operator/login', payload, false);
  },

  /** List vessels for this operator. */
  getVessels() {
    return request('GET', '/operators/vessels', null, true);
  },

  /** Create a vessel. */
  createVessel(payload) {
    return request('POST', '/operators/vessels', payload, true);
  },

  /** List readers for a vessel. */
  getReaders(vesselId) {
    return request('GET', `/operators/vessels/${vesselId}/readers`, null, true);
  },

  /** Create a reader for a vessel. Returns { reader, api_key }. */
  createReader(vesselId, payload) {
    return request('POST', `/operators/vessels/${vesselId}/readers`, payload, true);
  },

  /** List trips for a vessel. */
  getTrips(vesselId) {
    return request('GET', `/operators/vessels/${vesselId}/trips`, null, true);
  },

  /** Create a trip. */
  createTrip(payload) {
    return request('POST', '/trips', payload, true);
  },

  /** Get full trip manifest. */
  getTrip(tripId) {
    return request('GET', `/trips/${tripId}`, null, true);
  },

  /** Poll manifest (operator or guest auth). */
  getManifest(tripId) {
    return request('GET', `/trips/${tripId}/manifest`, null, true);
  },

  /** Lock a trip manifest. */
  lockTrip(tripId) {
    return request('PATCH', `/trips/${tripId}/lock`, {}, true);
  },

  /** Override a guest's check-in status manually. */
  overrideCheckin(tripId, guestId, status) {
    return request('POST', `/trips/${tripId}/override`, { guest_id: guestId, status }, true);
  },

  /** Fire a simulated RFID event (NFC simulation). */
  fireRfidEvent(rfidUuid, readerId, readerApiKey) {
    return fetch(`${BASE_URL}/rfid/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readerApiKey}`,
      },
      body: JSON.stringify({ rfid_uuid: rfidUuid, reader_id: readerId }),
    }).then((r) => r.json());
  },

  /** Return manifest PDF download URL for a trip. */
  manifestPdfUrl(tripId) {
    return `${BASE_URL}/trips/${tripId}/manifest.pdf`;
  },

  BASE_URL,
};

/** Build a WebSocket URL for a trip. */
export function tripWsUrl(tripId) {
  return `${WS_BASE_URL}/ws/trips/${tripId}`;
}
