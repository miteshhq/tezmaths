// app/dashboard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
export default function DashboardScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Dashboard</Text>
        </View>
    );
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
    },
    title: {
        fontSize: 28,
        color: '#ffffff',
        fontWeight: 'bold',
    },
});
