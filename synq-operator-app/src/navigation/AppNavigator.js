'use strict';

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { getToken, getOperator } from '../storage/auth';
import LoginScreen from '../screens/LoginScreen';
import TripDashboardScreen from '../screens/TripDashboardScreen';
import ReaderPairingScreen from '../screens/ReaderPairingScreen';
import ManifestLockScreen from '../screens/ManifestLockScreen';
import ManifestExportScreen from '../screens/ManifestExportScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [initialParams, setInitialParams] = useState({});

  useEffect(() => {
    async function bootstrap() {
      const token = await getToken();
      if (token) {
        const operator = await getOperator();
        setInitialParams({ operator });
        setInitialRoute('TripDashboard');
      } else {
        setInitialRoute('Login');
      }
    }
    bootstrap();
  }, []);

  if (!initialRoute) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: '#0057FF' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TripDashboard"
          component={TripDashboardScreen}
          options={{ headerShown: false }}
          initialParams={initialRoute === 'TripDashboard' ? initialParams : undefined}
        />
        <Stack.Screen
          name="ReaderPairing"
          component={ReaderPairingScreen}
          options={{ title: 'Reader Setup' }}
        />
        <Stack.Screen
          name="ManifestLock"
          component={ManifestLockScreen}
          options={{ title: 'Lock & Review' }}
        />
        <Stack.Screen
          name="ManifestExport"
          component={ManifestExportScreen}
          options={{ title: 'Export PDF' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
