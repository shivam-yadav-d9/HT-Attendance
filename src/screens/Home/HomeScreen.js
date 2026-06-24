// src/screens/Home/HomeScreen.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import dashboardService from '../../services/dashboard.service';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(value || 0);
}

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [employeeNumber, setEmployeeNumber] = useState(null);
  const [userName, setUserName] = useState('Employee');

  const [data, setData] = useState({
    monthlyTarget: 0,
    monthlyAchieved: 0,
    yesterdayTarget: 0,
    yesterdayAchieved: 0,
  });

  useEffect(() => {
    loadDashboard();
    getUserName();
  }, []);

  const getUserName = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const parsedData = JSON.parse(userData);
        const name = parsedData.name || 'Employee';
        setUserName(name);
        setEmployeeNumber(parsedData.employeeNumber || parsedData._id || null);
      }
    } catch (error) {
      console.error('Error getting user name:', error);
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const userData = await AsyncStorage.getItem('userData');
      if (!userData) {
        setError('User data not found. Please login again.');
        setLoading(false);
        return;
      }

      const parsedUser = JSON.parse(userData);
      const empNum = parsedUser.employeeNumber;
      
      if (!empNum) {
        setError('Employee number not found. Please login again.');
        setLoading(false);
        return;
      }

      const response = await dashboardService.getEmployeeDashboard(empNum);

      if (response && response.success) {
        setData(response.data || {
          monthlyTarget: 0,
          monthlyAchieved: 0,
          yesterdayTarget: 0,
          yesterdayAchieved: 0,
        });
      } else {
        setError(response?.message || 'Failed to load dashboard data');
      }
    } catch (error) {
      console.error('Dashboard Error:', error);
      setError(error.message || 'Failed to load dashboard. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const retryLoad = () => {
    loadDashboard();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D86A16" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle-outline" size={50} color="#D86A16" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={retryLoad}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <Text style={styles.empInfo}>
          Employee ID: {employeeNumber || 'Not available'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D86A16']} />
      }
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.blobRight} />
        <View style={styles.blobLeft} />

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Icon name="person-outline" size={28} color="#fff" />
            <View style={styles.avatarBadge}>
              <Icon name="sparkles" size={8} color="#fff" />
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.name}>{userName}</Text>

            <View style={styles.badgeRow}>
              <View style={styles.staffBadge}>
                <Text style={styles.staffText}>STORE STAFF</Text>
              </View>
              {employeeNumber && (
                <View style={[styles.staffBadge, { backgroundColor: '#4A6FA5' }]}>
                  <Text style={styles.staffText}>ID: {employeeNumber}</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.notification}>
            <Icon name="notifications-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* DASHBOARD CARDS */}
      <View style={styles.metricsSection}>
        {/* Row 1 */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconContainer, { backgroundColor: '#FFF5EC' }]}>
              <Icon name="flag-outline" size={20} color="#D86A16" />
            </View>
            <Text style={styles.metricLabel}>Monthly Target</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.monthlyTarget)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconContainer, { backgroundColor: '#ECF9F0' }]}>
              <Icon name="trophy-outline" size={20} color="#1A5C3A" />
            </View>
            <Text style={styles.metricLabel}>Monthly Achieved</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.monthlyAchieved)}
            </Text>
          </View>
        </View>

        {/* Row 2 */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconContainer, { backgroundColor: '#ECF3FA' }]}>
              <Icon name="calendar-outline" size={20} color="#4A6FA5" />
            </View>
            <Text style={styles.metricLabel}>Yesterday Target</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.yesterdayTarget)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconContainer, { backgroundColor: '#FFF5EC' }]}>
              <Icon name="checkmark-circle-outline" size={20} color="#D86A16" />
            </View>
            <Text style={styles.metricLabel}>Yesterday Achieved</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.yesterdayAchieved)}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFE6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5EFE6',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5EFE6',
    padding: 20,
  },
  errorText: {
    marginTop: 10,
    color: '#D86A16',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  empInfo: {
    color: '#666',
    fontSize: 12,
    marginTop: 5,
  },
  retryButton: {
    backgroundColor: '#D86A16',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 15,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  header: {
    backgroundColor: '#0F2D52',
    paddingTop: 55,
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  blobRight: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(100,60,20,0.45)',
    top: -20,
    right: -25,
  },
  blobLeft: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(80,40,10,0.3)',
    top: 55,
    right: 35,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: '#D86A16',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0F2D52',
  },
  greeting: {
    color: '#D5DCE5',
    fontSize: 12,
  },
  name: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 6,
  },
  staffBadge: {
    backgroundColor: '#D86A16',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
  },
  staffText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 10,
  },
  notification: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricsSection: {
    marginHorizontal: 14,
    marginTop: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  metricIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F7F9FC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
});