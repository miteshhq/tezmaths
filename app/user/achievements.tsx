// app/achievements/index.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  ImageBackground,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import { auth, database } from "../../firebase/firebaseConfig";
import { ref, onValue } from "firebase/database";

// Define achievement requirements - mix of levels and scores
const ACHIEVEMENTS = [
  { id: 1, type: "level", value: 5, title: "Level 5 Explorer" },
  { id: 2, type: "score", value: 200, title: "200 Points Collector" },
  { id: 3, type: "level", value: 10, title: "Level 10 Master" },
  { id: 4, type: "score", value: 1000, title: "1000 Points Expert" },
  { id: 5, type: "level", value: 15, title: "Level 15 Champion" },
  { id: 6, type: "score", value: 2500, title: "2500 Points Wizard" },
  { id: 7, type: "score", value: 5000, title: "5000 Points Legend" },
  { id: 8, type: "score", value: 25000, title: "25000 Points Grandmaster" },
];

export default function Achievements() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [progressData, setProgressData] = useState<any>({});

  // Fetch user data from Firebase
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const userRef = ref(database, `users/${userId}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setUserData(data);

        // Calculate progress percentages
        const progress: any = {};
        ACHIEVEMENTS.forEach((achievement) => {
          if (achievement.type === "level") {
            const current = data?.currentLevel || 0;
            const progressPercent = Math.min(
              100,
              (current / achievement.value) * 100
            );
            progress[achievement.id] = progressPercent;
          } else if (achievement.type === "score") {
            const current = data?.totalPoints || 0;
            const progressPercent = Math.min(
              100,
              (current / achievement.value) * 100
            );
            progress[achievement.id] = progressPercent;
          }
        });

        setProgressData(progress);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-[#FFF2CC] items-center justify-center">
        <ActivityIndicator size="large" color="#F87720" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white">
      {/* HEADER HERE */}
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-4">
          <View className="flex-row justify-center items-center gap-2">
            <Image
              source={require("../../assets/icons/ribbon-badge.png")}
              style={{ width: 24, height: 24 }}
              tintColor="#FF6B35"
            />
            <Text className="text-white text-3xl font-black">Achievements</Text>
          </View>
        </View>
      </ImageBackground>

      {/* User Stats Summary */}
      <View className="bg-orange-50 mx-4 my-4 p-6 rounded-2xl">
        <Text className="text-2xl font-black text-purple-800 text-center mb-4">
          Your Progress
        </Text>
        <View className="flex-row justify-between">
          <View className="items-center">
            <Text className="text-sm text-gray-500">Level</Text>
            <Text className="text-xl font-bold text-primary">
              {userData?.currentLevel || 1}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-sm text-gray-500">Score</Text>
            <Text className="text-xl font-bold text-primary">
              {userData.totalPoints % 1 !== 0
                ? Math.round(userData.totalPoints * 10) / 10
                : userData.totalPoints || 0}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-sm text-gray-500">Streak</Text>
            <Text className="text-xl font-bold text-primary">
              {userData?.streak || 0}🔥
            </Text>
          </View>
        </View>
      </View>

      {/* Achievements List */}
      <View className="p-4">
        {ACHIEVEMENTS.map((achievement) => {
          // Determine if achievement is completed
          let isCompleted = false;
          let progress = 0;

          if (achievement.type === "level") {
            isCompleted = (userData?.currentLevel || 0) >= achievement.value;
            progress = progressData[achievement.id] || 0;
          } else if (achievement.type === "score") {
            isCompleted = (userData?.totalPoints || 0) >= achievement.value;
            progress = progressData[achievement.id] || 0;
          }

          return (
            <View
              key={achievement.id}
              className={`flex-row items-center gap-4 p-6 mb-4 rounded-2xl ${
                isCompleted ? "bg-white border border-primary" : "bg-orange-50"
              }`}
            >
              <View className="ml-4 flex-1">
                <Text
                  className={`text-lg font-bold ${
                    isCompleted ? "text-black" : "text-gray-500"
                  }`}
                >
                  {achievement.title}
                </Text>

                <Text
                  className={`text-sm ${
                    isCompleted ? "text-primary" : "text-gray-500"
                  }`}
                >
                  {achievement.type === "level"
                    ? `Reach Level ${achievement.value}`
                    : `Earn ${achievement.value} Points`}
                </Text>

                {!isCompleted && (
                  <View className="mt-2">
                    <View className="h-2 bg-gray-300 rounded-full overflow-hidden">
                      <View
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </View>
                    <Text className="text-xs text-gray-500 mt-1">
                      {progress.toFixed(0)}% complete
                    </Text>
                  </View>
                )}
              </View>

              {isCompleted ? (
                <View className="bg-primary w-12 h-12 rounded-full flex items-center justify-center">
                  <FontAwesome name="trophy" size={24} color="white" />
                </View>
              ) : (
                <View className="bg-gray-300 w-12 h-12 rounded-full flex items-center justify-center">
                  <FontAwesome name="lock" size={24} color="white" />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
