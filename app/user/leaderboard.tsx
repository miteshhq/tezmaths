// app/user/leaderboard.tsx
import { FontAwesome } from "@expo/vector-icons";
import { get, ref } from "firebase/database";
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
  highScore: number;
  fullName: string;
  email: string;
  rank: number;
}

export default function LeaderboardScreen() {
  const currentUserId = auth.currentUser?.uid;
  const [quizMasters, setQuizMasters] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      // Fetch all users without ordering (no index required)
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const firebaseData = snapshot.val() as Record<string, FirebaseUser>;
        const users = Object.entries(firebaseData)
          .map(
            ([id, user]): LeaderboardUser => ({
              id,
              username: user.username || "Unknown",
              highScore: user.highScore ?? 0,
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
          .sort((a, b) => b.highScore - a.highScore)
          .map((user, index) => ({ ...user, rank: index + 1 }));

        // Get top users (up to 10 if available, but could be less)
        const topUsers = users.slice(0, 10);

        // Find current user
        const currentUser = users.find((user) => user.id === currentUserId);

        // console.log(currentUser);

        // Create final leaderboard
        let finalLeaderboard = [...topUsers];

        // Add current user if they exist and are not already in the top users
        if (currentUser) {
          const isInTopUsers = topUsers.some(
            (user) => user.id === currentUserId
          );
          if (!isInTopUsers) {
            // Add current user at the end
            finalLeaderboard.push(currentUser);
          }
        }

        setQuizMasters(finalLeaderboard);
      } else {
        // If no data exists, set empty array
        setQuizMasters([]);
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      // On error, set empty array instead of mock data
      setQuizMasters([]);
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

  const renderQuizMaster = ({
    item,
    index,
  }: {
    item: LeaderboardUser;
    index: number;
  }) => {
    const isCurrentUser = item.id === currentUserId;

    // Determine if current user is after the top ranked users
    const topRankedUsers = quizMasters.filter((user) => user.rank <= 10);
    const isAfterTopRanked = item.rank > 10 && topRankedUsers.length > 0;

    // Show separator only before current user if they're not in top rankings
    const showSeparator = isAfterTopRanked && isCurrentUser;

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
        {/* Add separator before current user if they're not in top rankings */}
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
                {item.highScore % 1 !== 0
                  ? Math.round(item.highScore * 10) / 10
                  : item.highScore || 0}{" "}
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

  const renderEmptyState = () => (
    <View className="flex-1 justify-center items-center py-8">
      <FontAwesome name="trophy" size={48} color="#D1D5DB" />
      <Text className="text-gray-500 text-lg font-medium mt-4">
        No rankings available yet
      </Text>
      <Text className="text-gray-400 text-sm mt-2 text-center px-4">
        Start playing quizzes to see your ranking on the leaderboard
      </Text>
    </View>
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
              {quizMasters.length > 0 ? (
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
              ) : (
                <View className="flex-1">
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
                  {renderEmptyState()}
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
