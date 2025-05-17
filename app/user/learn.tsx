// app/user/learn.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Dimensions } from 'react-native';
import { ref, get } from 'firebase/database';
import { database } from '../../firebase/firebaseConfig';
import { WebView } from 'react-native-webview';

export default function LearnScreen() {
    const [videos, setVideos] = useState([]);
    const [filteredVideos, setFilteredVideos] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchVideos = async () => {
            const videosRef = ref(database, 'videos');
            const videosSnapshot = await get(videosRef);
            if (videosSnapshot.exists()) {
                const videosData = videosSnapshot.val();
                const videoList = Object.keys(videosData).map(key => ({
                    id: key,
                    ...videosData[key],
                })).reverse();
                setVideos(videoList.reverse());
                setFilteredVideos(videoList.reverse());
            }
        };
        fetchVideos();
    }, []);

    const handleSearch = (query) => {
        setSearchQuery(query);
        if (query === '') {
            setFilteredVideos(videos);
        } else {
            const filtered = videos.filter(video =>
                video.name.toLowerCase().includes(query.toLowerCase())
            );
            setFilteredVideos(filtered);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.heading}>Educational Videos</Text>
            <TextInput
                style={styles.searchBar}
                placeholder="Search videos by name"
                placeholderTextColor="#7a7a7a"
                value={searchQuery}
                onChangeText={handleSearch}
            />
            <FlatList
                data={filteredVideos}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.videoListContent}
                renderItem={({ item }) => (
                    <View style={styles.videoContainer}>
                        <Text style={styles.videoTitle}>{item.name}</Text>
                        <Text style={styles.videoDescription}>{item.description}</Text>
                        {item.videoId && (
                            <View style={styles.videoPlayerWrapper}>
                                <WebView
                                    style={styles.videoPlayer}
                                    source={{ uri: `https://www.youtube.com/embed/${item.videoId}` }}
                                    allowsFullscreenVideo
                                />
                            </View>
                        )}
                    </View>
                )}
                style={styles.flatList}
            />
        </View>
    );
}

const { width } = Dimensions.get('window');
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFF2CC', // Same background as QuizScreen
        paddingHorizontal: 10,
    },
    heading: {
        fontSize: 24,
        color: '#333',
        fontFamily: 'Poppins-Bold',
        fontWeight: '600',
        textAlign: 'center',
        marginVertical: 20,
    },
    searchBar: {
        backgroundColor: '#FFF7E0', // Lighter shade for the search box
        color: '#333',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 30,
        marginBottom: 15,
        width: '100%',
        fontFamily: 'Poppins-Regular',
        fontSize: 15,
        borderColor: '#ddd',
        borderWidth: 1,
    },
    flatList: {
        marginBottom: 20, // Extra space at the bottom to separate scroll indicator
    },
    videoListContent: {
        paddingBottom: 30, // Additional padding to separate content from scroll indicator
    },
    videoContainer: {
        backgroundColor: '#FFF7E0', // Lighter shade for video background
        padding: 15,
        borderRadius: 15,
        marginBottom: 20,
        borderColor: '#ddd',
        borderWidth: 1,
    },
    videoTitle: {
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'Poppins-Bold',
        color: '#333',
        marginBottom: 5,
    },
    videoDescription: {
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        color: '#555',
        marginBottom: 10,
    },
    videoPlayerWrapper: {
        width: '100%',
        aspectRatio: 16 / 9, // Ensures a 16:9 aspect ratio
        overflow: 'hidden',
        borderRadius: 10,
    },
    videoPlayer: {
        width: '100%',
        height: '100%', // Ensures the video fills the wrapper
    },
});
