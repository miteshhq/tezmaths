// app/user/notification.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ref, get } from 'firebase/database';
import { database, auth } from '../../firebase/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

export default function NotificationScreen() {
    const router = useRouter();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNotifications = async () => {
            setLoading(true);
            const cachedData = await AsyncStorage.getItem('userData');
            const lastFetchTime = await AsyncStorage.getItem('lastFetchTime');
            const twelveHoursInMillis = 12 * 60 * 60 * 1000;
            const shouldFetchFreshData = !cachedData || !lastFetchTime || (Date.now() - parseInt(lastFetchTime) > twelveHoursInMillis);

            let userData;
            if (cachedData && !shouldFetchFreshData) {
                userData = JSON.parse(cachedData);
                console.log("Using cached user data:", userData);
                loadIncompleteQuizzes(userData);
            } else {
                const userId = auth.currentUser?.uid;
                if (userId) {
                    const userRef = ref(database, `users/${userId}`);
                    const snapshot = await get(userRef);
                    if (snapshot.exists()) {
                        userData = snapshot.val();
                        await AsyncStorage.setItem('userData', JSON.stringify(userData));
                        await AsyncStorage.setItem('lastFetchTime', Date.now().toString());
                        console.log("Fetched fresh user data:", userData);
                        loadIncompleteQuizzes(userData);
                    }
                }
            }
            setLoading(false);
        };

        const loadIncompleteQuizzes = async (userData) => {
            const completedQuizzes = userData?.completedQuizzes || {};
            const quizzesRef = ref(database, 'quizzes');
            const quizzesSnapshot = await get(quizzesRef);
            if (quizzesSnapshot.exists()) {
                const allQuizzes = quizzesSnapshot.val();
                const incompleteQuizzes = Object.entries(allQuizzes)
                    .filter(([key]) => !completedQuizzes[key]?.completed)
                    .map(([key, quiz]) => ({
                        id: key,
                        name: quiz.name,
                        description: quiz.description,
                        time: 'Just now', // Placeholder time for now
                    }))
                    .reverse(); // Reverse to show newest first

                setNotifications(incompleteQuizzes);
            }
        };

        fetchNotifications();
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.headerText}>Notifications</Text>
            <Text style={styles.subtitle}>Quizzes you haven't completed yet</Text>
            {loading ? (
                <ActivityIndicator size="large" color="#F7C948" style={styles.loader} />
            ) : (
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                    {notifications.length > 0 ? (
                        notifications.map((notification) => (
                            <TouchableOpacity
                                key={notification.id}
                                style={styles.notificationCard}
                                onPress={() => router.push('/user/AllQuizzes')}
                            >
                                <Text style={styles.notificationTitle}>{notification.name}</Text>
                                <Text style={styles.notificationDescription}>{notification.description}</Text>
                                <Text style={styles.notificationTime}>{notification.time}</Text>
                            </TouchableOpacity>
                        ))
                    ) : (
                        <Text style={styles.noNotifications}>No new quizzes available.</Text>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40; // Full width minus some padding
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFF2CC', // Light background color
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    headerText: {
        fontSize: 24,
        fontFamily: 'Poppins-Bold',
        color: '#333',
        textAlign: 'center',
        marginTop: 10,
    },
    subtitle: {
        fontSize: 14,
        color: '#333',
        fontFamily: 'Poppins-Regular',
        textAlign: 'center',
        marginBottom: 20,
    },
    scrollView: {
        flex: 1,
    },
    notificationCard: {
        width: CARD_WIDTH,
        backgroundColor: '#FFDB74', // Slightly darker shade
        borderRadius: 15,
        padding: 15,
        marginBottom: 15,
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3, // Shadow for Android
    },
    notificationTitle: {
        fontSize: 16,
        fontFamily: 'Poppins-Bold',
        color: '#333',
        marginBottom: 5,
    },
    notificationDescription: {
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        color: '#555',
        marginBottom: 10,
    },
    notificationTime: {
        fontSize: 12,
        fontFamily: 'Poppins-Regular',
        color: '#888',
        textAlign: 'right',
    },
    noNotifications: {
        fontSize: 16,
        color: '#888',
        fontFamily: 'Poppins-Regular',
        textAlign: 'center',
        marginTop: 20,
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 20,
    },
});
