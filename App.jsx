import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';

// MUST run at module scope (not inside a component/useEffect) — this is
// what lets Android wake a headless JS context and run geofence callbacks
// even when the app process has been fully killed.
import {registerHeadlessTask} from './src/services/geofence.service';
registerHeadlessTask();

export default function App() {
  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}