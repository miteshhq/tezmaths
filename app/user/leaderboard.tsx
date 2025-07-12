// app/user/leaderboard.tsx
import { FontAwesome } from "@expo/vector-icons";
import { get, limitToLast, orderByChild, query, ref } from "firebase/database";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Text,
  View,
  RefreshControl,
} from "react-native";
import { database, auth } from "../../firebase/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Define interfaces for type safety
interface FirebaseUser {
  username?: string;
  highScore?: number;
  fullName?: string;
  email?: string;
}

interface LeaderboardUser {
  id: string;
  username: string;
  totalPoints: number;
  fullName: string;
  email: string;
  rank: number;
}

// Mock data for when Firebase returns empty results
const mockLeaderboardData: LeaderboardUser[] = [
  {
    id: "1",
    username: "QuizMaster01",
    totalPoints: 2500,
    rank: 1,
    fullName: "Quiz Master",
    email: "",
  },
  {
    id: "2",
    username: "Brainiac",
    totalPoints: 2200,
    rank: 2,
    fullName: "Brainiac",
    email: "",
  },
  {
    id: "3",
    username: "SmartPlayer",
    totalPoints: 1950,
    rank: 3,
    fullName: "Smart Player",
    email: "",
  },
  {
    id: "4",
    username: "ThinkFast",
    totalPoints: 1700,
    rank: 4,
    fullName: "Think Fast",
    email: "",
  },
  {
    id: "5",
    username: "WiseOwl",
    totalPoints: 1500,
    rank: 5,
    fullName: "Wise Owl",
    email: "",
  },
  {
    id: "6",
    username: "CleverCat",
    totalPoints: 1350,
    rank: 6,
    fullName: "Clever Cat",
    email: "",
  },
  {
    id: "7",
    username: "SharpMind",
    totalPoints: 1200,
    rank: 7,
    fullName: "Sharp Mind",
    email: "",
  },
  {
    id: "8",
    username: "QuickWit",
    totalPoints: 1100,
    rank: 8,
    fullName: "Quick Wit",
    email: "",
  },
  {
    id: "9",
    username: "Genius99",
    totalPoints: 1000,
    rank: 9,
    fullName: "Genius",
    email: "",
  },
  {
    id: "10",
    username: "SmartCookie",
    totalPoints: 950,
    rank: 10,
    fullName: "Smart Cookie",
    email: "",
  },
];

