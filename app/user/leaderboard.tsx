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
} from "react-native";
import { database } from "../../firebase/firebaseConfig";

// Mock data for when Firebase returns empty results
const mockLeaderboardData = [
  { id: "1", username: "QuizMaster01", totalPoints: 2500, rank: 1 },
  { id: "2", username: "Brainiac", totalPoints: 2200, rank: 2 },
  { id: "3", username: "SmartPlayer", totalPoints: 1950, rank: 3 },
  { id: "4", username: "ThinkFast", totalPoints: 1700, rank: 4 },
  { id: "5", username: "WiseOwl", totalPoints: 1500, rank: 5 },
  { id: "6", username: "CleverCat", totalPoints: 1350, rank: 6 },
  { id: "7", username: "SharpMind", totalPoints: 1200, rank: 7 },
  { id: "8", username: "QuickWit", totalPoints: 1100, rank: 8 },
  { id: "9", username: "Genius99", totalPoints: 1000, rank: 9 },
  { id: "10", username: "SmartCookie", totalPoints: 950, rank: 10 },
];

export default function LeaderboardScreen() {
  const [quizMasters, setQuizMasters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        // Fetch data from Firebase directly
        const usersRef = query(
          ref(database, "users"),
          orderByChild("points"),
          limitToLast(100)
        );
        const snapshot = await get(usersRef);

        if (snapshot.exists()) {
          const users = Object.entries(snapshot.val())
            .map(([id, user]) => ({
              id,
              username: user.username || "Unknown",
              totalPoints: user.totalPoints ?? 0,
              fullName: user.fullName || "Unknown",
            }))
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .map((user, index) => ({ ...user, rank: index + 1 }));

          // If no users found or empty array, use mock data
          if (users.length === 0) {
            // console.log("No users found, using mock data");
            setQuizMasters(mockLeaderboardData);
          } else {
            setQuizMasters(users);
            // console.log("Fetched leaderboard data from Firebase:", users);
          }
        } else {
          // console.log("No users found in the database, using mock data");
          setQuizMasters(mockLeaderboardData);
        }
      } catch (error) {
        console.error("Failed to fetch leaderboard, using mock data:", error);
        setQuizMasters(mockLeaderboardData);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const renderQuizMaster = ({ item }) => {
    // Get medal icon for top 3
    const getMedalIcon = (rank) => {
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
      <View className="flex-row items-center p-4 mb-0 mx-0">
        <View className="w-8 h-8 rounded-full bg-primary justify-center items-center mr-4">
          <Text className="text-white text font-black">{item.rank}</Text>
        </View>

        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <FontAwesome
              name="user-circle"
              size={16}
              color="#6B7280"
              className="mr-2"
            />
            <Text className="text-gray-800 text-base font-semibold">
              {item.fullName}
            </Text>
          </View>
          <View className="flex-row items-center">
            <FontAwesome
              name="star"
              size={14}
              color="#F59E0B"
              className="mr-1"
            />
            <Text className="text-gray-600 text-sm">
              {item.totalPoints % 1 !== 0
                ? Math.round(item.totalPoints * 10) / 10
                : item.totalPoints || 0}{" "}
              points
            </Text>
          </View>
        </View>

        <View className="ml-2">{getMedalIcon(item.rank)}</View>
      </View>
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

  const renderTopThree = () => {
    const topThree = quizMasters.slice(0, 3);
    if (topThree.length === 0) return null;

    return (
      <View className="mx-4 mb-6">
        <View className="flex-row justify-center items-end space-x-4">
          {/* Second Place */}
          {topThree[1] && (
            <View className="items-center">
              <View className="w-16 h-16 rounded-full bg-gray-300 justify-center items-center mb-2">
                <FontAwesome name="user" size={24} color="white" />
              </View>
              <FontAwesome name="trophy" size={20} color="#C0C0C0" />
              <Text className="text-gray-800 font-semibold text-sm mt-1">
                {topThree[1].username}
              </Text>
              <Text className="text-gray-600 text-xs">
                {topThree[1].totalPoints} pts
              </Text>
            </View>
          )}

          {/* First Place */}
          {topThree[0] && (
            <View className="items-center -mt-4">
              <View className="w-20 h-20 rounded-full bg-primary justify-center items-center mb-2 border-4 border-yellow-400">
                <FontAwesome name="user" size={28} color="white" />
              </View>
              <FontAwesome name="trophy" size={24} color="#FFD700" />
              <Text className="text-gray-800 font-bold text-base mt-1">
                {topThree[0].username}
              </Text>
              <Text className="text-primary font-semibold text-sm">
                {topThree[0].totalPoints} pts
              </Text>
            </View>
          )}

          {/* Third Place */}
          {topThree[2] && (
            <View className="items-center">
              <View className="w-16 h-16 rounded-full bg-orange-400 justify-center items-center mb-2">
                <FontAwesome name="user" size={24} color="white" />
              </View>
              <FontAwesome name="trophy" size={20} color="#CD7F32" />
              <Text className="text-gray-800 font-semibold text-sm mt-1">
                {topThree[2].username}
              </Text>
              <Text className="text-gray-600 text-xs">
                {topThree[2].totalPoints} pts
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

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
        <>
          {renderHeader()}
          <View className="p-4 flex-1">
            <FlatList
              data={quizMasters}
              renderItem={renderQuizMaster}
              keyExtractor={(item) => item.id}
              className="flex-1 py-4 border border-black rounded-2xl"
              ListHeaderComponent={() => (
                <>
                  {/* {renderTopThree()} */}
                  <View className="flex flex-row items-center gap-1 justify-center pb-4 border-b border-black mb-4">
                    <Image
                      source={require("../../assets/icons/ribbon-badge.png")}
                      style={{ width: 28, height: 28 }}
                      tintColor={"#FF6B35"}
                    />
                    <Text className="font-black text-center text-3xl text-purple-800">
                      Top Quiz Masters
                    </Text>
                  </View>
                </>
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </>
      )}
    </View>
  );
}
