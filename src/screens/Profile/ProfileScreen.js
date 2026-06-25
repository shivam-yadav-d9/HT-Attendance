// src/screens/Profile/ProfileScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import geofenceService from '../../services/geofence.service';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              // Stop geofence tracking on logout - with error handling
              try {
                if (geofenceService && typeof geofenceService.stopTracking === 'function') {
                  await geofenceService.stopTracking();
                }
              } catch (geoError) {
                console.warn('Geofence stop error (non-critical):', geoError);
              }

              // Clear all user data
              await AsyncStorage.clear();



              // Navigation will be handled by AppNavigator
              // The app will automatically redirect to login screen
            } catch (error) {
              console.error('Logout error:', error);
              // Even if there's an error, try to clear storage
              try {
                await AsyncStorage.multiRemove([
                  'userToken',
                  'userData',
                  'savedCredentials',
                  'employeeNumber',
                ]);
              } catch (clearError) {
                console.error('Error clearing storage:', clearError);
              }
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D96A17" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
        </View>
        <Text style={styles.name}>{user?.name || 'N/A'}</Text>
        <Text style={styles.designation}>
          {user?.jobTitle || user?.role || 'Employee'}
        </Text>
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: user?.isActive ? '#10B981' : '#EF4444' },
            ]}
          />
          <Text style={styles.statusText}>
            {user?.isActive ? 'ACTIVE' : 'INACTIVE'}
          </Text>
        </View>
      </View>

      {/* Store & Manager Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Store & Manager</Text>
        <InfoRow
          icon="storefront"
          label="STORE"
          value={user?.location || user?.employeeLocationSAP || 'N/A'}
        />
        <InfoRow
          icon="location-on"
          label="STORE CODE · REGION"
          value={`${user?.siteCode || 'N/A'} · ${user?.city || 'N/A'}`}
        />
        <InfoRow
          icon="business"
          label="CITY · STATE"
          value={`${user?.city || 'N/A'} · ${user?.state || 'N/A'}`}
        />
        <InfoRow
          icon="people"
          label="REPORTING MANAGER"
          value={user?.reportingTo || 'N/A'}
        />
        <InfoRow
          icon="email"
          label="MANAGER EMAIL"
          value={user?.reportingManagerEmail || 'N/A'}
        />
      </View>

      {/* Employee Details Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Employee Details</Text>
        <InfoRow
          icon="credit-card"
          label="EMPLOYEE CODE"
          value={user?.employeeNumber || user?._id || 'N/A'}
        />
        <InfoRow
          icon="phone"
          label="MOBILE"
          value={user?.phone?.toString() || 'N/A'}
        />
        <InfoRow
          icon="email"
          label="EMAIL"
          value={user?.email || 'N/A'}
        />
        <InfoRow
          icon="business"
          label="DEPARTMENT"
          value={user?.department || 'N/A'}
        />
        <InfoRow
          icon="work"
          label="DESIGNATION"
          value={user?.jobTitle || user?.role || 'N/A'}
        />
        <InfoRow
          icon="calendar-today"
          label="JOINING DATE"
          value={formatDate(user?.dateJoined)}
        />
      </View>

      {/* Additional Details Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Additional Information</Text>
        <InfoRow
          icon="location-on"
          label="LOCATION"
          value={user?.employeeLocationSAP || user?.location || 'N/A'}
        />
        <InfoRow
          icon="trending-up"
          label="BAND"
          value={user?.band || 'N/A'}
        />
        <InfoRow
          icon="person"
          label="WORKER TYPE"
          value={user?.workerType || 'N/A'}
        />
        <InfoRow
          icon="check-circle"
          label="EMPLOYMENT STATUS"
          value={user?.employmentStatus || 'N/A'}
        />
        <InfoRow
          icon="home"
          label="FORMAT"
          value={user?.format || 'N/A'}
        />
        <InfoRow
          icon="layers"
          label="SUB FORMAT"
          value={user?.subFormat || 'N/A'}
        />
        <InfoRow
          icon="apps"
          label="FUNCTIONS"
          value={user?.functions || 'N/A'}
        />
        <InfoRow
          icon="tune"
          label="SUB FUNCTION"
          value={user?.subFunction || 'N/A'}
        />
        <InfoRow
          icon="map"
          label="EMPLOYEE ZONE"
          value={user?.employeeZone || 'N/A'}
        />
        <InfoRow
          icon="attach-money"
          label="COST CENTER NO"
          value={user?.costCenterNo || 'N/A'}
        />
        <InfoRow
          icon="description"
          label="COST CENTER DESCRIPTION"
          value={user?.costCenterDescription || 'N/A'}
        />
      </View>

      {/* Quick Access */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Access</Text>
        <View style={styles.quickAccessRow}>
          <TouchableOpacity
            style={styles.quickAccessBtn}
            onPress={() => navigation.navigate('Home')}
          >
            <Icon name="home" size={24} color="#D96A17" />
            <Text style={styles.quickAccessText}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAccessBtn}
            onPress={() => navigation.navigate('Attendance')}
          >
            <Icon name="calendar-today" size={24} color="#D96A17" />
            <Text style={styles.quickAccessText}>Attend</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Icon name="logout" size={20} color="#fff" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// Helper component for info rows
function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.iconBox}>
        <Icon name={icon} size={18} color="#0F2D52" />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || 'N/A'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3EEE8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3EEE8',
  },
  header: {
    backgroundColor: '#0F2D52',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#E67821',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 'bold',
  },
  name: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 15,
  },
  designation: {
    color: '#D7DFEA',
    fontSize: 15,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F2D52',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF3F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
    width: 110,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
    flex: 1,
    textAlign: 'right',
  },
  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  quickAccessBtn: {
    alignItems: 'center',
    padding: 12,
    minWidth: 70,
  },
  quickAccessText: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C0392B',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  logoutText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});