export default function LeaderboardScreen() {
  const currentUserId = auth.currentUser?.uid;
  const [quizMasters, setQuizMasters] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const usersRef = query(
        ref(database, "users"),
        orderByChild("highScore"),
        limitToLast(1000) // Increased to ensure we get all users
      );
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const firebaseData = snapshot.val() as Record<string, FirebaseUser>;
        const users = Object.entries(firebaseData)
          .map(
            ([id, user]): LeaderboardUser => ({
              id,
              username: user.username || "Unknown",
              totalPoints: user.highScore ?? 0,
              fullName: user.fullName || "Unknown",
              email: user.email || "",
              rank: 0, // Will be set after sorting
            })
          )
          .filter(
            (user) =>
              user.email !== "tezmaths@admin.com" &&
              user.username.toLowerCase() !== "admin"
          )
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((user, index) => ({ ...user, rank: index + 1 }));

        if (users.length === 0) {
          setQuizMasters(mockLeaderboardData);
        } else {
          // Get top 10 users
          const top10 = users.slice(0, 10);

          // Find current user
          const currentUser = users.find((user) => user.id === currentUserId);

          // Create final leaderboard
          let finalLeaderboard = [...top10];

          // ALWAYS add current user if they exist and are not already in top 10
          if (currentUser) {
            const isInTop10 = top10.some((user) => user.id === currentUserId);
            if (!isInTop10) {
              // Add current user at the end with separator
              finalLeaderboard.push(currentUser);
            }
          }

          setQuizMasters(finalLeaderboard);
        }
      } else {
        setQuizMasters(mockLeaderboardData);
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      setQuizMasters(mockLeaderboardData);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchLeaderboard();
    } catch (error) {
      console.error("Refresh error:", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const initializeLeaderboard = async () => {
      await fetchLeaderboard();
    };

    initializeLeaderboard();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      fetchLeaderboard();
    }
  }, [currentUserId]);

  // Also update the renderQuizMaster to better handle the separator:
  const renderQuizMaster = ({
    item,
    index,
  }: {
    item: LeaderboardUser;
    index: number;
  }) => {
    const isCurrentUser = item.id === currentUserId;
    const isAfterTop10 = item.rank > 10;
    const showSeparator =
      isAfterTop10 && quizMasters.findIndex((user) => user.rank > 10) === index;

    // Get medal icon for top 3
    const getMedalIcon = (rank: number) => {
      switch (rank) {
        case 1:
          return <FontAwesome name="trophy" size={20} color="#FFD700" />;
        case 2:
          return <FontAwesome name="trophy" size={18} color="#C0C0C0" />;
        case 3:
          return <FontAwesome name="trophy" size={16} color="#CD7F32" />;
        default:
          return null;
      }
    };

    return (
      <>
        {/* Add separator before current user if they're not in top 10 */}
        {showSeparator && (
          <View className="mx-4 my-3 flex-row items-center">
            <View className="flex-1 h-px bg-gray-300" />
            <Text className="mx-3 text-gray-500 text-sm font-medium">
              Your Rank
            </Text>
            <View className="flex-1 h-px bg-gray-300" />
          </View>
        )}

        <View
          className={`flex-row items-center p-4 mb-0 mx-0 ${
            isCurrentUser ? "bg-primary/10 border-l-4 border-primary" : ""
          }`}
        >
          <View
            className={`w-8 h-8 rounded-full justify-center items-center mr-4 ${
              isCurrentUser
                ? "bg-primary border-2 border-primary"
                : "bg-primary"
            }`}
          >
            <Text className="text-white text font-black">{item.rank}</Text>
          </View>

          <View className="flex-1">
            <View className="flex-row items-center mb-1">
              <FontAwesome
                name={isCurrentUser ? "user" : "user-circle"}
                size={16}
                color={isCurrentUser ? "#FF6B35" : "#6B7280"}
                className="mr-2"
              />
              <Text
                className={`text-base font-semibold ${
                  isCurrentUser ? "text-primary" : "text-black"
                }`}
              >
                {isCurrentUser ? `${item.fullName} (You)` : item.fullName}
              </Text>
            </View>
            <View className="flex-row items-center">
              <FontAwesome
                name="star"
                size={14}
                color={isCurrentUser ? "#FF6B35" : "#F59E0B"}
                className="mr-1"
              />
              <Text
                className={`text-sm ${
                  isCurrentUser ? "text-primary font-semibold" : "text-gray-600"
                }`}
              >
                {item.totalPoints % 1 !== 0
                  ? Math.round(item.totalPoints * 10) / 10
                  : item.totalPoints || 0}{" "}
                points
              </Text>
            </View>
          </View>

          <View className="ml-2">
            {getMedalIcon(item.rank)}
            {isCurrentUser && !getMedalIcon(item.rank) && (
              <FontAwesome name="star" size={16} color="#FF6B35" />
            )}
          </View>
        </View>
      </>
    );
  };

  const renderHeader = () => (
    <ImageBackground
      source={require("../../assets/gradient.jpg")}
      style={{ overflow: "hidden", marginTop: 20 }}
    >
      <View className="px-4 py-4">
        <View className="flex-row justify-center items-center gap-2">
          <Image
            source={require("../../assets/icons/leaderboard.png")}
            style={{ width: 24, height: 24 }}
            tintColor="#FF6B35"
          />
          <Text className="text-white text-3xl font-black">Leaderboard</Text>
        </View>
      </View>
    </ImageBackground>
  );

  return (
    <View className="flex-1 bg-white">
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#primary" />
          <Text className="text-gray-600 text-base mt-4">
            Loading Leaderboard...
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          {renderHeader()}
          <View className="p-4 flex-1">
            <View className="flex-1 py-4 border border-black rounded-2xl">
              <FlatList
                data={quizMasters}
                renderItem={renderQuizMaster}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#FF6B35"
                    colors={["#FF6B35"]}
                  />
                }
                ListHeaderComponent={() => (
                  <View className="flex flex-row items-center gap-1 justify-center pb-4 border-b border-black mb-4">
                    <Image
                      source={require("../../assets/icons/ribbon-badge.png")}
                      style={{ width: 28, height: 28 }}
                      tintColor={"#FF6B35"}
                    />
                    <Text className="font-black text-center text-3xl text-custom-purple">
                      Top Quiz Masters
                    </Text>
                  </View>
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
