// src/screens/Attendance/AttendanceScreen.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
    const [currentStatus, setCurrentStatus] = useState('CHECKED_OUT');
    const [liveDuration, setLiveDuration] = useState('0h 0m 0s');
    const [activeCheckIn, setActiveCheckIn] = useState(null);
    const [employeeInfo, setEmployeeInfo] = useState(null);
    const [isInsideGeofence, setIsInsideGeofence] = useState(false);
    const [lastEvent, setLastEvent] = useState(null);
    // Keep latest todayAttendance in a ref so the timer closure stays fresh
    const todayRef = useRef(todayAttendance);
    const activeCheckInRef = useRef(activeCheckIn);
    const currentStatusRef = useRef(currentStatus);
    useEffect(() => { todayRef.current = todayAttendance; }, [todayAttendance]);
    useEffect(() => { activeCheckInRef.current = activeCheckIn; }, [activeCheckIn]);
    useEffect(() => { currentStatusRef.current = currentStatus; }, [currentStatus]);

    // ── Initial load ──────────────────────────────────────────────────────────
    useEffect(() => {
        const loadData = async () => {
            await loadAttendanceData();

            const inside =
                (await AsyncStorage.getItem(
                    'isInsideOfficeGeofence',
                )) === 'true';

            setIsInsideGeofence(inside);
        };

        loadData();

        const subscription = DeviceEventEmitter.addListener(
            ATTENDANCE_UPDATED_EVENT,
            async () => {
                await loadAttendanceData();

                const inside =
                    (await AsyncStorage.getItem(
                        'isInsideOfficeGeofence',
                    )) === 'true';

                setIsInsideGeofence(inside);
            },
        );

        return () => subscription.remove();
    }, []);
    // ── Subscribe to geofence events ──────────────────────────────────────────
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            ATTENDANCE_UPDATED_EVENT,
            event => {
                // Brief visual flash of what just happened, then reload
                setLastEvent(event?.type || null);
                loadAttendanceData();
                setTimeout(() => setLastEvent(null), 4000);
            },
        );
        return () => sub.remove();
    }, []);

    // ── Live timer ────────────────────────────────────────────────────────────
    useEffect(() => {
        let interval;
        if (currentStatus === 'CHECKED_IN' && activeCheckIn) {
            interval = setInterval(() => {
                setLiveDuration(
                    computeLiveDuration(todayRef.current, true, activeCheckInRef.current),
                );
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [currentStatus, activeCheckIn]);

    // ── Data loader ───────────────────────────────────────────────────────────
    const loadAttendanceData = async () => {
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

                // A record with no latestCheckOut means an open session
                const hasOpenSession =
                    !!todayRecord &&
                    !!todayRecord.oldestCheckIn &&
                    !todayRecord.latestCheckOut;

                setCurrentStatus(
                    hasOpenSession ? 'CHECKED_IN' : 'CHECKED_OUT',
                );

                if (hasOpenSession) {
                    const checkInTime = todayRecord?.oldestCheckIn || null;

                    setActiveCheckIn(checkInTime);

                    setLiveDuration(
                        computeLiveDuration(
                            todayRecord,
                            true,
                            checkInTime,
                        ),
                    );
                } else {
                    setActiveCheckIn(null);

                    setLiveDuration(
                        computeLiveDuration(
                            todayRecord,
                            false,
                            null,
                        ),
                    );
                }
            }
        } catch (error) {
            console.error('[AttendanceScreen] load error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadAttendanceData();
    };

    // ── Derived display values ────────────────────────────────────────────────
    const isCheckedIn = currentStatus === 'CHECKED_IN';
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

            {todayAttendance ? (
                <View style={styles.sessionCard}>
                    <View style={styles.sessionHeader}>
                        <Text style={styles.sessionDate}>
                            {todayAttendance.date || new Date().toISOString().split('T')[0]}
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
                                : formatTime(todayAttendance.oldestCheckIn)}
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
                                : todayAttendance.latestCheckOut
                                    ? formatTime(todayAttendance.latestCheckOut)
                                    : '—'}
                        </Text>
                    </View>

                    <View style={styles.sessionDetail}>
                        <Icon name="repeat" size={16} color="#6B7280" />
                        <Text style={styles.sessionLabel}>Sessions</Text>
                        <Text style={styles.sessionValue}>
                            {todayAttendance.totalSessions || 1}
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