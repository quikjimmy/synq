'use strict';

import * as SecureStore from 'expo-secure-store';

// Override with your deployed API URL via environment / EAS config.
// During local development, set EXPO_PUBLIC_API_URL in a .env file.
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ||
  'http://72.62.128.211:3200';

const WS_BASE_URL = BASE_URL.replace(/^http/, 'ws');

async function getToken() {
  return SecureStore.getItemAsync('synq_guest_token');
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
  /** Register a new guest and optionally link an RFID wristband. */
  guestRegister(payload) {
    return request('POST', '/auth/guest/register', payload, false);
  },

  /** Log in as existing guest. */
  guestLogin(payload) {
    return request('POST', '/auth/guest/login', payload, false);
  },

  /** Fetch a trip manifest (requires auth). */
  getTrip(tripId) {
    return request('GET', `/trips/${tripId}`, null, true);
  },
};

/** Build a WebSocket URL for a trip. */
export function tripWsUrl(tripId) {
  return `${WS_BASE_URL}/ws/trips/${tripId}`;
}
