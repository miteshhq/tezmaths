// app/user/learn.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Linking,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { ref, get } from "firebase/database";
import { database } from "../../firebase/firebaseConfig";
import { WebView } from "react-native-webview";
import { FontAwesome, MaterialIcons } from "@expo/vector-icons";

// Mock data for when Firebase returns empty results
const mockVideosData = [
  {
    id: "1",
    name: "Basic Multiplication Tricks",
    description:
      "Learn quick multiplication techniques that will help you solve problems faster and more efficiently.",
    videoId: "dQw4w9WgXcQ", // Sample YouTube video ID
  },
  {
    id: "2",
    name: "Division Made Simple",
    description:
      "Master division with easy-to-follow methods and practice examples.",
    videoId: "dQw4w9WgXcQ",
  },
  {
    id: "3",
    name: "Fraction Fundamentals",
    description: "Understanding fractions from basics to advanced operations.",
    videoId: "dQw4w9WgXcQ",
  },
  {
    id: "4",
    name: "Algebra Basics",
    description:
      "Introduction to algebraic concepts and solving simple equations.",
    videoId: "dQw4w9WgXcQ",
  },
  {
    id: "5",
    name: "Geometry Essentials",
    description:
      "Learn about shapes, angles, and basic geometric calculations.",
    videoId: "dQw4w9WgXcQ",
  },
  {
    id: "6",
    name: "Mental Math Techniques",
    description:
      "Develop your mental calculation skills with proven techniques.",
    videoId: "dQw4w9WgXcQ",
  },
];

export default function LearnScreen() {
  const [videos, setVideos] = useState([]);
  const [filteredVideos, setFilteredVideos] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const videosRef = ref(database, "videos");
        const videosSnapshot = await get(videosRef);

        if (videosSnapshot.exists()) {
          const videosData = videosSnapshot.val();
          const videoList = Object.keys(videosData).map((key) => ({
            id: key,
            ...videosData[key],
          }));

          // If no videos found or empty array, use mock data
          // Add to your fetchVideos function
          if (videoList.length === 0) {
            console.log("No videos found, using mock data");

            // Attempt to write mock data to DB for future use
            try {
              const videosRef = ref(database, "videos");
              await set(videosRef, mockVideosData);
              console.log("Mock videos written to database");

              // Use the mock data we just wrote
              setVideos(mockVideosData);
              setFilteredVideos(mockVideosData);
            } catch (error) {
              console.error("Failed to write mock videos:", error);
              setVideos(mockVideosData);
              setFilteredVideos(mockVideosData);
            }
          } else {
            setVideos(videoList);
            setFilteredVideos(videoList);
            console.log("Fetched videos from Firebase:", videoList);
          }
        } else {
          console.log("No videos found in database, using mock data");
          setVideos(mockVideosData);
          setFilteredVideos(mockVideosData);
        }
      } catch (error) {
        console.error("Failed to fetch videos, using mock data:", error);
        setVideos(mockVideosData);
        setFilteredVideos(mockVideosData);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query === "") {
      setFilteredVideos(videos);
    } else {
      const filtered = videos.filter((video) =>
        video.name.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredVideos(filtered);
    }
  };

  const openYoutubeVideo = (videoId) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        console.log("Don't know how to open URI: " + url);
      }
    });
  };

  const renderVideoContent = (item) => {
    // Check if we can use WebView on this platform
    if (Platform.OS === "web" || !item.videoId) {
      return (
        <TouchableOpacity
          className="w-full aspect-video bg-gray-100 justify-center items-center rounded-xl border border-gray-200"
          onPress={() => item.videoId && openYoutubeVideo(item.videoId)}
        >
          <View className="items-center">
            <FontAwesome name="youtube-play" size={48} color="#FF0000" />
            <Text className="text-red-500 font-medium text-base mt-2">
              {item.videoId ? "Watch on YouTube" : "No video available"}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // For platforms that support WebView
    try {
      return (
        <View className="w-full aspect-video overflow-hidden rounded-xl">
          <WebView
            className="w-full h-full"
            source={{ uri: `https://www.youtube.com/embed/${item.videoId}` }}
            allowsFullscreenVideo
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        </View>
      );
    } catch (error) {
      console.log("WebView error:", error);
      return (
        <TouchableOpacity
          className="w-full aspect-video bg-gray-100 justify-center items-center rounded-xl border border-gray-200"
          onPress={() => openYoutubeVideo(item.videoId)}
        >
          <View className="items-center">
            <FontAwesome name="youtube-play" size={48} color="#FF0000" />
            <Text className="text-red-500 font-medium text-base mt-2">
              Watch on YouTube
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
  };

  const renderHeader = () => (
    <View className="mb-6">
      <View className="bg-primary rounded-2xl p-6 mx-4 mb-4">
        <View className="items-center">
          <MaterialIcons name="school" size={32} color="white" />
          <Text className="text-white text-2xl font-bold text-center mt-2">
            Educational Videos
          </Text>
          <Text className="text-white/80 text-sm text-center mt-1">
            Learn with engaging video content
          </Text>
        </View>
      </View>

      <View className="mx-4">
        <View className="relative">
          <TextInput
            className="bg-white text-gray-800 py-3 pl-12 pr-4 rounded-xl text-base border border-gray-200"
            placeholder="Search videos by name"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={handleSearch}
          />
          <FontAwesome
            name="search"
            size={18}
            color="#9CA3AF"
            className="absolute left-4 top-4"
            style={{ position: "absolute", left: 16, top: 14 }}
          />
        </View>
      </View>
    </View>
  );

  const renderVideoItem = ({ item, index }) => (
    <View className="bg-white rounded-2xl p-4 mx-4 mb-4 shadow-sm border border-gray-100">
      <View className="flex-row items-start mb-3">
        <View className="w-10 h-10 rounded-full bg-primary justify-center items-center mr-3">
          <Text className="text-white text-sm font-bold">{index + 1}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-gray-800 text-lg font-bold mb-1">
            {item.name}
          </Text>
          <Text className="text-gray-600 text-sm leading-5">
            {item.description}
          </Text>
        </View>
      </View>

      <View className="mt-3">{renderVideoContent(item)}</View>

      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <View className="flex-row items-center">
          <FontAwesome name="play-circle" size={16} color="#6B7280" />
          <Text className="text-gray-500 text-sm ml-2">
            Educational Content
          </Text>
        </View>
        <TouchableOpacity
          className="flex-row items-center bg-primary/10 px-3 py-1 rounded-full"
          onPress={() => item.videoId && openYoutubeVideo(item.videoId)}
        >
          <FontAwesome name="external-link" size={12} color="#primary" />
          <Text className="text-primary text-xs font-medium ml-1">Open</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View className="flex-1 justify-center items-center px-8">
      <MaterialIcons name="search-off" size={64} color="#9CA3AF" />
      <Text className="text-gray-500 text-lg font-semibold mt-4 text-center">
        No videos found
      </Text>
      <Text className="text-gray-400 text-sm text-center mt-2">
        Try adjusting your search terms or check back later for new content.
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-gray-50">
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#primary" />
          <Text className="text-gray-600 text-base mt-4">
            Loading videos...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredVideos}
          keyExtractor={(item) => item.id}
          renderItem={renderVideoItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 20,
            ...(filteredVideos.length === 0 && { flexGrow: 1 }),
          }}
        />
      )}
    </View>
  );
}
