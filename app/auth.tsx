import React, { useState } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';

type Mode = 'login' | 'register';

export default function AuthScreen() {
    const insets = useSafeAreaInsets();
    const { login, register } = useAuth();
    const [mode, setMode] = useState<Mode>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const topInset = Platform.OS === 'web' ? 67 : insets.top;
    const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

    async function handleSubmit() {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Missing fields', 'Please enter your email and password.');
            return;
        }
        setLoading(true);
        try {
            if (mode === 'login') {
                await login(email.trim(), password);
            } else {
                await register(email.trim(), password, name.trim() || undefined);
            }
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
                style={[styles.container, { paddingTop: topInset }]}
                contentContainerStyle={[styles.content, { paddingBottom: 40 + bottomInset }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Animated.View entering={FadeIn.duration(500)} style={styles.hero}>
                    <View style={styles.logoWrap}>
                        <Ionicons name="scan" size={36} color={Colors.background} />
                    </View>
                    <Text style={styles.appName}>NoteSync</Text>
                    <Text style={styles.tagline}>Handwritten to Notion, instantly</Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.card}>
                    <Text style={styles.cardTitle}>
                        {mode === 'login' ? 'Welcome back' : 'Create account'}
                    </Text>
                    <Text style={styles.cardSubtitle}>
                        {mode === 'login' ? 'Sign in to access your scans' : 'Get started — it only takes a moment'}
                    </Text>

                    {mode === 'register' && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Name (optional)</Text>
                            <View style={styles.inputWrap}>
                                <Ionicons name="person-outline" size={18} color={Colors.textTertiary} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Your name"
                                    placeholderTextColor={Colors.textTertiary}
                                    value={name}
                                    onChangeText={setName}
                                    autoComplete="name"
                                    selectionColor={Colors.accent}
                                />
                            </View>
                        </View>
                    )}

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} />
                            <TextInput
                                style={styles.input}
                                placeholder="you@example.com"
                                placeholderTextColor={Colors.textTertiary}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                autoComplete="email"
                                selectionColor={Colors.accent}
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} />
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
                                placeholderTextColor={Colors.textTertiary}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                selectionColor={Colors.accent}
                                onSubmitEditing={handleSubmit}
                                returnKeyType="go"
                            />
                            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={18}
                                    color={Colors.textTertiary}
                                />
                            </Pressable>
                        </View>
                    </View>

                    <Pressable
                        style={({ pressed }) => [
                            styles.submitButton,
                            pressed && { transform: [{ scale: 0.97 }] },
                            loading && { opacity: 0.7 },
                        ]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={Colors.background} />
                        ) : (
                            <Text style={styles.submitText}>
                                {mode === 'login' ? 'Sign In' : 'Create Account'}
                            </Text>
                        )}
                    </Pressable>

                    <View style={styles.switchRow}>
                        <Text style={styles.switchText}>
                            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                        </Text>
                        <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')} hitSlop={8}>
                            <Text style={styles.switchLink}>
                                {mode === 'login' ? 'Sign up' : 'Sign in'}
                            </Text>
                        </Pressable>
                    </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.features}>
                    {[
                        { icon: 'camera-outline', text: 'Scan any handwritten notes' },
                        { icon: 'sparkles-outline', text: 'AI converts to digital text' },
                        { icon: 'document-text-outline', text: 'Upload directly to Notion' },
                    ].map((f) => (
                        <View key={f.icon} style={styles.featureRow}>
                            <View style={styles.featureIcon}>
                                <Ionicons name={f.icon as any} size={16} color={Colors.accent} />
                            </View>
                            <Text style={styles.featureText}>{f.text}</Text>
                        </View>
                    ))}
                </Animated.View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    content: { paddingHorizontal: 24, paddingTop: 20 },
    hero: { alignItems: 'center', marginBottom: 32 },
    logoWrap: {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: Colors.accent,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
        shadowColor: Colors.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
    },
    appName: { fontFamily: 'Inter_700Bold', fontSize: 32, color: Colors.text, letterSpacing: -0.5 },
    tagline: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
    card: {
        backgroundColor: Colors.surface, borderRadius: 24,
        padding: 24, borderWidth: 1, borderColor: Colors.border, marginBottom: 24,
    },
    cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text, marginBottom: 4 },
    cardSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginBottom: 24 },
    inputGroup: { marginBottom: 16 },
    label: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.surfaceElevated,
        borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
        paddingHorizontal: 14, gap: 10,
    },
    input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.text, paddingVertical: 13 },
    submitButton: {
        backgroundColor: Colors.accent, borderRadius: 14,
        paddingVertical: 16, alignItems: 'center',
        marginTop: 8, marginBottom: 20,
        shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    submitText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.background },
    switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
    switchText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary },
    switchLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.accent },
    features: { gap: 12 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    featureIcon: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: Colors.accent + '18',
        alignItems: 'center', justifyContent: 'center',
    },
    featureText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary },
});
