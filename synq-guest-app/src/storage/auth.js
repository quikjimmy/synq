'use strict';

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'synq_guest_token';
const GUEST_KEY = 'synq_guest_profile';

export async function saveSession(token, guest) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(GUEST_KEY, JSON.stringify(guest));
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getGuest() {
  const raw = await SecureStore.getItemAsync(GUEST_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(GUEST_KEY);
}
