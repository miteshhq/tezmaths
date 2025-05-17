// app/adminDashboard.tsx
import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import QuestionManagement from './admin/QuestionManagement';
import UserManagement from './admin/UserManagement';
import VideoManagement from './admin/VideoManagement';
import ReferralPoints from './admin/ReferralPoints';
import PaymentSettings from './admin/PaymentSettings';
import Analytics from './admin/Analytics';

const { width } = Dimensions.get('window');

export default function AdminDashboard() {
    const router = useRouter();
    const [selectedSection, setSelectedSection] = useState('Questions');
    const [isSidebarVisible, setSidebarVisible] = useState(false);
    const sidebarAnimation = useRef(new Animated.Value(-width * 0.7)).current;

    const toggleSidebar = () => {
        const toValue = isSidebarVisible ? -width * 0.7 : 0;
        setSidebarVisible(!isSidebarVisible);
        Animated.timing(sidebarAnimation, {
            toValue,
            duration: 300,
            useNativeDriver: true,
        }).start();
    };

    const renderSection = () => {
        switch (selectedSection) {
            case 'Questions':
                return <QuestionManagement />;
            case 'Users':
                return <UserManagement />;
            case 'Videos':
                return <VideoManagement />;
            case 'ReferralPoints':
                return <ReferralPoints />;
            case 'PaymentSettings':
                return <PaymentSettings />;
            case 'Analytics':
                return <Analytics />;
            default:
                return <QuestionManagement />;
        }
    };

    const handleLogout = async () => {
        await AsyncStorage.removeItem('isAdmin');
        await AsyncStorage.removeItem('lastLogin');
        router.push('/');
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={toggleSidebar} style={styles.menuButton}>
                    <Text style={styles.menuButtonText}>☰</Text>
                </TouchableOpacity>
                <Text style={styles.headerText}>Admin Dashboard</Text>
            </View>

            {/* Sidebar Navigation */}
            {isSidebarVisible && (
                <TouchableOpacity style={styles.overlay} onPress={toggleSidebar} activeOpacity={1}>
                    <Animated.View style={[styles.sidebar, { transform: [{ translateX: sidebarAnimation }] }]}>
                        <View style={styles.sidebarHeader}>
                            <Text style={styles.sidebarTitle}>Trivia</Text>
                            <TouchableOpacity onPress={toggleSidebar}>
                                <Text style={styles.closeButton}>X</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView>
                            <TouchableOpacity onPress={() => { setSelectedSection('Questions'); toggleSidebar(); }}>
                                <Text style={selectedSection === 'Questions' ? styles.selectedTab : styles.tabText}>Questions</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setSelectedSection('Users'); toggleSidebar(); }}>
                                <Text style={selectedSection === 'Users' ? styles.selectedTab : styles.tabText}>Users</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setSelectedSection('Videos'); toggleSidebar(); }}>
                                <Text style={selectedSection === 'Videos' ? styles.selectedTab : styles.tabText}>Videos</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setSelectedSection('ReferralPoints'); toggleSidebar(); }}>
                                <Text style={selectedSection === 'ReferralPoints' ? styles.selectedTab : styles.tabText}>Referral Points</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setSelectedSection('PaymentSettings'); toggleSidebar(); }}>
                                <Text style={selectedSection === 'PaymentSettings' ? styles.selectedTab : styles.tabText}>Payment Settings</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setSelectedSection('Analytics'); toggleSidebar(); }}>
                                <Text style={selectedSection === 'Analytics' ? styles.selectedTab : styles.tabText}>Analytics</Text>
                            </TouchableOpacity>
                        </ScrollView>
                        {/* Logout Button at Bottom */}
                        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                            <Text style={styles.logoutButtonText}>Logout</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </TouchableOpacity>
            )}

            {/* Main Content */}
            <ScrollView style={styles.content}>
                {renderSection()}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
	fontFamily: 'Poppins-Bold',
        flex: 1,
        backgroundColor: '#F0F4F8',
    },
    header: {
	fontFamily: 'Poppins-Bold',
        height: 60,
        backgroundColor: '#333',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    headerText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'Poppins-Bold',
        flex: 1,
        textAlign: 'center',
	fontFamily: 'Poppins-Bold',
    },
    menuButton: {
        width: 40,
        height: 40,
        borderWidth: 1,
        borderColor: '#F7C948',
        borderRadius: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuButtonText: {
        color: '#F7C948',
        fontSize: 24,
        fontFamily: 'Poppins-Bold',
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 10,
    },
    sidebar: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '70%',
        height: '100%',
        backgroundColor: '#1a1a1a',
        paddingTop: 20,
        paddingHorizontal: 15,
        zIndex: 20,
    },
    sidebarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    sidebarTitle: {
        color: '#F7C948',
        fontSize: 18,
        fontFamily: 'Poppins-Bold',
    },
    closeButton: {
        color: '#F7C948',
        fontSize: 16,
        fontFamily: 'Poppins-Bold',
    },
    tabText: {
        color: '#999',
        fontSize: 16,
        paddingVertical: 15,
        fontFamily: 'Poppins-Regular',
    },
    selectedTab: {
        color: '#F7C948',
        fontSize: 16,
        fontWeight: 'bold',
        paddingVertical: 15,
        fontFamily: 'Poppins-Bold',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    logoutButton: {
        position: 'absolute',
        bottom: 30,
        left: 15,
    },
    logoutButtonText: {
        color: '#F7C948',
        fontSize: 16,
        fontFamily: 'Poppins-Bold',
    },
});
