// src/services/geofence.service.js
//
// Auto check-in / check-out via NATIVE geofencing.
// Location: react-native-background-geolocation (Transistor Software)
// Notifications: @notifee/react-native
//
// Why this instead of react-native-background-actions:
//   - Geofence transitions are detected by the OS itself (Android
//     GeofencingClient / iOS CLCircularRegion), NOT by JS polling.
//   - Transitions fire even after the app process is fully killed —
//     Android wakes a headless JS context just long enough to run
//     your onGeofence callback, then lets the process die again.
//   - stopOnTerminate:false + startOnBoot:true means tracking survives
//     "swipe to close" and device reboot, with zero user action needed.
//
// Install (bare RN CLI):
//   npm install react-native-background-geolocation
//   npm install @notifee/react-native
//   npm install react-native-permissions
//
// Then relink native code:
//   cd android && ./gradlew clean && cd ..
//   npx react-native run-android
//
// License: react-native-background-geolocation is free for development
// and ALL debug builds. A license key is only required for Android
// RELEASE builds — see android/app/src/main/AndroidManifest.xml notes
// at the bottom of this file.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, Platform } from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import attendanceService from './attendance.service';
import {
    OFFICE_LOCATION,
    CHECKIN_RADIUS_M,
    CHECKOUT_RADIUS_M,
    calculateDistance,
} from '../utils/location';

// ─── Constants ────────────────────────────────────────────────────────────────
const OFFICE_GEOFENCE_ID = 'OFFICE_MAIN';
export const ATTENDANCE_UPDATED_EVENT = 'ATTENDANCE_UPDATED';

const KEY_EMPLOYEE_ID = 'bgEmployeeId';
const KEY_OPEN_SESSION = 'openAttendanceSession'; // survives cold start
const KEY_INSIDE_OFFICE = 'isInsideOfficeGeofence'; // survives cold start
const NOTIFICATION_CHANNEL_ID = 'attendance-tracking';

// Fixed notification IDs so re-displaying with the same id UPDATES the
// existing notification in place instead of stacking duplicates.
const NOTIF_ID_STATUS = 'attendance-status-notif';
const NOTIF_ID_TRANSITION = 'attendance-transition-notif';

const sleep = ms => new Promise(r => setTimeout(r, ms));

let startPromise = null;
let isStarting = false;

