// app/user/AllQuizzes.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Dimensions, BackHandler, ActivityIndicator } from 'react-native';
import { ref, get } from 'firebase/database';
import { auth, database } from '../../firebase/firebaseConfig';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

export default function AllQuizzes() {
    const router = useRouter();
    const [quizzes, setQuizzes] = useState([]);
    const [filteredQuizzes, setFilteredQuizzes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // Fetch all quizzes and filter based on user's completed quizzes
    useEffect(() => {
        const fetchQuizzes = async () => {
            setLoading(true);
            const userId = auth.currentUser?.uid;
            if (userId) {
                // Get the user's completed quizzes
                const userCompletedRef = ref(database, `users/${userId}/completedQuizzes`);
                const completedSnapshot = await get(userCompletedRef);
                const completedQuizzes = completedSnapshot.exists() ? completedSnapshot.val() : {};
                console.log("quize 26",completedQuizzes);
                

                // Fetch all quizzes
                const quizzesRef = ref(database, 'quizzes');
                const quizzesSnapshot = await get(quizzesRef);
                const data = quizzesSnapshot.exists() ? quizzesSnapshot.val() : {};
                
                // Map and filter quizzes to exclude completed ones, and reverse the list for newest first
                const availableQuizzesList = Object.keys(data)
                    .filter(key => !completedQuizzes[key]?.completed)
                    .map(key => ({ id: key, ...data[key] }))
                    .reverse(); // Reverse for "newest first" order

                setQuizzes(availableQuizzesList as any);
                setFilteredQuizzes(availableQuizzesList as any);
                setLoading(false);
            } else {
                setLoading(false);
            }
        };

        fetchQuizzes();
    }, []);

    // Handle hardware back button
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                router.replace('/dashboard'); // Replace current screen with the Dashboard
                return true;
            };
            BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
        }, [])
    );

    // Filter quizzes by name
    const handleSearch = (query :any) => {
        setSearchQuery(query);
        const filtered = quizzes.filter(quiz =>
            quiz.name.toLowerCase().includes(query.toLowerCase())
        );
        setFilteredQuizzes(filtered);
    };

    // Render each quiz card
    const renderQuizCard = ({ item }) => (
        <TouchableOpacity style={styles.quizCard} onPress={() => router.push({ pathname: '/user/QuizScreen', params: { id: item.id } })}>
            <Text style={styles.quizName}>{item.name}</Text>
            <Text style={styles.quizDescription}>{item.description}</Text>
            <View style={styles.quizInfo}>
                <Text style={styles.quizDetails}>Questions: {item.questions.length}</Text>
                <Text style={styles.quizDetails}>Points: {item.points}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.heading}>Explore New Quizzes</Text>
            <TextInput
                style={styles.searchBar}
                placeholder="Search quizzes by name"
                placeholderTextColor="#7a7a7a"
                value={searchQuery}
                onChangeText={handleSearch}
            />
            {loading ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color="#FFDB74" />
                    <Text style={styles.loadingText}>Fetching quizzes, please wait...</Text>
                </View>
            ) : (
                filteredQuizzes.length > 0 ? (
                    <FlatList
                        data={filteredQuizzes}
                        keyExtractor={(item) => item.id}
                        renderItem={renderQuizCard}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.listContainer}
                    />
                ) : (
                    <View style={styles.noQuizzesContainer}>
                        <Text style={styles.noQuizzesText}>You've conquered all available quizzes!</Text>
                        <Text style={styles.noQuizzesSubtext}>Stay tuned for new challenges coming soon!</Text>
                    </View>
                )
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFF2CC',
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    heading: {
        fontSize: 26,
        color: '#333',
        fontFamily: 'Poppins-Bold',
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 15,
    },
    searchBar: {
        height: 45,
        backgroundColor: '#FFDB74',
        color: '#333',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20,
        fontFamily: 'Poppins-Regular',
        fontSize: 16,
        marginBottom: 20,
    },
    listContainer: {
        paddingHorizontal: 10,
    },
    quizCard: {
        backgroundColor: '#FFDB74',
        width: '100%',
        padding: 20,
        borderRadius: 15,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    quizName: {
        fontSize: 18,
        color: '#333',
        fontFamily: 'Poppins-Bold',
        marginBottom: 5,
    },
    quizDescription: {
        fontSize: 14,
        color: '#333',
        fontFamily: 'Poppins-Regular',
        marginBottom: 10,
    },
    quizInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    quizDetails: {
        fontSize: 14,
        color: '#333',
        fontFamily: 'Poppins-Regular',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 16,
        color: '#333',
        fontFamily: 'Poppins-Regular',
        marginTop: 10,
    },
    noQuizzesContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noQuizzesText: {
        fontSize: 18,
        fontFamily: 'Poppins-Bold',
        color: '#333',
        textAlign: 'center',
        marginBottom: 5,
    },
    noQuizzesSubtext: {
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        color: '#333',
        textAlign: 'center',
    },
});
