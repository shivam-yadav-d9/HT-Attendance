// src/navigation/AppNavigator.js

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from '../screens/Auth/LoginScreen';
import BottomTabs from './BottomTabs';
import geofenceService from '../services/geofence.service';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const checkLogin = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userString = await AsyncStorage.getItem('userData');

      if (token && userString) {
        const user = JSON.parse(userString);

        // Auto start geofence after app restart
        try {
          const employeeId =
            user.employeeNumber ||
            user.employeeId ||
            user.id;

          if (employeeId) {
            await geofenceService.startTracking(employeeId);
          }
        } catch (e) {
          console.log('[AppNavigator] Geofence already started');
        }

        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.log('[AppNavigator] Login Check Error:', error);
      setIsLoggedIn(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial login check
    checkLogin();

    // Keep checking login status every second
    const interval = setInterval(() => {
      checkLogin();
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

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