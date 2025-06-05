import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { get, ref } from "firebase/database";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import SoundManager from "../../components/soundManager";
import { auth, database } from "../../firebase/firebaseConfig";

export default function LevelSelect() {
  const router = useRouter();

  // State variables
  const [currentLevel, setCurrentLevel] = useState(1);
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxLevel] = useState(6); // You can make this dynamic if needed

  // Back handler setup
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.back();
        return true;
      };
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => backHandler.remove();
    }, [router])
  );

  // Load user data and completed levels
  const loadUserData = useCallback(async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch user data
      const userRef = ref(database, `users/${userId}`);
      const userSnapshot = await get(userRef);

      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();

        // Process completed levels first
        let completedLevelsArray: number[] = [];
        if (userData.completedLevels) {
          // Convert the completedLevels object to an array
          Object.entries(userData.completedLevels).forEach(
            ([level, isCompleted]) => {
              if (isCompleted === true) {
                completedLevelsArray.push(parseInt(level));
              }
            }
          );
        }
        setCompletedLevels(completedLevelsArray);

        // Set current level logic:
        // If user has a saved currentLevel, use it
        // Otherwise, set to the next uncompleted level
        let userCurrentLevel = userData.currentLevel || 1;

        // If the current level is already completed, move to next uncompleted level
        if (completedLevelsArray.includes(userCurrentLevel)) {
          // Find the next uncompleted level
          for (let i = 1; i <= maxLevel; i++) {
            if (!completedLevelsArray.includes(i)) {
              userCurrentLevel = i;
              break;
            }
          }
        }

        setCurrentLevel(userCurrentLevel);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      Alert.alert("Error", "Failed to load level data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [maxLevel]);

  // Load data on focus
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [loadUserData])
  );

  // Handle level selection
  const handleLevelSelect = async (level: number) => {
    try {
      await Promise.all([
        SoundManager.stopSound("levelSoundEffect"),
        SoundManager.stopSound("clappingSoundEffect"),
        SoundManager.stopSound("victorySoundEffect"),
        SoundManager.stopSound("failSoundEffect"),
      ]);

      router.push({
        pathname: "/user/quiz-screen",
        params: {
          level: level.toString(),
          isSelectedLevel: "true",
        },
      });
    } catch (error) {
      console.error("Error navigating to quiz:", error);
    }
  };

  // Handle continue button (for current level)
  const handleContinue = () => {
    // console.log(`Starting current level: ${currentLevel}`);
    handleLevelSelect(currentLevel);
  };

  // Handle back button
  const handleBack = async () => {
    try {
      await SoundManager.stopSound("levelSoundEffect");
      router.back();
    } catch (error) {
      console.error("Error going back:", error);
      router.back();
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <StatusBar barStyle="light-content" backgroundColor="#fff" />
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text className="text-gray-600 mt-4">Loading levels...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={require("../../assets/gradient.jpg")}
          style={{ overflow: "hidden", marginTop: 20 }}
        >
          <View className="px-4 py-4">
            <View className="flex-row justify-center items-center gap-2">
              <Image
                source={require("../../assets/icons/quiz.png")}
                style={{ width: 24, height: 24 }}
                tintColor="#FF6B35"
              />
              <Text className="text-white text-3xl font-black">Quiz Time</Text>
            </View>
          </View>
        </ImageBackground>

        <View className="relative py-12">
          <View className="absolute w-2 left-1/2 top-12 -translate-x-0.5 bg-gray-800 h-full"></View>

          {/* Continue Button */}
          <View className="px-6 mb-8">
            <TouchableOpacity
              onPress={handleContinue}
              className="bg-primary rounded-2xl px-8 py-2"
            >
              <Text className="text-white text-lg font-bold text-center">
                Continue Level {currentLevel}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Select Level Section */}
          <View className="items-center mb-8">
            <View className="border-4 border-black rounded-full w-40 h-40 justify-center items-center bg-white">
              <Text className="text-white bg-gray-900 rounded-xl px-4 py-2 text-lg font-bold text-center">
                Select Level
              </Text>
            </View>
          </View>

          {/* Level Buttons */}
          <View className="flex flex-col gap-4">
            {Array.from({ length: maxLevel }, (_, i) => {
              const level = i + 1;
              const isCompleted = completedLevels.includes(level);
              const isCurrent = level === currentLevel;
              const isUnlocked = level <= currentLevel;

              return (
                <View key={level} className="items-center mb-4">
                  <TouchableOpacity
                    className={`w-16 h-16 rounded-full justify-center items-center border-2 border-white shadow-lg ${
                      isCompleted
                        ? "bg-green-500"
                        : isCurrent
                        ? "bg-primary"
                        : isUnlocked
                        ? "bg-primary"
                        : "bg-gray-300"
                    }`}
                    onPress={() => isUnlocked && handleLevelSelect(level)}
                    disabled={!isUnlocked}
                  >
                    <Text
                      className={`text-2xl font-bold ${
                        isUnlocked || isCompleted || isCurrent
                          ? "text-white"
                          : "text-gray-500"
                      }`}
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
