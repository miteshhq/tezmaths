// app/user/learn.tsx
import { FontAwesome, MaterialIcons } from "@expo/vector-icons";
import { get, ref, set } from "firebase/database"; // Added 'set' import
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Linking,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { WebView } from "react-native-webview";
import { database } from "../../firebase/firebaseConfig";

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

interface Video {
  id: string;
  name: string;
  description: string;
  videoId: string;
}

export default function LearnScreen() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
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
          if (videoList.length === 0) {
            try {
              const videosRef = ref(database, "videos");
              await set(videosRef, mockVideosData);
              setVideos(mockVideosData);
              setFilteredVideos(mockVideosData);
            } catch (error) {
              setVideos(mockVideosData);
              setFilteredVideos(mockVideosData);
            }
          } else {
            setVideos(videoList);
            setFilteredVideos(videoList);
          }
        } else {
          setVideos(mockVideosData);
          setFilteredVideos(mockVideosData);
        }
      } catch (error) {
        setVideos(mockVideosData);
        setFilteredVideos(mockVideosData);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  // Memoize the handleSearch function to prevent recreating it on every render
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (query === "") {
        setFilteredVideos(videos);
      } else {
        const filtered = videos.filter((video) =>
          video.name.toLowerCase().includes(query.toLowerCase())
        );
        setFilteredVideos(filtered);
      }
    },
    [videos]
  );

  const openYoutubeVideo = (videoId: string) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      }
    });
  };

  const renderVideoContent = (item: Video) => {
    // Check if we can use WebView on this platform
    if (Platform.OS === "web" || !item.videoId) {
      return (
        <TouchableOpacity
          style={styles.videoContainer}
          onPress={() => item.videoId && openYoutubeVideo(item.videoId)}
        >
          <View style={styles.videoPlaceholder}>
            <FontAwesome name="youtube-play" size={48} color="#FF0000" />
            <Text style={styles.youtubeText}>
              {item.videoId ? "Watch on YouTube" : "No video available"}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // For platforms that support WebView
    try {
      return (
        <View style={styles.webViewContainer}>
          <WebView
            style={styles.webView}
            source={{ uri: `https://www.youtube.com/embed/${item.videoId}` }}
            allowsFullscreenVideo
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        </View>
      );
    } catch (error) {
      return (
        <TouchableOpacity
          style={styles.videoContainer}
          onPress={() => openYoutubeVideo(item.videoId)}
        >
          <View style={styles.videoPlaceholder}>
            <FontAwesome name="youtube-play" size={48} color="#FF0000" />
            <Text style={styles.youtubeText}>Watch on YouTube</Text>
          </View>
        </TouchableOpacity>
      );
    }
  };

  const renderVideoItem = ({ item }: { item: Video }) => (
    <View style={styles.videoItem}>
      <View style={styles.videoHeader}>
        <View style={styles.videoTitleContainer}>
          <Text style={styles.videoTitle}>{item.name}</Text>
        </View>
      </View>

      <View style={styles.videoContentContainer}>
        {renderVideoContent(item)}
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialIcons name="search-off" size={64} color="#9CA3AF" />
      <Text style={styles.emptyStateTitle}>No videos found</Text>
      <Text style={styles.emptyStateSubtitle}>
        Try adjusting your search terms or check back later for new content.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading videos...</Text>
        </View>
      ) : (
        <View style={styles.mainContainer}>
          {/* HEADER HERE */}
          <ImageBackground
            source={require("../../assets/gradient.jpg")}
            style={styles.headerBackground}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerTitleContainer}>
                <Image
                  source={require("../../assets/icons/learn.png")}
                  style={styles.headerIcon}
                  tintColor="#FF6B35"
                />
                <Text style={styles.headerTitle}>Learning</Text>
              </View>
            </View>
          </ImageBackground>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <View style={styles.searchWrapper}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search videos by name"
                  placeholderTextColor="#9CA3AF"
                  value={searchQuery}
                  onChangeText={handleSearch}
                />
                <FontAwesome
                  name="search"
                  size={18}
                  color="#9CA3AF"
                  style={styles.searchIcon}
                />
              </View>
            </View>
          </View>

          <FlatList
            data={filteredVideos}
            keyExtractor={(item) => item.id}
            renderItem={renderVideoItem}
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.flatListContent,
              filteredVideos.length === 0 && styles.flatListEmpty,
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 16,
    marginTop: 16,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: "white",
  },
  headerBackground: {
    overflow: "hidden",
    marginTop: 20,
  },
  headerContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTitleContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    width: 24,
    height: 24,
  },
  headerTitle: {
    color: "white",
    fontSize: 30,
    fontWeight: "900",
  },
  searchContainer: {
    marginBottom: 24,
  },
  searchInputContainer: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  searchWrapper: {
    position: "relative",
  },
  searchInput: {
    backgroundColor: "white",
    color: "black",
    paddingVertical: 12,
    paddingLeft: 48,
    paddingRight: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchIcon: {
    position: "absolute",
    left: 16,
    top: 14,
  },
  videoItem: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#8B5CF6",
  },
  videoHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  videoTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  videoTitle: {
    color: "#8B5CF6",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  videoContentContainer: {
    marginTop: 12,
  },
  videoContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  videoPlaceholder: {
    alignItems: "center",
  },
  youtubeText: {
    color: "#EF4444",
    fontWeight: "500",
    fontSize: 16,
    marginTop: 8,
  },
  webViewContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 12,
  },
  webView: {
    width: "100%",
    height: "100%",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    color: "#6B7280",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  flatListContent: {
    paddingBottom: 20,
  },
  flatListEmpty: {
    flexGrow: 1,
  },
});
