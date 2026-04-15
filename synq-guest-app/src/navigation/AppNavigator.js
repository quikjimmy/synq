'use strict';

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { getToken, getGuest } from '../storage/auth';
import RegisterScreen from '../screens/RegisterScreen';
import LoginScreen from '../screens/LoginScreen';
import LinkWristbandScreen from '../screens/LinkWristbandScreen';
import TripStatusScreen from '../screens/TripStatusScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [initialParams, setInitialParams] = useState({});

  useEffect(() => {
    async function bootstrap() {
      const token = await getToken();
      if (token) {
        const guest = await getGuest();
        setInitialParams({ guest });
        setInitialRoute('TripStatus');
      } else {
        setInitialRoute('Register');
      }
    }
    bootstrap();
  }, []);

  if (!initialRoute) return null; // splash / loading

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
          name="Register"
          component={RegisterScreen}
          options={{ title: 'Create Profile', headerShown: false }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: 'Log In', headerShown: false }}
        />
        <Stack.Screen
          name="LinkWristband"
          component={LinkWristbandScreen}
          options={{ title: 'Link Wristband' }}
          initialParams={initialRoute === 'LinkWristband' ? initialParams : undefined}
        />
        <Stack.Screen
          name="TripStatus"
          component={TripStatusScreen}
          options={{ title: 'Trip Status', headerShown: false }}
          initialParams={initialRoute === 'TripStatus' ? initialParams : undefined}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
