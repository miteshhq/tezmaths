// app/signup.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { useRouter } from 'expo-router';

export default function SignUpScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const isValidEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleSignUp = async () => {
        setErrorMessage('');
        if (!isValidEmail(email)) {
            setErrorMessage('Please enter a valid email address.');
            return;
        }
        if (password.length < 6) {
            setErrorMessage('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setErrorMessage('Passwords do not match.');
            return;
        }
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            console.log('Account created successfully:', userCredential);
            setErrorMessage('');
            router.push('/login'); // Redirect to login screen after successful sign-up
        } catch (error: any) {
            console.error('Sign-up failed:', error.message);
            setErrorMessage(error.message);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Create an account</Text>
            <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#7a7a7a"
                onChangeText={setEmail}
                value={email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
            />
            <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#7a7a7a"
                onChangeText={setPassword}
                value={password}
                secureTextEntry
            />
            <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#7a7a7a"
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                secureTextEntry
            />
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleSignUp}>
                <Text style={styles.buttonText}>Register</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/login')}>
                <Text style={styles.footerText}>Already have an account? Log in</Text>
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
        marginBottom: 20,
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
    errorText: {
        color: '#FF5A5F',
        fontSize: 14,
        textAlign: 'center',
        fontFamily: 'Poppins-Regular',
        marginBottom: 10,
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
});
