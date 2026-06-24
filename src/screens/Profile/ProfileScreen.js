// src/screens/Profile/ProfileScreen.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import geofenceService from '../../services/geofence.service';
import { CommonActions, useNavigation, useNavigationContainerRef } from '@react-navigation/native';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const data = await AsyncStorage.getItem('userData');
      if (data) setUserData(JSON.parse(data));
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            // Stop geofence tracking
            try {
              await geofenceService.stopTracking();
            } catch (stopError) {
              console.warn('stopTracking failed (non-fatal):', stopError);
            }

            // Clear all user data
            await AsyncStorage.multiRemove([
              'userToken',
              'userData',
              'savedCredentials',
              'bgTaskWasInside',
              'bgActiveSession',
            ]);

            // ✅ FIX: Use navigation.reset directly without getParent()
            // This works because we're using the hook from the root navigator
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
            
          } catch (error) {
            console.error('Logout error:', error);
            Alert.alert('Error', 'Failed to logout. Please try again.');
          }
        },
      },
    ]);
  };

  if (!userData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userData.name ? userData.name.charAt(0).toUpperCase() : 'U'}
            </Text>
          </View>
          <Text style={styles.userName}>{userData.name || 'User'}</Text>
          <Text style={styles.userRole}>{userData.role || 'Employee'}</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Personal Information</Text>

        <View style={styles.infoItem}>
          <Icon name="badge" size={20} color="#D96A17" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Employee Number</Text>
            <Text style={styles.infoValue}>
              {userData.employeeNumber || userData._id || 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="email" size={20} color="#D96A17" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{userData.email || 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="phone" size={20} color="#D96A17" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{userData.phone || 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="work" size={20} color="#D96A17" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Department</Text>
            <Text style={styles.infoValue}>
              {userData.department || userData.role || 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="location-on" size={20} color="#D96A17" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>{userData.location || 'N/A'}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Icon name="logout" size={24} color="#fff" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#F5F7FA' 
  },
  loadingText: { color: '#666', fontSize: 14 },
  header: {
    backgroundColor: '#0F2D52',
    paddingTop: 60,
    paddingBottom: 30,
    alignItems: 'center',
  },
  avatarContainer: { alignItems: 'center' },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D96A17',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarText: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  userRole: { fontSize: 14, color: '#D1D5DB' },
  infoSection: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#111827', 
    marginBottom: 15 
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoContent: { marginLeft: 12, flex: 1 },
  infoLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#111827', fontWeight: '500' },
  logoutButton: {
    backgroundColor: '#EF4444',
    margin: 15,
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});