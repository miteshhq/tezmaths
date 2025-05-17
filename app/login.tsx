// app/login.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, database } from '../firebase/firebaseConfig';
import { ref, get } from 'firebase/database';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const isValidEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleLogin = async () => {
        setErrorMessage('');
        console.log("Starting login process...");

        // Basic validation
        if (!isValidEmail(email)) {
            setErrorMessage('Please enter a valid email address.');
            return;
        }
        if (!password) {
            setErrorMessage('Password cannot be empty.');
            return;
        }

        // Admin login check
        if (email === 'trivia@admin.com' && password === 'admin-trivia') {
            console.log("Admin login detected");
            await AsyncStorage.setItem('isAdmin', 'true');
            router.push('/adminDashboard');
            return;
        } else {
            await AsyncStorage.removeItem('isAdmin');
        }

        try {
            // Log in with Firebase and get the user
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            console.log('User logged in successfully:', user);

            if (!user.uid) {
                throw new Error("User UID is missing or undefined.");
            }

            // Use user.uid as the database key
            const userId = user.uid;
            console.log(`Checking user information in the database for key: users/${userId}`);

            // Reference and retrieve the user's data from the Realtime Database
            const userRef = ref(database, `users/${userId}`);

            let snapshot;
            try {
                snapshot = await get(userRef);
                console.log("Snapshot retrieved:", snapshot);
            } catch (dbError) {
                console.error("Database retrieval error:", dbError);
                throw new Error("Failed to retrieve user data from the database.");
            }

            if (!snapshot.exists()) {
                console.log("User data not found in database. Redirecting to register page.");
                router.push({ pathname: "/register", params: { email:email} })
                return;
            }

            const userData = snapshot.val();
            console.log("Retrieved user data from database:", userData);

            if (userData.isnewuser === true || userData.isnewuser === undefined) {
                console.log("User is marked as new or incomplete, redirecting to registration page.");
                router.push('/register');
                return;
            }
            const LEVEL_STORAGE_KEY = "highestLevelReached";

            if(userData.highestCompletedLevelCompleted !=undefined || 0){
                await AsyncStorage.setItem(LEVEL_STORAGE_KEY, userData.highestCompletedLevelCompleted.toString());
            }
            // Store login timestamp for regular users and navigate to dashboard
            const now = new Date().getTime().toString();
            await AsyncStorage.setItem('lastLogin', now);
            console.log("User data is complete. Redirecting to user dashboard.");
            router.push('/dashboard');
        } catch (error: any) {
            console.error('Login failed:', error);
            setErrorMessage('Login failed. Please try again.');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Log In</Text>
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
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
                <Text style={styles.buttonText}>Log In</Text>
            </TouchableOpacity>

            {/* Navigation options */}
            <TouchableOpacity onPress={() => router.push('/resetPassword')}>
                <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>
            <View style={styles.signupContainer}>
                <Text style={styles.signupText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/signup')}>
                    <Text style={styles.signupLinkText}>Sign up</Text>
                </TouchableOpacity>
            </View>
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
    linkText: {
        color: '#007BFF',
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        marginTop: 15,
        textAlign: 'center',
    },
    signupContainer: {
        flexDirection: 'row',
        marginTop: 20,
    },
    signupText: {
        color: '#555',
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
    },
    signupLinkText: {
        color: '#007BFF',
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
    },
});
