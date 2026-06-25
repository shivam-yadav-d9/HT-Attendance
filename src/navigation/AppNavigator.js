// src/navigation/AppNavigator.js
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from '../screens/Auth/LoginScreen';
import BottomTabs from './BottomTabs';
import geofenceService from '../services/geofence.service';

const Stack = createNativeStackNavigator();

// Fire this ONCE from LoginScreen after a successful login, and ONCE from
// ProfileScreen after logout completes. AppNavigator listens for it below.
// This replaces any polling/interval/AppState approach for re-checking auth
// — it only runs when auth state actually changes, so it never re-triggers
// geofenceService.startTracking() on a timer.
export const AUTH_STATE_CHANGED_EVENT = 'AUTH_STATE_CHANGED';

export default function AppNavigator() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Runs ONCE when the app boots, plus exactly when AUTH_STATE_CHANGED_EVENT
  // fires (login / logout). Do NOT add AppState listeners, intervals, or
  // navigation 'state' listeners here that re-call this — startTracking()
  // tears down and re-adds the native geofence every time it runs, which is
  // why repeated calls were silently breaking ENTER/EXIT detection.
  useEffect(() => {
    checkLogin();

    const sub = DeviceEventEmitter.addListener(AUTH_STATE_CHANGED_EVENT, () => {
      checkLogin();
    });
    return () => sub.remove();
  }, []);

  const checkLogin = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userString = await AsyncStorage.getItem('userData');

      if (token && userString) {
        const user = JSON.parse(userString);
        const employeeId = user.employeeNumber || user.employeeId || user.id;

        if (employeeId) {
          // Safe to call once here — startTracking() internally no-ops
          // if BackgroundGeolocation is already running.
          await geofenceService.startTracking(employeeId);

          // TEMP DEBUG — remove after diagnosing the cold-start flag issue.
          const __keys = await AsyncStorage.getAllKeys();
          console.log('[DEBUG] ALL KEYS:', __keys);
          const __raw = await AsyncStorage.getItem('isInsideOfficeGeofence');
          console.log('[DEBUG] RAW isInsideOfficeGeofence:', JSON.stringify(__raw));
        }

        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.log('[AppNavigator] Auto Login Error:', error);
      setIsLoggedIn(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#ffffff',
        }}>
        <ActivityIndicator size="large" color="#D96A17" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLoggedIn ? (
        <Stack.Screen
          name="Main"
          component={BottomTabs}
          options={{ animation: 'fade' }}
        />
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ animation: 'fade' }}
        />
      )}
    </Stack.Navigator>
  );
}