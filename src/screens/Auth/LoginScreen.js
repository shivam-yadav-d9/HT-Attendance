// src/screens/Auth/LoginScreen.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import authService from '../../services/auth.service';
import geofenceService from '../../services/geofence.service';

export default function LoginScreen({ navigation }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const login = async () => {
        if (!username || !password) {
            Alert.alert('Error', 'Please enter both Employee Number and Password');
            return;
        }

        setLoading(true);

        try {
            const result = await authService.login(username, password);

            if (!result.success) {
                Alert.alert('Login Failed', result.message || 'Invalid credentials');
                setLoading(false);
                return;
            }

            // Save user data first
            await AsyncStorage.setItem('userToken', result.token || 'dummy-token');
            await AsyncStorage.setItem('userData', JSON.stringify(result.user));

            // Save credentials for remember me
            await AsyncStorage.setItem(
                'savedCredentials',
                JSON.stringify({ username, password }),
            );

            // Start geofence tracking — fire-and-forget, never blocks navigation.
            // BackgroundGeolocation.ready() handles its own permission prompts.
            const employeeId =
                result.user.employeeNumber || result.user.id || result.user.employeeId;
            if (employeeId) {
                try {
                    await geofenceService.startTracking(employeeId);
                } catch (error) {
                    console.log('[Login] Geofence already starting...');
                }
            }

            // Navigate to main screen — don't block on the Alert
            navigation.replace('Main');
        } catch (error) {
            console.error('[Login] Error:', error);
            Alert.alert('Error', 'An error occurred during login. Please try again.');
            setLoading(false);
        }
        // No `finally` needed: the only paths that don't navigate already
        // call setLoading(false) themselves above.
    };

    return (
        <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
        >
            <StatusBar barStyle="light-content" backgroundColor="#5C2D0C" />

            {/* Logo + Brand */}
            <View style={styles.logoContainer}>
                <Image
                    source={require('../../assets/images/logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <Text style={styles.brand}>
                    <Text style={styles.brandHome}>Home</Text>
                    <Text style={styles.brandTown}>Town</Text>
                    <Text style={styles.brandOnTrack}> OnTrack</Text>
                </Text>
                <View style={styles.tagPill}>
                    <Icon name="auto-awesome" size={13} color="#fff" />
                    <Text style={styles.tag}> Smart Retail Workforce Platform</Text>
                </View>
            </View>

            {/* Card */}
            <View style={styles.card}>
                <View style={styles.personIconWrapper}>
                    <Icon name="badge" size={24} color="#D96A17" />
                </View>

                <Text style={styles.portal}>TEAM PORTAL</Text>
                <Text style={styles.heading}>Staff Login</Text>
                <Text style={styles.subHeading}>
                    {loading ? 'Verifying your credentials…' : 'Enter your employee number and password'}
                </Text>

                <Text style={styles.label}>Employee Number</Text>
                <View style={styles.inputContainer}>
                    <Icon name="badge" size={20} color="#D96A17" />
                    <TextInput
                        placeholder="Enter Username"
                        value={username}
                        onChangeText={setUsername}
                        style={styles.input}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        editable={!loading}
                    />
                </View>

                <Text style={styles.label}>Password</Text>
                <View style={styles.inputContainer}>
                    <Icon name="lock-outline" size={20} color="#D96A17" />
                    <TextInput
                        placeholder="Enter Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        style={styles.input}
                        editable={!loading}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <Icon
                            name={showPassword ? 'visibility' : 'visibility-off'}
                            size={20}
                            color="#888"
                        />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                    onPress={login}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.loginText}>Open Staff Dashboard →</Text>
                    )}
                </TouchableOpacity>

                <Text style={styles.footerText}>
                    Use your assigned HomeTown employee credentials.
                </Text>
            </View>

            {/* Bottom */}
            <View style={styles.bottom}>
                <Text style={styles.bottomTitle}>
                    <Text style={styles.brandHome}>Home</Text>
                    <Text style={styles.brandTown}>Town</Text>
                    <Text style={{ color: '#fff' }}> OnTrack Workforce App</Text>
                </Text>
                <Text style={styles.website}>Visit hometown.in</Text>
                <View style={styles.policyRow}>
                    <Icon name="security" size={12} color="#D96A17" />
                    <Text style={styles.policy}> Secure Login • Terms of Service • Privacy Policy</Text>
                </View>
                <Text style={styles.quote}>
                    "Empowering every store team to learn, perform and grow."
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        backgroundColor: '#5C2D0C',
        paddingHorizontal: 20,
        paddingVertical: 24,
        justifyContent: 'center',
    },
    logoContainer: { alignItems: 'center', marginBottom: 14 },
    logo: { width: 80, height: 80, borderRadius: 40 },
    brand: { fontSize: 28, fontWeight: '900', marginTop: 8 },
    brandHome: { color: '#fff' },
    brandTown: { color: '#D96A17' },
    brandOnTrack: { color: '#F5C87A' },
    tagPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6D3B16',
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 20,
        marginTop: 7,
    },
    tag: { color: '#fff', fontSize: 11 },
    card: { backgroundColor: '#fff', borderRadius: 28, padding: 18 },
    personIconWrapper: {
        position: 'absolute',
        top: 18,
        right: 18,
        backgroundColor: '#FFF0E6',
        borderRadius: 12,
        padding: 9,
    },
    portal: { color: '#D96A17', fontWeight: '700', fontSize: 10, letterSpacing: 1.5 },
    heading: { fontSize: 28, fontWeight: '900', color: '#3A2415', marginTop: 3 },
    subHeading: { color: '#777', marginTop: 2, marginBottom: 10, fontSize: 12 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10, color: '#3A2415' },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 14,
        paddingHorizontal: 14,
        height: 48,
        backgroundColor: '#FAFAFA',
    },
    input: { flex: 1, marginLeft: 10, fontSize: 14 },
    loginBtn: {
        backgroundColor: '#D96A17',
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 14,
    },
    loginBtnDisabled: { backgroundColor: '#E8A97A' },
    loginText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    footerText: { textAlign: 'center', color: '#888', marginTop: 10, fontSize: 11 },
    bottom: { marginTop: 14, alignItems: 'center', gap: 4 },
    bottomTitle: { fontSize: 13, fontWeight: '700' },
    website: { color: '#fff', textDecorationLine: 'underline', fontSize: 12 },
    policyRow: { flexDirection: 'row', alignItems: 'center' },
    policy: { color: '#ddd', fontSize: 10 },
    quote: { color: '#bbb', fontSize: 10, fontStyle: 'italic', textAlign: 'center' },
});