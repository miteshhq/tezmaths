// app/user/FinishedQuizzes.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, BackHandler, ActivityIndicator, TextInput } from 'react-native';
import { ref, get } from 'firebase/database';
import { auth, database } from '../../firebase/firebaseConfig';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

export default function FinishedQuizzes() {
    const router = useRouter();
    const [quizzes, setQuizzes] = useState([]);
    const [filteredQuizzes, setFilteredQuizzes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // Fetch completed quizzes for the user
    useEffect(() => {
        const fetchCompletedQuizzes = async () => {
            setLoading(true);
            const userId = auth.currentUser?.uid;
            if (userId) {
                const userCompletedRef = ref(database, `users/${userId}/completedQuizzes`);
                const completedSnapshot = await get(userCompletedRef);
                const completedQuizzes = completedSnapshot.exists() ? completedSnapshot.val() : {};

                // Fetch all quizzes and filter to only show completed quizzes
                const quizzesRef = ref(database, 'quizzes');
                const quizzesSnapshot = await get(quizzesRef);
                const allQuizzes = quizzesSnapshot.exists() ? quizzesSnapshot.val() : {};

                // Filter and map quizzes to only show completed ones, sorted by most recent completion date
                const finishedQuizzesList = Object.keys(allQuizzes)
                    .filter(key => completedQuizzes[key]?.completed)
                    .map(key => ({
                        id: key,
                        ...allQuizzes[key],
                        completedAt: completedQuizzes[key].completedAt || 0
                    }))
                    .sort((a, b) => b.completedAt - a.completedAt); // Sort by newest first

                setQuizzes(finishedQuizzesList);
                setFilteredQuizzes(finishedQuizzesList);
            }
            setLoading(false);
        };
        fetchCompletedQuizzes();
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
    const handleSearch = (query) => {
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
            <Text style={styles.heading}>Your Completed Quizzes</Text>
            
            <TextInput
                style={styles.searchBar}
                placeholder="Search completed quizzes by name"
                placeholderTextColor="#7a7a7a"
                value={searchQuery}
                onChangeText={handleSearch}
            />

            <Text style={styles.quizCountText}>Completed Quizzes: {filteredQuizzes.length}</Text>

            {loading ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color="#FFDB74" />
                    <Text style={styles.loadingText}>Loading Completed Quizzes...</Text>
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
                        <Text style={styles.noQuizzesText}>No completed quizzes yet!</Text>
                        <Text style={styles.noQuizzesSubtext}>Start exploring quizzes to see your progress here.</Text>
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
        marginBottom: 10,
    },
    quizCountText: {
        fontSize: 16,
        color: '#333',
        fontFamily: 'Poppins-Regular',
        marginBottom: 20,
        textAlign: 'center',
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
