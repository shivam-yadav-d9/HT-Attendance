import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

import Icon from 'react-native-vector-icons/MaterialIcons';

import HomeScreen from '../screens/Home/HomeScreen';
import AttendanceScreen from '../screens/Attendance/AttendanceScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,

        tabBarIcon: ({color, size}) => {
          let icon = 'home';

          if (route.name === 'Home') icon = 'home';
          if (route.name === 'Attendance') icon = 'location-on';
          if (route.name === 'Profile') icon = 'person';

          return <Icon name={icon} size={size} color={color} />;
        },
      })}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}