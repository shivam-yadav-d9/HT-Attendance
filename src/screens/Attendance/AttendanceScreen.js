// src/screens/Attendance/AttendanceScreen.js
//
// FIX (this version):
//   Previous version derived "checked in" status from the daily history
//   aggregate (`oldestCheckIn` / `latestCheckOut`), and ONLY re-read the
//   `isInsideOfficeGeofence` flag inside the ATTENDANCE_UPDATED_EVENT
//   listener. If a transition's API call failed (see geofence.service.js
//   fix), the event either didn't fire the way the UI expected or fired
//   with stale data, and the screen stayed wrong until the next
//   successful transition.
//
//   Fix: `isInsideOfficeGeofence` is now the single source of truth for
//   live status (matching the fixed geofence.service.js, which commits
//   it from real GPS truth and never reverts it on API failure). The
//   screen also re-reads it on:
//     - mount
//     - every ATTENDANCE_UPDATED_EVENT
//     - app foreground (AppState)
//     - a 10s safety poll while screen is focused
//   so it can never silently go stale.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AppState,
    DeviceEventEmitter,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import attendanceService from '../../services/attendance.service';
import geofenceService, {
    ATTENDANCE_UPDATED_EVENT,
} from '../../services/geofence.service';

const KEY_INSIDE_OFFICE = 'isInsideOfficeGeofence';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatTime = dateString => {
    if (!dateString) return '--:--';
    return new Date(dateString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

const formatDate = dateString => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const computeLiveDuration = (todayAttendance, isCheckedIn, activeCheckIn) => {
    if (!isCheckedIn) {
        if (!todayAttendance) return '0h 0m';
        const mins = todayAttendance.totalDurationMinutes || 0;
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    const checkInISO = activeCheckIn || todayAttendance?.oldestCheckIn;
    if (!checkInISO) return '0h 0m 0s';

    const elapsedSec = Math.floor(
        (Date.now() - new Date(checkInISO).getTime()) / 1000,
    );
    const closedMins = todayAttendance?.totalDurationMinutes || 0;
    const totalSec = closedMins * 60 + elapsedSec;

    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}h ${m}m ${s}s`;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function AttendanceScreen() {
    const [attendanceHistory, setAttendanceHistory] = useState([]);
    const [visibleCount, setVisibleCount] = useState(10);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [todayAttendance, setTodayAttendance] = useState(null);
    const [liveDuration, setLiveDuration] = useState('0h 0m 0s');
    const [activeCheckIn, setActiveCheckIn] = useState(null);
    const [employeeInfo, setEmployeeInfo] = useState(null);
    // Single source of truth for "am I checked in right now" — driven by
    // the native geofence flag, NOT re-derived from the history aggregate.
    const [isInsideGeofence, setIsInsideGeofence] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastEvent, setLastEvent] = useState(null);

    // Keep latest values in refs so the 1s timer closure stays fresh
    // without needing to be torn down/recreated every render.
    const todayRef = useRef(todayAttendance);
    const activeCheckInRef = useRef(activeCheckIn);
    const isInsideRef = useRef(isInsideGeofence);
    useEffect(() => { todayRef.current = todayAttendance; }, [todayAttendance]);
    useEffect(() => { activeCheckInRef.current = activeCheckIn; }, [activeCheckIn]);
    useEffect(() => { isInsideRef.current = isInsideGeofence; }, [isInsideGeofence]);

    // ── Re-read the live geofence flag (source of truth for status) ──────────
    const syncGeofenceFlag = useCallback(async () => {
        try {
            const inside = (await AsyncStorage.getItem(KEY_INSIDE_OFFICE)) === 'true';
            setIsInsideGeofence(inside);

            const pending = await geofenceService.getPendingAction();
            setIsSyncing(!!pending);
        } catch (err) {
            console.error('[AttendanceScreen] geofence flag sync error:', err);
        }
    }, []);

    // ── Data loader (history only — does NOT drive live status anymore) ──────
    const loadAttendanceData = useCallback(async () => {
        try {
            setLoading(true);

            const userData = await AsyncStorage.getItem('userData');
            if (!userData) { setLoading(false); return; }

            const parsedUser = JSON.parse(userData);
            const employeeNumber = parsedUser.employeeNumber;
            setEmployeeInfo(parsedUser);
            if (!employeeNumber) { setLoading(false); return; }

            const response = await attendanceService.getAttendanceHistory(employeeNumber);

            if (response.success) {
                const history = response.data || [];
                setAttendanceHistory(history);

                const today = new Date().toISOString().split('T')[0];
                const todayRecord = history.find(a => a.date === today) || null;
                setTodayAttendance(todayRecord);

                // activeCheckIn time comes from history (for the duration
                // calc), but whether we're "checked in" comes from the
                // geofence flag — set separately in syncGeofenceFlag().
                if (isInsideRef.current) {
                    const checkInTime = todayRecord?.oldestCheckIn || null;
                    setActiveCheckIn(checkInTime);
                    setLiveDuration(computeLiveDuration(todayRecord, true, checkInTime));
                } else {
                    setActiveCheckIn(null);
                    setLiveDuration(computeLiveDuration(todayRecord, false, null));
                }
            }
        } catch (error) {
            console.error('[AttendanceScreen] load error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const refreshAll = useCallback(async () => {
        await syncGeofenceFlag();
        await loadAttendanceData();
    }, [syncGeofenceFlag, loadAttendanceData]);

    // ── Initial load ──────────────────────────────────────────────────────────
    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    // ── Subscribe to geofence events (check-in / check-out, incl. retry sync) ─
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            ATTENDANCE_UPDATED_EVENT,
            event => {
                setLastEvent(event?.type || null);
                refreshAll();
                setTimeout(() => setLastEvent(null), 4000);
            },
        );
        return () => sub.remove();
    }, [refreshAll]);

    // ── Re-sync on app foreground — covers the case where a transition or
    //    a retry happened in the background/killed state while screen was
    //    unmounted, so the UI doesn't show stale data when reopened. ──────────
    useEffect(() => {
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active') {
                refreshAll();
            }
        });
        return () => sub.remove();
    }, [refreshAll]);

    // ── Safety poll — catches any edge case where an event was missed
    //    (e.g. JS event emitter timing during a headless wakeup). Cheap:
    //    just an AsyncStorage read, not a network call, every 10s. ───────────
    useEffect(() => {
        const interval = setInterval(syncGeofenceFlag, 10000);
        return () => clearInterval(interval);
    }, [syncGeofenceFlag]);

    // ── Live timer ────────────────────────────────────────────────────────────
    useEffect(() => {
        let interval;
        if (isInsideGeofence) {
            interval = setInterval(() => {
                setLiveDuration(
                    computeLiveDuration(todayRef.current, true, activeCheckInRef.current),
                );
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isInsideGeofence]);

    const onRefresh = () => {
        setRefreshing(true);
        refreshAll();
    };

    // isInsideGeofence (live GPS truth) IS the checked-in status now —
    // no more OR-ing with a history-derived currentStatus.
    const isCheckedIn = isInsideGeofence;

    const statusColor = isCheckedIn ? '#10B981' : '#EF4444';
    const statusLabel = isCheckedIn ? 'Checked In' : 'Not In';

    const todayDisplayStatus = isCheckedIn
        ? 'Present'
        : todayAttendance?.latestCheckOut
            ? 'Present'
            : todayAttendance?.oldestCheckIn
                ? 'Present'
                : todayAttendance?.status || 'Absent';

    const sortedHistory = [...attendanceHistory].sort(
        (a, b) => new Date(b.date) - new Date(a.date),
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={['#D96A17']}
                />
            }
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTag}>ATTENDANCE HUB</Text>
                <Text style={styles.headerTitle}>My Dashboard</Text>
                <Text style={styles.headerSubtitle}>
                    Track attendance and office status
                </Text>
            </View>

            {/* Syncing banner — shows when a check-in/out is queued for retry */}
            {isSyncing && (
                <View style={styles.syncBanner}>
                    <Icon name="sync" size={16} color="#92400E" />
                    <Text style={styles.syncText}>
                        Syncing attendance with server…
                    </Text>
                </View>
            )}

            {/* Geofence event toast */}
            {lastEvent && (
                <View
                    style={[
                        styles.toastBanner,
                        { backgroundColor: lastEvent === 'CHECK_IN' ? '#D1FAE5' : '#FEF3C7' },
                    ]}
                >
                    <Icon
                        name={lastEvent === 'CHECK_IN' ? 'login' : 'logout'}
                        size={18}
                        color={lastEvent === 'CHECK_IN' ? '#065F46' : '#92400E'}
                    />
                    <Text
                        style={[
                            styles.toastText,
                            { color: lastEvent === 'CHECK_IN' ? '#065F46' : '#92400E' },
                        ]}
                    >
                        {lastEvent === 'CHECK_IN'
                            ? 'Auto checked-in — welcome to the office!'
                            : 'Auto checked-out — see you next time!'}
                    </Text>
                </View>
            )}

            {/* Stat cards */}
            <View style={styles.statsRow}>
                <View style={styles.statCard}>
                    <Icon name="access-time" size={24} color="#D96A17" />
                    <Text style={styles.statLabel}>Status</Text>
                    <Text style={[styles.statValue, { color: statusColor }]}>
                        {statusLabel}
                    </Text>
                </View>
                <View style={styles.statCard}>
                    <Icon name="calendar-today" size={24} color="#D96A17" />
                    <Text style={styles.statLabel}>Today</Text>
                    <Text style={styles.statValue}>
                        {new Date().toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                        })}
                    </Text>
                </View>
                <View style={styles.statCard}>
                    <Icon
                        name="location-on"
                        size={24}
                        color={isInsideGeofence ? '#10B981' : '#9CA3AF'}
                    />
                    <Text style={styles.statLabel}>Geofence</Text>
                    <Text
                        style={[
                            styles.statValue,
                            { color: isInsideGeofence ? '#10B981' : '#9CA3AF' },
                        ]}
                    >
                        {isInsideGeofence ? 'Active' : 'Inactive'}
                    </Text>
                </View>
            </View>

            {/* Today's Session */}
            <Text style={styles.sectionTitle}>Today's Session</Text>

            {todayAttendance || isCheckedIn ? (
                <View style={styles.sessionCard}>
                    <View style={styles.sessionHeader}>
                        <Text style={styles.sessionDate}>
                            {todayAttendance?.date || new Date().toISOString().split('T')[0]}
                        </Text>
                        <View
                            style={[
                                styles.statusPill,
                                { backgroundColor: isCheckedIn ? '#D1FAE5' : '#FEE2E2' },
                            ]}
                        >
                            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                            <Text style={[styles.statusPillText, { color: statusColor }]}>
                                {statusLabel}
                            </Text>
                        </View>
                    </View>

                    {/* Live timer block */}
                    <View style={styles.durationBlock}>
                        <Icon name="timer" size={20} color="#D96A17" />
                        <Text style={styles.durationLabel}>
                            {isCheckedIn ? 'Time in office' : 'Total duration'}
                        </Text>
                        <Text style={styles.durationValue}>{liveDuration}</Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.sessionDetail}>
                        <Icon name="login" size={16} color="#6B7280" />
                        <Text style={styles.sessionLabel}>Check In</Text>
                        <Text style={styles.sessionValue}>
                            {isCheckedIn && activeCheckIn
                                ? formatTime(activeCheckIn)
                                : formatTime(todayAttendance?.oldestCheckIn)}
                        </Text>
                    </View>

                    <View style={styles.sessionDetail}>
                        <Icon
                            name="logout"
                            size={16}
                            color={isCheckedIn ? '#D1D5DB' : '#6B7280'}
                        />
                        <Text style={styles.sessionLabel}>Check Out</Text>
                        <Text
                            style={[
                                styles.sessionValue,
                                isCheckedIn && { color: '#9CA3AF' },
                            ]}
                        >
                            {isCheckedIn
                                ? 'Active session'
                                : todayAttendance?.latestCheckOut
                                    ? formatTime(todayAttendance.latestCheckOut)
                                    : '—'}
                        </Text>
                    </View>

                    <View style={styles.sessionDetail}>
                        <Icon name="repeat" size={16} color="#6B7280" />
                        <Text style={styles.sessionLabel}>Sessions</Text>
                        <Text style={styles.sessionValue}>
                            {todayAttendance?.totalSessions || 1}
                        </Text>
                    </View>

                    <View style={styles.sessionDetail}>
                        <Icon name="event-available" size={16} color="#6B7280" />
                        <Text style={styles.sessionLabel}>Day Status</Text>
                        <Text
                            style={[
                                styles.sessionValue,
                                {
                                    color: todayDisplayStatus === 'Present' ? '#10B981' : '#EF4444',
                                    fontWeight: '600',
                                },
                            ]}
                        >
                            {todayDisplayStatus}
                        </Text>
                    </View>
                </View>
            ) : (
                <View style={styles.emptyCard}>
                    <Icon name="event-busy" size={32} color="#D1D5DB" />
                    <Text style={styles.emptyText}>No attendance recorded today</Text>
                    <Text style={styles.emptySubText}>
                        Auto check-in activates when you enter the office
                    </Text>
                </View>
            )}

            {/* History */}
            {attendanceHistory.length > 0 && (
                <>
                    <Text style={styles.sectionTitle}>Recent History</Text>
                    {sortedHistory.slice(0, visibleCount).map((record, index) => {
                        const displayStatus = record.status || 'Present';
                        const isPresent = displayStatus === 'Present';
                        return (
                            <View key={index} style={styles.historyCard}>
                                <View style={styles.historyLeft}>
                                    <Text style={styles.historyDate}>
                                        {formatDate(record.date)}
                                    </Text>
                                    <Text style={styles.historyMeta}>
                                        {record.totalSessions || 1} session
                                        {(record.totalSessions || 1) !== 1 ? 's' : ''}
                                        {' · '}
                                        {formatTime(record.oldestCheckIn)}
                                        {record.latestCheckOut
                                            ? ` – ${formatTime(record.latestCheckOut)}`
                                            : ' – ongoing'}
                                    </Text>
                                </View>
                                <View style={styles.historyRight}>
                                    <View
                                        style={[
                                            styles.historyBadge,
                                            {
                                                backgroundColor: isPresent ? '#D1FAE5' : '#FEE2E2',
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.historyBadgeText,
                                                { color: isPresent ? '#065F46' : '#991B1B' },
                                            ]}
                                        >
                                            {displayStatus}
                                        </Text>
                                    </View>
                                    <Text style={styles.historyDuration}>
                                        {record.totalDurationFormatted || '0h 0m'}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}

                    {sortedHistory.length > visibleCount && (
                        <TouchableOpacity
                            style={styles.loadMoreBtn}
                            onPress={() => setVisibleCount(prev => prev + 10)}
                        >
                            <Icon name="expand-more" size={40} color="#D96A17" />
                            <Text style={styles.loadMoreText}>Show More</Text>
                        </TouchableOpacity>
                    )}
                </>
            )}

            <View style={{ height: 30 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F7FA' },
    header: {
        backgroundColor: '#0B2D52',
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerTag: {
        color: '#D96A17',
        fontWeight: '700',
        letterSpacing: 1,
        fontSize: 12,
    },
    headerTitle: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginTop: 8 },
    headerSubtitle: { color: '#D1D5DB', fontSize: 14, marginTop: 4 },

    syncBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 20,
        marginTop: 12,
        padding: 10,
        borderRadius: 10,
        backgroundColor: '#FEF3C7',
    },
    syncText: { fontSize: 12, fontWeight: '600', color: '#92400E' },

    toastBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 20,
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
    },
    toastText: { fontSize: 13, fontWeight: '600', flex: 1 },

    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 12,
    },
    statCard: {
        backgroundColor: '#fff',
        flex: 1,
        marginHorizontal: 5,
        padding: 10,
        borderRadius: 12,
        alignItems: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    statLabel: { fontSize: 12, color: '#6B7280', marginTop: 8 },
    statValue: {
        fontSize: 13,
        fontWeight: 'bold',
        marginTop: 4,
        textAlign: 'center',
    },

    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        marginHorizontal: 20,
        marginTop: 10,
        marginBottom: 10,
    },
    sessionCard: {
        backgroundColor: '#fff',
        marginHorizontal: 20,
        marginBottom: 15,
        borderRadius: 12,
        padding: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
    },
    sessionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    sessionDate: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusPillText: { fontSize: 13, fontWeight: '600' },
    durationBlock: {
        backgroundColor: '#FFF4EC',
        borderRadius: 10,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    durationLabel: { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '500' },
    durationValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#D96A17',
        fontVariant: ['tabular-nums'],
    },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 12 },
    sessionDetail: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
    },
    sessionLabel: { flex: 1, fontSize: 13, color: '#6B7280' },
    sessionValue: { fontSize: 13, fontWeight: '600', color: '#111827' },

    emptyCard: {
        backgroundColor: '#fff',
        marginHorizontal: 20,
        marginBottom: 15,
        borderRadius: 12,
        padding: 28,
        alignItems: 'center',
        elevation: 2,
    },
    emptyText: { fontSize: 15, fontWeight: '600', color: '#6B7280', marginTop: 12 },
    emptySubText: {
        fontSize: 13,
        color: '#9CA3AF',
        marginTop: 6,
        textAlign: 'center',
    },

    historyCard: {
        backgroundColor: '#fff',
        marginHorizontal: 20,
        marginBottom: 8,
        borderRadius: 10,
        padding: 14,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
    },
    historyLeft: { flex: 1, gap: 4 },
    historyDate: { fontSize: 14, fontWeight: '600', color: '#111827' },
    historyMeta: { fontSize: 12, color: '#9CA3AF' },
    historyRight: { alignItems: 'flex-end', gap: 6 },
    historyBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    historyBadgeText: { fontSize: 12, fontWeight: '600' },
    historyDuration: { fontSize: 12, color: '#6B7280', fontWeight: '500' },

    loadMoreBtn: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
    loadMoreText: { color: '#D96A17', fontWeight: '600' },
});