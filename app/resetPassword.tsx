// app/resetPassword.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ResetPasswordScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [messageColor, setMessageColor] = useState('#FF5A5F'); // Default red for error messages

    const isValidEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handlePasswordReset = async () => {
        setMessage(''); // Clear any previous message

        // Validate email
        if (!isValidEmail(email)) {
            setMessageColor('#FF5A5F'); // Red color for error
            setMessage('Please enter a valid email address.');
            return;
        }

        try {
            // Check if a reset link was sent recently
            const lastSent = await AsyncStorage.getItem(`resetLinkSent_${email}`);
            const now = Date.now();
            if (lastSent && now - parseInt(lastSent, 10) < 60000) { // 1 minute in milliseconds
                setMessageColor('#FF5A5F');
                setMessage('Please wait a minute before requesting another reset link.');
                return;
            }

            // Send password reset email
            await sendPasswordResetEmail(auth, email);
            await AsyncStorage.setItem(`resetLinkSent_${email}`, now.toString()); // Record the timestamp

            // Success message
            setMessageColor('#4BB543'); // Green color for success
            setMessage('A password reset link has been sent to your email.');
        } catch (error: any) {
            console.error('Password reset failed:', error.message);
            setMessageColor('#FF5A5F');
            setMessage('Failed to send reset link. Please try again.');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
                Enter your email to receive a password reset link.
            </Text>
            <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#7a7a7a"
                onChangeText={setEmail}
                value={email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
            />
            {message ? <Text style={[styles.messageText, { color: messageColor }]}>{message}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handlePasswordReset}>
                <Text style={styles.buttonText}>Send Reset Link</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/login')}>
                <Text style={styles.footerText}>Back to Login</Text>
            </TouchableOpacity>
        </View>
    );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0F4F8',
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 26,
        color: '#333',
        fontFamily: 'Poppins-Bold',
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 15,
        color: '#555',
        fontFamily: 'Poppins-Regular',
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 30,
    },
    input: {
        backgroundColor: '#fff',
        color: '#333',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 30,
        marginBottom: 15,
        width: '90%',
        fontFamily: 'Poppins-Regular',
        fontSize: 15,
    },
    button: {
        backgroundColor: '#F7C948',
        paddingVertical: 15,
        borderRadius: 30,
        alignItems: 'center',
        width: '75%',
        justifyContent: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins-Regular',
        textAlign: 'center',
    },
    footerText: {
        color: '#007BFF',
        textAlign: 'center',
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        marginTop: 20,
    },
    messageText: {
        fontSize: 14,
        textAlign: 'center',
        fontFamily: 'Poppins-Regular',
        marginBottom: 10,
    },
});