// ─── Persisted state (readable from headless / killed-app context) ────────────
const readOpenSession = async () => {
    try {
        const raw = await AsyncStorage.getItem(KEY_OPEN_SESSION);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeOpenSession = async session => {
    try {
        if (session) await AsyncStorage.setItem(KEY_OPEN_SESSION, JSON.stringify(session));
        else await AsyncStorage.removeItem(KEY_OPEN_SESSION);
    } catch { }
};

const readIsInside = async () => {
    try {
        return (await AsyncStorage.getItem(KEY_INSIDE_OFFICE)) === 'true';
    } catch {
        return false;
    }
};

const writeIsInside = async v => {
    try {
        await AsyncStorage.setItem(KEY_INSIDE_OFFICE, v ? 'true' : 'false');
    } catch { }
};

export const readCachedActiveSession = readOpenSession;
export const clearCachedActiveSession = () => writeOpenSession(null);

// ─── Notifee setup ──────────────────────────────────────────────────────────────
let _channelReady = false;

const ensureNotificationChannel = async () => {
    if (Platform.OS !== 'android' || _channelReady) return;
    await notifee.createChannel({
        id: NOTIFICATION_CHANNEL_ID,
        name: 'Attendance Tracking',
        importance: AndroidImportance.DEFAULT,
        visibility: AndroidVisibility.PUBLIC,
        vibration: true,
        lights: true,
        lightColor: '#D96A17',
    });
    _channelReady = true;
};

const requestNotificationPermission = async () => {
    // notifee.requestPermission() handles both the iOS prompt and the
    // Android 13+ POST_NOTIFICATIONS runtime permission in one call.
    await notifee.requestPermission();
};

/** Heads-up alert fired exactly at the moment of check-in/check-out. */
const fireTransitionAlert = async type => {
    const isCheckIn = type === 'CHECK_IN';
    await notifee.displayNotification({
        id: NOTIF_ID_TRANSITION,
        title: isCheckIn ? '✅ Checked in' : '👋 Checked out',
        body: isCheckIn
            ? 'Auto check-in recorded — welcome to the office!'
            : 'Auto check-out recorded — see you next time.',
        android: {
            channelId: NOTIFICATION_CHANNEL_ID,
            importance: AndroidImportance.HIGH, // heads-up popup
            pressAction: { id: 'default' },
            smallIcon: 'ic_launcher', // must exist in android/app/src/main/res/mipmap-*
        },
    });
};

/**
 * The persistent, continuously-updated status notification.
 * Re-displaying with the same `id` updates it in place rather than
 * stacking duplicates — this is what gives the "live" distance readout.
 */
const updateStatusNotification = async ({ isInside, distanceM }) => {
    await notifee.displayNotification({
        id: NOTIF_ID_STATUS,
        title: isInside ? '🟢 Inside office geofence' : '⚪ Tracking attendance',
        body: isInside
            ? 'Auto check-in is active for this visit.'
            : distanceM != null
                ? `${Math.round(distanceM)}m from office — will auto check-in on arrival.`
                : 'Waiting for location fix…',
        android: {
            channelId: NOTIFICATION_CHANNEL_ID,
            ongoing: true, // not swipe-dismissable, like a foreground-service notif
            autoCancel: false,
            importance: AndroidImportance.DEFAULT, // quiet — no sound/heads-up on every GPS tick
            smallIcon: 'ic_launcher',
            color: '#D96A17',
        },
    });
};

// ─── Core transition handler — runs in foreground, background, AND killed-app headless context ──
const handleGeofenceTransition = async (employeeId, action, coords) => {
    const wasInside = await readIsInside();

    if (action === 'ENTER' && !wasInside) {
        await writeIsInside(true);
        await AsyncStorage.setItem(
            'isInsideOfficeGeofence',
            'true',
        );

        const result = await attendanceService.checkIn(
            employeeId,
            String(coords.latitude),
            String(coords.longitude),
        );

        if (result?.success) {
            const session = result.data?.attendance || { checkInTime: new Date().toISOString() };
            await writeOpenSession(session);
            await fireTransitionAlert('CHECK_IN');
            await updateStatusNotification({ isInside: true });
            await sleep(1500);
            DeviceEventEmitter.emit(ATTENDANCE_UPDATED_EVENT, { type: 'CHECK_IN', session });
        } else {
            // API failed — revert so the next ENTER (or a retry tick) tries again
            await writeIsInside(false);
        }
    } else if (action === 'EXIT' && wasInside) {
        await writeIsInside(false);
        await AsyncStorage.setItem(
            'isInsideOfficeGeofence',
            'false',
        );

        const result = await attendanceService.checkOut(
            employeeId,
            String(coords.latitude),
            String(coords.longitude),
        );

        if (result?.success) {
            await writeOpenSession(null);
            await fireTransitionAlert('CHECK_OUT');
            await updateStatusNotification({ isInside: false, distanceM: null });
            await sleep(1500);
            DeviceEventEmitter.emit(ATTENDANCE_UPDATED_EVENT, {
                type: 'CHECK_OUT',
                attendance: result.data?.attendance || null,
            });
        } else {
            await writeIsInside(true);
        }
    }
    // ENTER while already inside, or EXIT while already outside → no-op
    // (prevents duplicate API calls if the OS re-fires a transition)
};

// ─── SDK wiring ───────────────────────────────────────────────────────────────
let _listenersAttached = false;

const attachListeners = () => {
    if (_listenersAttached) return;
    _listenersAttached = true;

    // Fires on ENTER / EXIT / DWELL for any monitored geofence, including
    // from the killed-app headless context on Android.
    BackgroundGeolocation.onGeofence(async event => {
        try {
            const employeeId =
                event?.extras?.employeeId || (await AsyncStorage.getItem(KEY_EMPLOYEE_ID));
            if (!employeeId) return;
            if (event.identifier !== OFFICE_GEOFENCE_ID) return;
            if (event.action !== 'ENTER' && event.action !== 'EXIT') return;

            await handleGeofenceTransition(employeeId, event.action, event.location.coords);
        } catch (err) {
            console.warn('[GeofenceService] onGeofence handler error:', err?.message);
        }
    });

    // Live location stream — used ONLY to keep the status notification's
    // distance readout fresh while outside the geofence. Does not drive
    // check-in/out logic (the native geofence transition does that).
    BackgroundGeolocation.onLocation(async location => {
        try {
            const isInside = await readIsInside();
            if (isInside) return; // status notif already says "inside"
            const { latitude, longitude } = location.coords;
            const distanceM = calculateDistance(
                latitude, longitude,
                OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude,
            );
            await updateStatusNotification({ isInside: false, distanceM });
        } catch (err) {
            console.warn('[GeofenceService] onLocation handler error:', err?.message);
        }
    });

    BackgroundGeolocation.onProviderChange(event => {
        console.log('[GeofenceService] provider change:', event);
    });
};

// Registers the JS callback that Android invokes when it wakes the app
// in a headless context (process was fully killed). Required for
// onGeofence/onLocation above to fire when the app isn't running.
// Call once, top-level, from index.js / App.jsx — see bottom of file.
export const registerHeadlessTask = () => {
    BackgroundGeolocation.registerHeadlessTask(async event => {
        attachListeners(); // listeners must be (re)attached in this fresh JS context too
        if (event.name === 'geofence') {
            const employeeId =
                event.params?.extras?.employeeId || (await AsyncStorage.getItem(KEY_EMPLOYEE_ID));
            if (!employeeId) return;
            if (event.params.identifier !== OFFICE_GEOFENCE_ID) return;
            await handleGeofenceTransition(employeeId, event.params.action, event.params.location.coords);
        }
    });
};

// ─── Public API ───────────────────────────────────────────────────────────────
const geofenceService = {
    /**
     * One-time SDK init + start tracking. Call right after successful login,
     * and also on app boot if a session already exists (see App.jsx).
     */
    startTracking: async employeeId => {

        if (!employeeId) {
            console.warn('[GeofenceService] no employeeId');
            return false;
        }

        // Prevent multiple simultaneous startTracking() calls
        if (isStarting && startPromise) {
            console.log('[GeofenceService] start already in progress');
            return startPromise;
        }

        // Already running? Just return.
        try {
            const state = await BackgroundGeolocation.getState();
            if (state.enabled) {
                console.log('[GeofenceService] already running');
                return true;
            }
        } catch (e) {
            // ignore
        }

        isStarting = true;

        startPromise = (async () => {

            try {
                await AsyncStorage.setItem(KEY_EMPLOYEE_ID, String(employeeId));
            } catch (e) { }

            await ensureNotificationChannel();
            await requestNotificationPermission();

            attachListeners();

            await BackgroundGeolocation.ready({

                // Geofence
                geofenceProximityRadius: 1000,
                geofenceInitialTriggerEntry: true,

                // Location
                desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
                distanceFilter: 5,
                stopTimeout: 5,

                // Background
                stopOnTerminate: false,
                startOnBoot: true,
                enableHeadless: true,

                // Foreground service
                foregroundService: true,

                notification: {
                    title: 'Karmyogi Attendance',
                    text: 'Tracking your location for auto check-in / check-out',
                    channelId: NOTIFICATION_CHANNEL_ID,
                },

                debug: __DEV__,
                logLevel: __DEV__
                    ? BackgroundGeolocation.LOG_LEVEL_VERBOSE
                    : BackgroundGeolocation.LOG_LEVEL_ERROR,

                reset: false,
            });

            // Remove existing geofence if already present
            try {
                await BackgroundGeolocation.removeGeofence(
                    OFFICE_GEOFENCE_ID,
                );
            } catch (e) {
                // ignore
            }

            // Register office geofence
            await BackgroundGeolocation.addGeofence({
                identifier: OFFICE_GEOFENCE_ID,
                radius: CHECKIN_RADIUS_M,
                latitude: OFFICE_LOCATION.latitude,
                longitude: OFFICE_LOCATION.longitude,
                notifyOnEntry: true,
                notifyOnExit: true,
                notifyOnDwell: false,
                loiteringDelay: 0,
                extras: {
                    employeeId,
                },
            });

            await BackgroundGeolocation.startGeofences();

            await updateStatusNotification({
                isInside: await readIsInside(),
            });

            console.log('[GeofenceService] Tracking Started');

            return true;

        })();

        try {
            return await startPromise;
        } finally {
            isStarting = false;
            startPromise = null;
        }
    },

    /** Stop tracking and clean up. Call on logout. */
    stopTracking: async () => {
        try {
            await BackgroundGeolocation.removeGeofence(OFFICE_GEOFENCE_ID);
            await BackgroundGeolocation.stop();
        } catch (err) {
            console.warn('[GeofenceService] stop error:', err?.message);
        }
        await writeIsInside(false);
        await writeOpenSession(null);
        try {
            await AsyncStorage.removeItem(KEY_EMPLOYEE_ID);
        } catch { }
        try {
            await notifee.cancelNotification(NOTIF_ID_STATUS);
        } catch { }
    },

    isRunning: async () => {
        try {
            const state = await BackgroundGeolocation.getState();
            return !!state.enabled;
        } catch {
            return false;
        }
    },

    ATTENDANCE_UPDATED_EVENT,
};

export default geofenceService;

/*
─── AndroidManifest.xml changes needed (android/app/src/main/AndroidManifest.xml) ──

Inside <manifest> tag, alongside any permissions you already have:
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>

react-native-background-geolocation auto-merges most of its own native
manifest entries via its Gradle plugin — you generally do NOT need to
hand-add its service/receiver tags on RN CLI >= 0.71. If the build fails
with a manifest merge conflict, check node_modules/react-native-background-geolocation/android/src/main/AndroidManifest.xml
for the exact entries to reconcile.

─── android/app/build.gradle — license key (RELEASE builds only) ─────────────

Free for all DEBUG builds. For a signed release APK, add to
android/app/src/main/AndroidManifest.xml inside <application>:

  <meta-data
    android:name="com.transistorsoft.locationmanager.license"
    android:value="YOUR_LICENSE_KEY_HERE" />

Get the key from the Transistor customer dashboard after purchase.
Leave this meta-data tag OUT entirely for debug/dev testing.

─── App.jsx changes needed ─────────────────────────────────────────────────────

At the very top, BEFORE the App component, outside any component body:

  import { registerHeadlessTask } from './src/services/geofence.service';
  registerHeadlessTask();

This must run on every JS bundle load — including the headless wakeup —
so put it at module scope in App.jsx (or index.js), never inside useEffect.

─── Rebuild after install ──────────────────────────────────────────────────────

  cd android
  ./gradlew clean
  cd ..
  npx react-native run-android
*/