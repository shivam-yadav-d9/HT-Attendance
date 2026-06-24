// src/services/location.service.js
//
// Manages foreground location permissions and a live position watcher.
// Used by UI screens that want to show distance to office or react
// to position changes while the app is open.
//
// For background / killed-app geofencing use geofence.service.js instead.
//
// Dependencies:
//   npm install @react-native-community/geolocation
//   (or react-native-geolocation-service for better Android accuracy)
//
// Android AndroidManifest.xml:
//   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
//   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
//   <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
//
// iOS Info.plist:
//   NSLocationWhenInUseUsageDescription
//   NSLocationAlwaysAndWhenInUseUsageDescription

import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { getDistanceMeters } from './geofence.service';

// ─── Constants ───────────────────────────────────────────────────────────────
import { OFFICE_LOCATION } from '../utils/location';
export const LOCATION_UPDATED_EVENT = 'LOCATION_UPDATED';

// ─── Module state ────────────────────────────────────────────────────────────
let _watcherId = null;
let _lastCoords = null;

// ─── Permission helpers ───────────────────────────────────────────────────────
const requestAndroidPermissions = async () => {
    // Request foreground first, then background (Android 11+ requires two steps)
    const fgResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
            title: 'Location Permission',
            message:
                'Karmyogi needs your location to auto check-in when you arrive at the office.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'Allow',
        },
    );

    if (fgResult !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
    }

    // Background location (Android 10+)
    if (Platform.Version >= 29) {
        const bgResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
            {
                title: 'Background Location',
                message:
                    'Allow Karmyogi to track your location in the background for automatic check-in / check-out even when the app is closed.',
                buttonNeutral: 'Ask Me Later',
                buttonNegative: 'Deny',
                buttonPositive: 'Allow',
            },
        );

        // Background denied is not fatal — foreground geofence still works
        if (bgResult !== PermissionsAndroid.RESULTS.GRANTED) {
            console.warn(
                '[LocationService] Background location denied — geofence only works while app is open.',
            );
        }
    }

    return true;
};

const locationService = {
    /**
     * Request all required location permissions.
     * Returns true if at least foreground permission is granted.
     */
    requestPermissions: async () => {
        if (Platform.OS === 'android') {
            return requestAndroidPermissions();
        }
        // iOS: permission is requested automatically on first Geolocation call
        return true;
    },

    /**
     * Get the device's current position once.
     * Returns { latitude, longitude, accuracy } or throws.
     */
    getCurrentLocation: () =>
        new Promise((resolve, reject) => {
            Geolocation.getCurrentPosition(
                pos => resolve(pos.coords),
                err => reject(err),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
            );
        }),

    /**
     * Start a continuous foreground location watcher.
     * Emits LOCATION_UPDATED_EVENT with { coords, distanceToOffice } payloads.
     * Safe to call multiple times — stops any existing watcher first.
     */
    startWatching: (onUpdate, onError) => {
        locationService.stopWatching();

        _watcherId = Geolocation.watchPosition(
            pos => {
                _lastCoords = pos.coords;
                const { latitude, longitude } = pos.coords;

                const distanceToOffice = getDistanceMeters(
                    latitude,
                    longitude,
                    OFFICE_LOCATION.latitude,
                    OFFICE_LOCATION.longitude,
                );

                console.log('========================');
                console.log('Current Latitude :', latitude);
                console.log('Current Longitude:', longitude);
                console.log('Office Latitude  :', OFFICE_LOCATION.latitude);
                console.log('Office Longitude :', OFFICE_LOCATION.longitude);
                console.log('Distance (m)     :', distanceToOffice);
                console.log('========================');

                const payload = {
                    coords: pos.coords,
                    distanceToOffice,
                };
                DeviceEventEmitter.emit(LOCATION_UPDATED_EVENT, payload);
                if (onUpdate) onUpdate(payload);
            },
            err => {
                console.warn('[LocationService] watch error:', err?.message);
                if (onError) onError(err);
            },
            {
                enableHighAccuracy: true,
                distanceFilter: 10, // emit every 10 m of movement
                interval: 5000, // Android: minimum 5 s between updates
                fastestInterval: 3000,
                useSignificantChanges: false, // iOS
            },
        );

        return _watcherId;
    },

    /** Stop the active foreground watcher. */
    stopWatching: () => {
        if (_watcherId !== null) {
            Geolocation.clearWatch(_watcherId);
            _watcherId = null;
        }
    },

    /** Last known coords (may be null before first fix). */
    getLastCoords: () => _lastCoords,

    /**
     * Utility: compute distance from last known position to office.
     * Returns null if position not yet available.
     */
    distanceToOffice: () => {
        if (!_lastCoords) return null;

        const { latitude, longitude } = _lastCoords;

        return getDistanceMeters(
            latitude,
            longitude,
            OFFICE_LOCATION.latitude,
            OFFICE_LOCATION.longitude,
        );
    },

    OFFICE_LAT: OFFICE_LOCATION.latitude,
    OFFICE_LNG: OFFICE_LOCATION.longitude,
    LOCATION_UPDATED_EVENT,
};

export default locationService;