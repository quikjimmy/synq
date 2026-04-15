'use strict';

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'synq_operator_token';
const OPERATOR_KEY = 'synq_operator_profile';
const VESSEL_KEY = 'synq_operator_vessel';

export async function saveSession(token, operator) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(OPERATOR_KEY, JSON.stringify(operator));
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getOperator() {
  const raw = await SecureStore.getItemAsync(OPERATOR_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveVessel(vessel) {
  await SecureStore.setItemAsync(VESSEL_KEY, JSON.stringify(vessel));
}

export async function getVessel() {
  const raw = await SecureStore.getItemAsync(VESSEL_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(OPERATOR_KEY);
  await SecureStore.deleteItemAsync(VESSEL_KEY);
}
