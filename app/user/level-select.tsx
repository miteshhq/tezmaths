// root - app/user/level-select.tsx
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { get, ref } from "firebase/database";
import React, { useCallback, useState, useRef } from "react";
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
  const [availableLevels, setAvailableLevels] = useState<number[]>([]);

  // Load available levels from Firebase
  const loadAvailableLevels = useCallback(async () => {
    try {
      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);

      if (!snapshot.exists()) {
        return [];
      }

      const levelsSet = new Set<number>();

      snapshot.forEach((childSnapshot) => {
        const quiz = childSnapshot.val();
        if (quiz.level && typeof quiz.level === "number") {
          levelsSet.add(quiz.level);
        }
      });

      // Convert to sorted array and find continuous sequence
      const allLevels = Array.from(levelsSet).sort((a, b) => a - b);

      if (allLevels.length === 0) {
        return [];
      }

      // Find continuous sequence starting from 1
      const continuousLevels: number[] = [];
      let expectedLevel = 1;

      for (const level of allLevels) {
        if (level === expectedLevel) {
          continuousLevels.push(level);
          expectedLevel++;
        } else if (level > expectedLevel) {
          // Gap found, stop here
          break;
        }
      }

      return continuousLevels;
    } catch (error) {
      //   // console.error("Error loading available levels:", error);
      return [];
    }
  }, []);

  const loadUserData = useCallback(async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // First load available levels from database
      const levels = await loadAvailableLevels();
      setAvailableLevels(levels);

      if (levels.length === 0) {
        Alert.alert("No Levels", "No quiz levels are available at the moment.");
        setLoading(false);
        return;
      }

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
                const levelNum = parseInt(level);
                // Only include levels that exist in available levels
                if (levels.includes(levelNum)) {
                  completedLevelsArray.push(levelNum);
                }
              }
            }
          );
        }
        setCompletedLevels(completedLevelsArray);

        // Set current level logic:
        // If user has a saved currentLevel, use it (but ensure it's in available levels)
        // Otherwise, set to the next uncompleted level
        let userCurrentLevel = userData.currentLevel || 1;

        // Ensure current level is within available levels
        if (!levels.includes(userCurrentLevel)) {
          userCurrentLevel = levels[0]; // Set to first available level
        }

        // If the current level is already completed, move to next uncompleted level
        if (completedLevelsArray.includes(userCurrentLevel)) {
          // Find the next uncompleted level
          let foundNext = false;
          for (const level of levels) {
            if (!completedLevelsArray.includes(level)) {
              userCurrentLevel = level;
              foundNext = true;
              break;
            }
          }

          // If all levels are completed, stay at the last level
          if (!foundNext) {
            userCurrentLevel = levels[levels.length - 1];
          }
        }

        setCurrentLevel(userCurrentLevel);
      } else {
        // New user, set to first available level
        if (levels.length > 0) {
          setCurrentLevel(levels[0]);
        }
      }
    } catch (error) {
      //   // console.error("Error loading user data:", error);
      Alert.alert("Error", "Failed to load level data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loadAvailableLevels]);

  // 1. Back handler useFocusEffect
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Stop sound before going back
        SoundManager.stopSound("levelSoundEffect").catch(console.error);
        router.push("/user/home");
        return true;
      };
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => backHandler.remove();
    }, [router])
  );

  const isScreenActiveRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      isScreenActiveRef.current = true;

      loadUserData(); // without sound

      const soundTimer = setTimeout(async () => {
        if (isScreenActiveRef.current) {
          try {
            await SoundManager.playSound("levelSoundEffect", {
              isLooping: true,
              volume: 0.7,
            });
          } catch (err) {
            // // console.error("Play error", err);
          }
        }
      }, 500);

      return () => {
        isScreenActiveRef.current = false;
        clearTimeout(soundTimer);
        SoundManager.nukeSounds();
      };
    }, [])
  );

  const handleLevelSelect = async (level: number) => {
    try {
      await SoundManager.nukeSounds(); // ⬅️ Nuke before navigating
      router.push({
        pathname: "/user/quiz-screen",
        params: {
          level: level.toString(),
          isSelectedLevel: "true",
        },
      });
    } catch (error) {
      //   // console.error("Error navigating to quiz:", error);
    }
  };

  // Handle continue button (for current level)
  const handleContinue = () => {
    handleLevelSelect(currentLevel);
  };

  const handleBack = async () => {
    try {
      await SoundManager.nukeSounds(); // ⬅️ Ensure total stop
      router.back();
    } catch (error) {
      //   // console.error("Error going back:", error);
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
      <View className="flex-1 bg-white">
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
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="relative py-12">
            <View className="absolute w-2 left-1/2 top-12 -translate-x-0.5 bg-black h-full"></View>

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
                <Text className="text-white bg-black rounded-xl px-4 py-2 text-lg font-bold text-center">
                  Select Level
                </Text>
              </View>
            </View>

            {/* Level Buttons */}
            <View className="flex flex-col gap-4">
              {availableLevels.map((level) => {
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
      </View>
    </SafeAreaView>
  );
}
