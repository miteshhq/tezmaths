// app/UserDashboard.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, KeyboardAvoidingView, Platform, ActivityIndicator, AppState } from 'react-native';
import { useRouter } from 'expo-router'; // Import useRouter for navigation
import Home from './user/home';
import Learn from './user/learn';
import Leaderboard from './user/leaderboard';
import Profile from './user/profile';
import * as Font from 'expo-font';
import quizIcon from '../assets/icons/quiz.png';
import learnIcon from '../assets/icons/learn.png';
import leaderboardIcon from '../assets/icons/leaderboard.png';
import profileIcon from '../assets/icons/profile.png';
import notificationIcon from '../assets/icons/notification.png'; // Import notification icon

const { width } = Dimensions.get('window');
const ACTIVE_COLOR = '#F7C948';

export default function UserDashboard() {
    const [selectedSection, setSelectedSection] = useState('Quiz');
    const [isFontLoaded, setIsFontLoaded] = useState(false);
    const router = useRouter(); // Initialize useRouter

    useEffect(() => {
        const loadFonts = async () => {
            await Font.loadAsync({
                'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
                'Poppins-Regular': require('../assets/fonts/Poppins-Regular.ttf'),
            });
            setIsFontLoaded(true);
        };
        loadFonts();
    }, []);


    useEffect(() => {
        const handleAppStateChange = (nextAppState: string) => {
            if (nextAppState === "active" || "background" || "inactive") {
                setSelectedSection('Quiz'); // ✅ Set default section to Home when app resumes
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove(); // ✅ Cleanup event listener
        };
    }, []);
    const renderSection = () => {
        switch (selectedSection) {
            case 'Home':
                return <Home />;
            case 'Learn':
                return <Learn />;
            case 'Leaderboard':
                return <Leaderboard />;
            case 'Profile':
                return <Profile />;
            default:
                return <Home />;
        }
    };

    const renderIcon = (icon, isActive) => (
        <View style={[styles.iconContainer, isActive && styles.activeIconContainer]}>
            <Image source={icon} style={styles.icon} />
        </View>
    );

    if (!isFontLoaded) {
        return <ActivityIndicator size="large" color={ACTIVE_COLOR} />;
    }

    return (
        <View style={styles.container}>
            {/* Header with clickable Notification Icon */}
            <View style={styles.header}>
                <Text style={styles.headerText}>Tez Maths</Text>
                <TouchableOpacity onPress={() => router.push('/user/notification')}>
                    <Image source={notificationIcon} style={styles.notificationIcon} />
                </TouchableOpacity>
            </View>

            {/* Main Content with Keyboard Avoidance */}
            <KeyboardAvoidingView style={styles.contentContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                {renderSection()}
            </KeyboardAvoidingView>

            {/* Bottom Navigation */}
            <View style={styles.bottomNav}>
                <TouchableOpacity onPress={() => setSelectedSection('Quiz')} style={styles.navButton}>
                    {renderIcon(quizIcon, selectedSection === 'Home')}
                    <Text style={[styles.navButtonText, selectedSection === 'Quiz' && styles.activeText]}>Quiz</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedSection('Learn')} style={styles.navButton}>
                    {renderIcon(learnIcon, selectedSection === 'Learn')}
                    <Text style={[styles.navButtonText, selectedSection === 'Learn' && styles.activeText]}>Learn</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedSection('Leaderboard')} style={styles.navButton}>
                    {renderIcon(leaderboardIcon, selectedSection === 'Leaderboard')}
                    <Text style={[styles.navButtonText, selectedSection === 'Leaderboard' && styles.activeText]}>Leaderboard</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedSection('Profile')} style={styles.navButton}>
                    {renderIcon(profileIcon, selectedSection === 'Profile')}
                    <Text style={[styles.navButtonText, selectedSection === 'Profile' && styles.activeText]}>Profile</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: ACTIVE_COLOR,
    },
    header: {
        height: 60,
        backgroundColor: ACTIVE_COLOR,
        flexDirection: 'row', // Align items in a row
        justifyContent: 'space-between', // Space out title and icon
        alignItems: 'center', // Center items vertically
        paddingHorizontal: 20,
    },
    headerText: {
        color: '#000',
        fontSize: 20,
        fontFamily: 'Poppins-Bold',
    },
    notificationIcon: {
        width: 24,
        height: 24,
        resizeMode: 'contain',
        marginHorizontal: 5,
    },
    contentContainer: {
        flex: 1,
        backgroundColor: '#FFF2CC',
        paddingVertical: 20,
        paddingHorizontal: 20,
        borderColor: ACTIVE_COLOR,
        borderLeftWidth: 3,
        borderRightWidth: 3,
        borderRadius: 20,
    },
    bottomNav: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
        backgroundColor: ACTIVE_COLOR,
    },
    navButton: {
        alignItems: 'center',
    },
    navButtonText: {
        fontSize: 12,
        color: '#555',
        fontFamily: 'Poppins-Bold',
    },
    activeText: {
        color: '#fff',
    },
    iconContainer: {
        padding: 6,
        borderRadius: 25,
    },
    activeIconContainer: {
        borderColor: ACTIVE_COLOR,
    },
    icon: {
        width: 24,
        height: 24,
        resizeMode: 'contain',
    },
});
