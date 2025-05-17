// app/admin/UserManagement.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { ref, get, remove, onValue } from 'firebase/database';
import { auth } from '../../firebase/firebaseConfig';
import { database } from '../../firebase/firebaseConfig';

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch users from Firebase Database and Authentication
    useEffect(() => {
        const fetchUsers = async () => {
            const usersRef = ref(database, 'users');
            onValue(usersRef, async (snapshot) => {
                const data = snapshot.val();
                const userList = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
                console.log(userList);



                setUsers(userList as any); // Newest users at the top
                setFilteredUsers(userList as any);
            });
        };

        fetchUsers();
    }, []);

    // Handle search functionality
    const handleSearch = (query: string) => {
        setSearchQuery(query);
        if (query === '') {
            setFilteredUsers(users);
        } else {
            const filtered = users.filter((user: any) =>
                (user.username && user.username.toLowerCase().includes(query.toLowerCase())) ||
                (user.fullName && user.fullName.toLowerCase().includes(query.toLowerCase()))
            );
            setFilteredUsers(filtered);
        }
    };

    // Handle user deletion
    const handleDeleteUser = (userId: any) => {
        Alert.alert("Delete User", "Are you sure you want to delete this user?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    const userRef = ref(database, `users/${userId}`);
                    await remove(userRef);
                    Alert.alert("User deleted successfully.");
                },
            },
        ]);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>All Users</Text>
            <TextInput
                style={styles.input}
                placeholder="Search by name or username"
                value={searchQuery}
                onChangeText={handleSearch}
            />
            <FlatList
                data={filteredUsers}
                keyExtractor={(item: any) => item.id}
                renderItem={({ item }: any) => (
                    <View style={styles.userItem}>
                        <Text style={styles.userDetail}><Text style={styles.detailLabel}>Full Name:</Text> {item.fullName || 'N/A'}</Text>
                        <Text style={styles.userDetail}><Text style={styles.detailLabel}>Username:</Text> {item.username || 'N/A'}</Text>
                        <Text style={styles.userDetail}><Text style={styles.detailLabel}>Email:</Text> {item.email}</Text>
                        <Text style={styles.userDetail}><Text style={styles.detailLabel}>Phone:</Text> {item.phoneNumber || 'N/A'}</Text>
                        <Text style={styles.userDetail}><Text style={styles.detailLabel}>Points:</Text> {item.totalPoints || 0}</Text>
                        <Text style={styles.userDetail}><Text style={styles.detailLabel}>Referrals:</Text> {item.referrals || 0}</Text>
                        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteUser(item.id)}>
                            <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                )}
                contentContainerStyle={styles.flatListContent} // Add bottom padding here
            />
        </View>
    );
}

// Styling similar to Quiz Management screen for consistency
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F4F6F8',
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 26,
        color: '#333',
        fontFamily: 'Poppins-Bold',
        textAlign: 'center',
        marginVertical: 20,
    },
    input: {
        backgroundColor: '#fff',
        color: '#333',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 10,
        marginBottom: 15,
        width: '100%',
        fontFamily: 'Poppins-Regular',
        fontSize: 15,
    },
    userItem: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
        borderColor: '#ddd',
        borderWidth: 1,
    },
    userDetail: {
        fontSize: 14,
        color: '#555',
        fontFamily: 'Poppins-Regular',
        marginBottom: 5,
    },
    detailLabel: {
        fontFamily: 'Poppins-Bold',
        color: '#333',
    },
    deleteButton: {
        backgroundColor: '#FF5A5F',
        padding: 8,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 10,
    },
    deleteButtonText: {
        color: '#fff',
        fontFamily: 'Poppins-Bold',
        fontSize: 14,
    },
    flatListContent: {
        paddingBottom: 30, // Extra padding at the bottom for spacing
    },
});
