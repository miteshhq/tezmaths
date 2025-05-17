// app/admin/VideoManagement.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, FlatList } from 'react-native';
import { ref, set, push, get, remove } from 'firebase/database';
import { database } from '../../firebase/firebaseConfig';
import { FontAwesome } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

export default function VideoManagement() {
    const [videoName, setVideoName] = useState('');
    const [description, setDescription] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [uploadedVideos, setUploadedVideos] = useState([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState({});

    // Fetch uploaded videos from Firebase
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
                setUploadedVideos(videoList);
            }
        };
        fetchVideos();
    }, []);

    // Function to validate a YouTube URL and extract the video ID
    const getYoutubeVideoId = (url) => {
        const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
        return match ? match[1] : null;
    };

    // Handle video URL upload to Firebase
    const uploadVideo = async () => {
        setErrorMessage('');
        setSuccessMessage('');
        if (!videoName || !description || !videoUrl) {
            setErrorMessage('All fields are required');
            return;
        }
        if (videoName.length > 120 || description.length > 120) {
            setErrorMessage('Name and description must be under 120 characters');
            return;
        }
        const videoId = getYoutubeVideoId(videoUrl);
        if (!videoId) {
            setErrorMessage('Invalid YouTube URL');
            return;
        }
        try {
            const newVideoRef = push(ref(database, 'videos'));
            await set(newVideoRef, {
                name: videoName,
                description,
                videoId,
                timestamp: Date.now(),
            });
            setUploadedVideos(prev => [...prev, {
                id: newVideoRef.key,
                name: videoName,
                description,
                videoId,
            }]);
            setVideoName('');
            setDescription('');
            setVideoUrl('');
            setSuccessMessage('Video URL uploaded successfully!');
        } catch (error) {
            setErrorMessage('Failed to upload video URL');
        }
    };

    // Handle delete confirmation and deletion
    const handleDeletePress = (videoId) => {
        if (deleteConfirm[videoId]) {
            const videoRef = ref(database, `videos/${videoId}`);
            remove(videoRef)
                .then(() => {
                    setUploadedVideos(prevVideos => prevVideos.filter(video => video.id !== videoId));
                    setDeleteConfirm(prev => ({ ...prev, [videoId]: false }));
                })
                .catch(() => {
                    setErrorMessage('Failed to delete video');
                });
        } else {
            setDeleteConfirm(prev => ({ ...prev, [videoId]: true }));
            setTimeout(() => {
                setDeleteConfirm(prev => ({ ...prev, [videoId]: false }));
            }, 5000);
        }
    };

    return (
        <View style={styles.container}>
            {/* Upload Video Section */}
            <Text style={styles.title}>Upload Video URL</Text>
            <TextInput
                style={styles.input}
                placeholder="Video Name"
                placeholderTextColor="#7a7a7a"
                value={videoName}
                onChangeText={(text) => setVideoName(text.slice(0, 120))}
            />
            <TextInput
                style={[styles.input, { height: 100 }]}
                placeholder="Description"
                placeholderTextColor="#7a7a7a"
                value={description}
                onChangeText={(text) => setDescription(text.slice(0, 120))}
                multiline
            />
            <TextInput
                style={styles.input}
                placeholder="YouTube Video URL"
                placeholderTextColor="#7a7a7a"
                value={videoUrl}
                onChangeText={setVideoUrl}
            />
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={uploadVideo}>
                <Text style={styles.buttonText}>Upload Video</Text>
            </TouchableOpacity>

            {/* Uploaded Videos List */}
            <Text style={styles.title}>Uploaded Videos</Text>
            {uploadedVideos.length > 0 ? (
                <FlatList
                    data={uploadedVideos}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <View style={styles.videoItem}>
                            <Text style={styles.videoName}>{item.name}</Text>
                            <Text style={styles.videoDescription}>{item.description}</Text>
                            <WebView
                                style={styles.webview}
                                source={{ uri: `https://www.youtube.com/embed/${item.videoId}` }}
                                allowsFullscreenVideo
                            />
                            <View style={styles.videoIconContainer}>
                                <TouchableOpacity onPress={() => handleDeletePress(item.id)} style={styles.deleteButton}>
                                    <FontAwesome name="trash" size={24} color="white" />
                                </TouchableOpacity>
                            </View>
                            {deleteConfirm[item.id] && (
                                <Text style={styles.deleteConfirmText}>Press again to delete the video</Text>
                            )}
                        </View>
                    )}
                />
            ) : (
                <Text style={styles.noVideosText}>No videos uploaded yet.</Text>
            )}
        </View>
    );
}

const { width } = Dimensions.get('window');
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F4F8',
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 26,
        color: '#333',
        fontFamily: 'Poppins-Bold',
        fontWeight: '600',
        textAlign: 'center',
        marginVertical: 20,
    },
    input: {
        backgroundColor: '#fff',
        color: '#333',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 30,
        marginBottom: 15,
        width: '100%',
        fontFamily: 'Poppins-Regular',
        fontSize: 15,
    },
    button: {
        backgroundColor: '#F7C948',
        paddingVertical: 15,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins-Regular',
    },
    errorText: {
        color: '#FF5A5F',
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        marginBottom: 10,
        textAlign: 'center',
    },
    successText: {
        color: '#4CAF50',
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        marginBottom: 10,
        textAlign: 'center',
    },
    videoItem: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 15,
        marginBottom: 10,
        borderColor: '#ddd',
        borderWidth: 1,
    },
    videoName: {
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'Poppins-Bold',
        color: '#333',
    },
    videoDescription: {
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        color: '#555',
        marginTop: 5,
    },
    webview: {
        width: '100%',
        height: 200,
        marginTop: 10,
        borderRadius: 10,
        overflow: 'hidden',
    },
    deleteConfirmText: {
        color: '#FF5A5F',
        fontSize: 14,
        fontFamily: 'Poppins-Regular',
        marginTop: 5,
        textAlign: 'center',
    },
    videoIconContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    deleteButton: {
        padding: 8,
        borderRadius: 15,
        backgroundColor: '#FF5A5F',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButtonText: {
        color: '#fff',
        fontSize: 14,
        fontFamily: 'Poppins-Bold',
    },
    noVideosText: {
        fontSize: 16,
        fontFamily: 'Poppins-Regular',
        color: '#555',
        textAlign: 'center',
        marginTop: 20,
    },
});
