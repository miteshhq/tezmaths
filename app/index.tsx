// app/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useFonts } from 'expo-font';

export default function WelcomeScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

    const [fontsLoaded] = useFonts({
        'Poppins-Regular': require('../assets/fonts/Poppins-Regular.ttf'),
        'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
    });

    useEffect(() => {
        const checkSession = async () => {
            try {
                const isAdmin = await AsyncStorage.getItem('isAdmin');

                if (isAdmin) {
                    // Redirect to admin dashboard if the user is admin
                    router.replace('/adminDashboard');
                    return;
                }

                const lastLogin = await AsyncStorage.getItem('lastLogin');
                if (lastLogin) {
                    const lastLoginDate = new Date(parseInt(lastLogin, 10));
                    const now = new Date();
                    if (now.getTime() - lastLoginDate.getTime() < SESSION_DURATION) {
                        router.replace('/dashboard');
                        return;
                    }
                }
                setLoading(false);
            } catch (error) {
                console.error('Failed to check session:', error);
                setLoading(false);
            }
        };
        checkSession();
    }, []);

    if (loading || !fontsLoaded) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#F7C948" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Image source={require('../assets/welcome-image.png')} style={styles.image} />
            <Text style={styles.title}>Hey! Welcome</Text>
            <Text style={styles.subtitle}>Challenge your mind with fun facts and tough questions.</Text>
            <TouchableOpacity style={styles.getStartedButton} onPress={() => router.push('/login')}>
                <Text style={styles.buttonText}>Get Started</Text>
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
        paddingBottom: 40, // Adds padding to bring content down
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0F4F8',
    },
    image: {
        width: width * 0.5,  // 50% of screen width for responsiveness
        height: width * 0.5,
        resizeMode: 'contain',
        marginBottom: height * 0.09,  // Slightly closer spacing to the title
    },
    title: {
        fontSize: 26,  // Adjusted font size to match image
        color: '#333',
        fontFamily: 'Poppins-Bold',
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 8,  // Adjusted spacing between title and subtitle
    },
    subtitle: {
        fontSize: 15,  // Adjusted subtitle font size
        color: '#555',
        textAlign: 'center',
        fontFamily: 'Poppins-Regular',
        marginBottom: height * 0.05,  // Reduced spacing to bring the button closer
        paddingHorizontal: 30,
    },
    getStartedButton: {
        backgroundColor: '#F7C948',
        paddingVertical: 15,
        borderRadius: 30,
        alignItems: 'center',
        width: '75%',  // Similar width to match button width in the example
        justifyContent: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins-Regular',
        textAlign: 'center',
    },
});
