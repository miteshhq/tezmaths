import { FontAwesome } from "@expo/vector-icons";
import { get, push, ref, remove, set } from "firebase/database";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Linking,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { database } from "../../firebase/firebaseConfig";

export default function VideoManagement() {
  const [videoName, setVideoName] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState({});

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const videosRef = ref(database, "videos");
        const videosSnapshot = await get(videosRef);
        if (videosSnapshot.exists()) {
          const videosData = videosSnapshot.val();
          const videoList = Object.keys(videosData)
            .map((key) => ({
              id: key,
              ...videosData[key],
            }))
            .reverse();
          setUploadedVideos(videoList);
        }
      } catch (error) {
        setErrorMessage("Failed to fetch videos");
      }
    };
    fetchVideos();
  }, []);

  const getYoutubeVideoId = (url) => {
    const match = url.match(
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
    );
    return match ? match[1] : null;
  };

  useEffect(() => {
    if (errorMessage || successMessage) {
      const timer = setTimeout(() => {
        setErrorMessage("");
        setSuccessMessage("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage, successMessage]);

  const uploadVideo = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (!videoName.trim() || !description.trim() || !videoUrl.trim()) {
      setErrorMessage("All fields are required");
      return;
    }

    if (videoName.length > 120 || description.length > 120) {
      setErrorMessage("Name and description must be under 120 characters");
      return;
    }

    const videoId = getYoutubeVideoId(videoUrl);
    if (!videoId) {
      setErrorMessage("Invalid YouTube URL");
      return;
    }

    try {
      const newVideoRef = push(ref(database, "videos"));
      await set(newVideoRef, {
        name: videoName.trim(),
        description: description.trim(),
        videoId,
        timestamp: Date.now(),
      });

      const newVideo = {
        id: newVideoRef.key,
        name: videoName.trim(),
        description: description.trim(),
        videoId,
      };

      setUploadedVideos((prev) => [newVideo, ...prev]);
      setVideoName("");
      setDescription("");
      setVideoUrl("");
      setSuccessMessage("Video uploaded successfully!");
    } catch (error) {
      setErrorMessage("Failed to upload video. Please try again.");
    }
  };

  const handleDeletePress = (videoId, videoName) => {
    if (deleteConfirm[videoId]) {
      Alert.alert(
        "Delete Video",
        `Are you sure you want to delete "${videoName}"?`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () =>
              setDeleteConfirm((prev) => ({ ...prev, [videoId]: false })),
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const videoRef = ref(database, `videos/${videoId}`);
                await remove(videoRef);
                setUploadedVideos((prevVideos) =>
                  prevVideos.filter((video) => video.id !== videoId)
                );
                setDeleteConfirm((prev) => ({ ...prev, [videoId]: false }));
                setSuccessMessage("Video deleted successfully!");
              } catch (error) {
                setErrorMessage("Failed to delete video");
              }
            },
          },
        ]
      );
    } else {
      setDeleteConfirm((prev) => ({ ...prev, [videoId]: true }));
      setTimeout(() => {
        setDeleteConfirm((prev) => ({ ...prev, [videoId]: false }));
      }, 3000);
    }
  };

  const renderVideoItem = ({ item }) => (
    <View className="bg-white p-4 rounded-xl mb-4 border border-gray-200">
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1 pr-3">
          <Text
            className="text-lg font-semibold text-black mb-1"
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <Text className="text-sm text-gray-600 leading-5" numberOfLines={3}>
            {item.description}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleDeletePress(item.id, item.name)}
          className={`p-3 rounded-xl ${
            deleteConfirm[item.id] ? "bg-green-500" : "bg-red-500"
          }`}
        >
          <FontAwesome
            name={deleteConfirm[item.id] ? "check" : "trash"}
            size={18}
            color="white"
          />
        </TouchableOpacity>
      </View>
      <View className="mb-3">
        <Text className="text-sm font-medium text-gray-700 mb-2">
          ▶️ Watch Video:
        </Text>
        <View className="rounded-xl overflow-hidden border border-gray-200 bg-black">
          <WebView
            style={{ width: Dimensions.get("window").width - 68, height: 200 }}
            source={{
              uri: `https://www.youtube.com/embed/${item.videoId}`,
            }}
            allowsFullscreenVideo
          />
        </View>
        <View className="bg-primary-100 px-4 py-2 rounded-b-lg border-t border-primary-200">
          <Text className="text-xs text-primary-600 font-medium text-center">
            🎬 Video plays directly in the app • Tap fullscreen for better
            experience
          </Text>
        </View>
      </View>
      <View className="bg-custom-gray p-3 rounded-lg">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Video Details
          </Text>
          <TouchableOpacity
            onPress={async () => {
              const youtubeUrl = `https://www.youtube.com/watch?v=${item.videoId}`;
              try {
                const supported = await Linking.canOpenURL(youtubeUrl);
                if (supported) {
                  await Linking.openURL(youtubeUrl);
                } else {
                  Alert.alert("Error", "Cannot open YouTube link");
                }
              } catch (error) {
                Alert.alert("Error", "Failed to open YouTube link");
              }
            }}
            className="flex-row items-center bg-red-50 px-2 py-1 rounded-md"
          >
            <FontAwesome name="youtube-play" size={12} color="#FF0000" />
            <Text className="text-xs text-red-600 ml-1 font-medium">
              Open in YouTube
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center mb-1">
          <FontAwesome name="play" size={12} color="#6B7280" />
          <Text className="text-xs text-gray-600 ml-2">
            Video ID: {item.videoId}
          </Text>
        </View>
        <View className="flex-row items-center">
          <FontAwesome name="calendar" size={12} color="#6B7280" />
          <Text className="text-xs text-gray-600 ml-2">
            Added: {new Date(item.timestamp).toLocaleDateString()}
          </Text>
        </View>
      </View>
      {deleteConfirm[item.id] && (
        <Text className="text-red-500 text-sm text-center mt-3 bg-red-50 py-2 rounded-lg">
          Tap delete again to confirm
        </Text>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-custom-gray">
      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        <View className="p-6">
          <Text className="text-3xl font-bold text-black text-center mb-2">
            Video Management
          </Text>
          <Text className="text-gray-600 text-center mb-8">
            Add and manage YouTube videos
          </Text>
        </View>
        <View className="bg-white mx-5 p-6 rounded-2xl shadow-sm border border-gray-200 mb-6">
          <Text className="text-xl font-semibold text-gray-700 mb-4">
            Add New Video
          </Text>
          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-2">
              Video Name
            </Text>
            <TextInput
              className="bg-white border border-gray-300 rounded-lg p-3"
              placeholder="Enter video name"
              placeholderTextColor="#9CA3AF"
              value={videoName}
              onChangeText={(text) => setVideoName(text.slice(0, 120))}
            />
            <Text className="text-xs text-gray-600 text-right mt-1">
              {videoName.length}/120
            </Text>
          </View>
          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-2">
              Description
            </Text>
            <TextInput
              className="bg-white border border-gray-300 rounded-lg p-3 h-24"
              placeholder="Enter video description"
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={(text) => setDescription(text.slice(0, 120))}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text className="text-xs text-gray-600 text-right mt-1">
              {description.length}/120
            </Text>
          </View>
          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-2">
              YouTube URL
            </Text>
            <TextInput
              className="bg-white border border-gray-300 rounded-lg p-3"
              placeholder="https://www.youtube.com/watch?v=..."
              placeholderTextColor="#9CA3AF"
              value={videoUrl}
              onChangeText={setVideoUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>
          {errorMessage ? (
            <View className="flex-row items-center mb-4 px-3 py-2 bg-red-50 rounded-lg">
              <FontAwesome
                name="exclamation-circle"
                size={16}
                color="#EF4444"
              />
              <Text className="text-red-600 text-sm ml-2 flex-1">
                {errorMessage}
              </Text>
            </View>
          ) : null}
          {successMessage ? (
            <View className="flex-row items-center mb-4 px-3 py-2 bg-green-50 rounded-lg">
              <FontAwesome name="check-circle" size={16} color="#10B981" />
              <Text className="text-green-600 text-sm ml-2 flex-1">
                {successMessage}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            className="bg-primary py-3 px-6 rounded-xl text-white font-medium flex-row items-center justify-center"
            onPress={uploadVideo}
          >
            <FontAwesome name="upload" size={18} color="white" />
            <Text className="text-white font-medium text-lg ml-2">
              Upload Video
            </Text>
          </TouchableOpacity>
        </View>
        <View className="mx-5 mb-6">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-semibold text-gray-700">
              Uploaded Videos
            </Text>
            <View className="bg-primary px-3 py-1 rounded-full">
              <Text className="text-white text-sm font-medium">
                {uploadedVideos.length}
              </Text>
            </View>
          </View>
          {uploadedVideos.length > 0 ? (
            <FlatList
              data={uploadedVideos}
              keyExtractor={(item) => item.id}
              renderItem={renderVideoItem}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View className="bg-white p-6 rounded-2xl border border-gray-200 items-center">
              <FontAwesome name="video-camera" size={48} color="#D1D5DB" />
              <Text className="text-lg font-semibold text-black mt-4 mb-2">
                No videos yet
              </Text>
              <Text className="text-gray-600 text-center">
                Upload your first YouTube video to get started
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
