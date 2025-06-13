import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { get, onValue, ref, set } from "firebase/database";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  Image,
  ImageBackground,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import SoundManager from "../../components/soundManager";
import { auth, database } from "../../firebase/firebaseConfig";

export default function HomeScreen() {
  const LEVEL_STORAGE_KEY = "highestLevelReached";
  const USER_DATA_KEY = "userData";
  const APP_DATA_KEY = "appData";

  const router = useRouter();

  // User State
  const [userName, setUserName] = useState("");
  const [userPoints, setUserPoints] = useState(0);
  const [fullName, setFullName] = useState("Unavailable");
  const [referrals, setReferrals] = useState(0);
  const [userStreak, setUserStreak] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(1);

  // Quiz State
  const [availableLevels, setAvailableLevels] = useState([]);
  const [highestCompletedLevelCompleted, setHighestCompletedLevelComplete] =
    useState(0);
  const [finishedQuizzes, setFinishedQuizzes] = useState([]);
  const [maxLevel, setMaxLevel] = useState(1);
  const [quizCode, setQuizCode] = useState("");

  // UI State
  const [loading, setLoading] = useState(true);
  const [isLoadingLevels, setIsLoadingLevels] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showStreakPopup, setShowStreakPopup] = useState(false);
  const [streakPopupMessage, setStreakPopupMessage] = useState("");
  const [isAllLevelsComplete, setIsAllLevelsComplete] = useState(false);
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);

  // Animation refs
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const animatedValue = useRef(new Animated.Value(270)).current;

  // Back handler setup
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert("Exit App", "Are you sure you want to exit?", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes", onPress: () => BackHandler.exitApp() },
        ]);
        return true;
      };
      const addedEvent = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => addedEvent.remove();
    }, [])
  );

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const userRef = ref(database, `users/${userId}`);
    const unsubscribe = onValue(userRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        // console.log("[HOME] Real-time update received:", data);

        // Update state with latest data
        const processedUserData = {
          username: data.username || "User",
          fullName: data.fullName || "Unavailable",
          avatar: data.avatar || 0,
          referrals: data.referrals || 0,
          totalPoints: data.totalPoints || 0,
          streak: data.streak || 0,
          currentLevel: data.currentLevel || 1,
          highestCompletedLevelCompleted:
            data.highestCompletedLevelCompleted || 0,
        };

        updateUserState(processedUserData);

        // Update cache
        await AsyncStorage.setItem(
          USER_DATA_KEY,
          JSON.stringify(processedUserData)
        );
      }
    });

    return () => unsubscribe();
  }, []);

  const loadAllData = useCallback(async (forceRefresh = false) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Always load from cache first for immediate UI response
      await loadCachedData();

      // Fetch fresh data from Firebase
      const [userData, quizzesData, completedQuizzes] = await Promise.all([
        fetchUserData(userId),
        fetchQuizzesData(),
        fetchCompletedQuizzes(userId),
      ]);

      // Process and update all data
      await processAndUpdateData(userData, quizzesData, completedQuizzes);

      // Cache the fresh data
      await cacheAllData(userData, quizzesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load cached data for immediate UI update
  const loadCachedData = async () => {
    try {
      const [cachedUserData, cachedAppData] = await Promise.all([
        AsyncStorage.getItem(USER_DATA_KEY),
        AsyncStorage.getItem(APP_DATA_KEY),
      ]);

      if (cachedUserData) {
        const userData = JSON.parse(cachedUserData);
        updateUserState(userData);
      }

      if (cachedAppData) {
        const appData = JSON.parse(cachedAppData);
        updateAppState(appData);
      }
    } catch (error) {
      console.error("Error loading cached data:", error);
    }
  };

  // Fetch user data from Firebase
  const fetchUserData = async (userId) => {
    const userRef = ref(database, `users/${userId}`);
    const snapshot = await get(userRef);
    return snapshot.exists() ? snapshot.val() : {};
  };

  // Fetch quizzes data from Firebase
  const fetchQuizzesData = async () => {
    const quizzesRef = ref(database, "quizzes");
    const snapshot = await get(quizzesRef);
    return snapshot.exists() ? snapshot.val() : {};
  };

  // Fetch completed quizzes for user
  const fetchCompletedQuizzes = async (userId) => {
    const userRef = ref(database, `users/${userId}/completedQuizzes`);
    const snapshot = await get(userRef);
    return snapshot.exists() ? snapshot.val() : {};
  };

  // Process and update all data
  const processAndUpdateData = async (
    userData,
    quizzesData,
    completedQuizzes
  ) => {
    setLoading(false);

    // Update user state
    const processedUserData = {
      username: userData.username || "User",
      fullName: userData.fullName || "Unavailable",
      referrals: userData.referrals || 0,
      totalPoints: userData.totalPoints || 0,
      streak: userData.streak || 0,
      currentLevel: userData.currentLevel || 1,
      highestCompletedLevelCompleted:
        userData.highestCompletedLevelCompleted || 0,
    };

    updateUserState(processedUserData);

    // Calculate max level
    let calculatedMaxLevel = 1;
    Object.values(quizzesData).forEach((quiz) => {
      if (quiz.level > calculatedMaxLevel) {
        calculatedMaxLevel = quiz.level;
      }
    });

    // Process finished quizzes
    const finished = [];
    const completedLevelsSet = new Set(); // Track completed levels
    Object.entries(quizzesData).forEach(([key, quiz]) => {
      if (completedQuizzes[key]?.completed) {
        finished.push({ id: key, ...quiz });
        completedLevelsSet.add(quiz.level);
      }
    });

    // Generate available levels
    const availableLevelsArray = Array.from(
      { length: processedUserData.currentLevel },
      (_, i) => i + 1
    );

    // Get stored level from AsyncStorage
    const storedLevel = await AsyncStorage.getItem(LEVEL_STORAGE_KEY);
    const highestCompleted = storedLevel ? Number(storedLevel) : 0;

    // Update app state
    const appData = {
      maxLevel: calculatedMaxLevel,
      availableLevels: availableLevelsArray,
      finishedQuizzes: finished.reverse().slice(0, 5),
      highestCompletedLevelCompleted: highestCompleted,
      isAllLevelsComplete: processedUserData.currentLevel >= calculatedMaxLevel,
      completedLevels: Array.from(completedLevelsSet), // Add completed levels
    };

    updateAppState(appData);
  };

  // Update user-related state
  const updateUserState = (userData) => {
    setUserName(userData.fullName || userData.username);
    setFullName(userData.fullName);
    setReferrals(userData.referrals || 0);
    setUserPoints(
      userData.totalPoints % 1 !== 0
        ? Math.round(userData.totalPoints * 10) / 10
        : userData.totalPoints || 0
    );
    setUserStreak(userData.streak || 0);
    setCurrentLevel(userData.currentLevel || 1);
  };

  // Update app-related state
  const updateAppState = (appData) => {
    setMaxLevel(appData.maxLevel || 1);
    setAvailableLevels(appData.availableLevels || []);
    setFinishedQuizzes(appData.finishedQuizzes || []);
    setHighestCompletedLevelComplete(
      appData.highestCompletedLevelCompleted || 0
    );
    setIsAllLevelsComplete(appData.isAllLevelsComplete || false);
    setCompletedLevels(appData.completedLevels || []); // Set completed levels
  };

  const cacheAllData = async (userData, quizzesData) => {
    try {
      const userDataToCache = {
        username: userData.username || "User",
        fullName: userData.fullName || "Unavailable",
        avatar: userData.avatar || 0,
        referrals: userData.referrals || 0,
        totalPoints: userData.totalPoints || 0,
        streak: userData.streak || 0,
        currentLevel: userData.currentLevel || 1,
        highestCompletedLevelCompleted:
          userData.highestCompletedLevelCompleted || 0,
      };

      // Calculate max level from current quizzesData
      let calculatedMaxLevel = 1;
      Object.values(quizzesData || {}).forEach((quiz) => {
        if (quiz.level > calculatedMaxLevel) {
          calculatedMaxLevel = quiz.level;
        }
      });

      const appDataToCache = {
        maxLevel: calculatedMaxLevel,
        availableLevels: availableLevels,
        finishedQuizzes: finishedQuizzes,
        highestCompletedLevelCompleted: highestCompletedLevelCompleted,
        isAllLevelsComplete: isAllLevelsComplete,
        lastUpdated: Date.now(),
        completedLevels: completedLevels, // Cache completed levels
      };

      await Promise.all([
        AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(userDataToCache)),
        AsyncStorage.setItem(APP_DATA_KEY, JSON.stringify(appDataToCache)),
      ]);
    } catch (error) {
      console.error("Error caching data:", error);
    }
  };

  const params = useLocalSearchParams();

  // Check and update streak
  const checkAndUpdateStreak = useCallback(async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const userData = snapshot.val();
        const lastCompletionDate = userData.lastCompletionDate;
        const currentStreak = userData.streak || 0;
        const today = new Date().toDateString();

        if (params.quizCompleted === "true") {
          if (lastCompletionDate !== today) {
            const newStreak = currentStreak + 1;
            await set(userRef, {
              ...userData,
              streak: newStreak,
              lastCompletionDate: today,
            });

            setUserStreak(newStreak);
            setStreakPopupMessage(`Day ${newStreak} completed! 🔥`);
            setShowStreakPopup(true);

            setTimeout(() => {
              setShowStreakPopup(false);
            }, 3000);
          }
        } else {
          // Check if streak should be reset
          if (lastCompletionDate) {
            const lastDate = new Date(lastCompletionDate);
            const todayDate = new Date();
            const diffTime = Math.abs(todayDate - lastDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 2 && currentStreak > 0) {
              await set(userRef, { ...userData, streak: 0 });
              setUserStreak(0);
            } else {
              setUserStreak(currentStreak);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking streak:", error);
    }
  }, []);

  // Initial load and focus effect
  useFocusEffect(
    useCallback(() => {
      loadAllData();
      checkAndUpdateStreak();
    }, [loadAllData, checkAndUpdateStreak])
  );

  // App state change handler
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === "active") {
        loadAllData();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription.remove();
  }, [loadAllData]);

  // Refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData(true);
    setRefreshing(false);
  }, [loadAllData]);

  // Animation effects
  useEffect(() => {
    const startZoomAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.05,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };
    startZoomAnimation();
  }, [scaleAnim]);

  useEffect(() => {
    const textWidth = 270;
    const startAnimation = () => {
      animatedValue.setValue(textWidth);
      Animated.timing(animatedValue, {
        toValue: -textWidth,
        duration: 8000,
        useNativeDriver: true,
      }).start(() => startAnimation());
    };
    startAnimation();
  }, [animatedValue]);

  const handleQuizChoice = async (level, isManualSelection) => {
    await Promise.all([
      SoundManager.stopSound("levelSoundEffect"),
      SoundManager.stopSound("clappingSoundEffect"),
      SoundManager.stopSound("victorySoundEffect"),
      SoundManager.stopSound("failSoundEffect"),
    ]);

    router.push({
      pathname: "/user/quiz-screen",
      params: {
        level: level,
        isSelectedLevel: isManualSelection ? "true" : "false",
      },
    });
  };

  // Quiz code handler
  const handleEnterQuizCode = async () => {
    try {
      if (!quizCode.trim()) {
        Alert.alert("Invalid Code", "Please enter a valid quiz code.");
        return;
      }

      const quizRef = ref(database, `quizzes/${quizCode.trim()}`);
      const snapshot = await get(quizRef);

      if (snapshot.exists()) {
        router.push({
          pathname: "/user/quiz-screen",
          params: { id: quizCode.trim() },
        });
      } else {
        Alert.alert(
          "Invalid Quiz Code",
          "The quiz code you entered does not exist."
        );
      }
    } catch (error) {
      console.error("Error validating quiz code:", error);
      Alert.alert(
        "Error",
        "Something went wrong while validating the quiz code. Please try again."
      );
    }
  };

  const showStreakInfo = () => {
    Alert.alert(
      "Streak Rules 🔥",
      "If you don't play the quiz for two consecutive days, your streak will reset to 0.",
      [{ text: "Got it!", style: "default" }]
    );
  };

  // Show loading screen if initial load
  if (loading) {
    return (
      <View className="flex-1 bg-custom-gray justify-center items-center">
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text className="text-black mt-4">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* HEADER HERE */}
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-4">
          <View className="flex-row justify-between items-center">
            <Text className="text-white text-3xl font-black">TezMaths</Text>
            <View className="flex-row items-center gap-4">
              <View className="flex-row items-center bg-primary px-3 py-1 rounded-full">
                <Text className="text-white text-sm font-black">
                  Day {userStreak}
                </Text>
                <Text className="text-white text-lg ml-1">🔥</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push("/user/achievements")}
              >
                <Image
                  source={require("../../assets/icons/ribbon-badge.png")}
                  style={{ width: 28, height: 28 }}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>

      {/* Welcome Section */}
      <View className="px-4 py-4">
        <View className="flex-row justify-center items-center">
          <Text className="text-custom-purple text-3xl mt-4 font-black">
            Let's Practice Today!
          </Text>
        </View>
      </View>

      <View className="px-4 py-6 flex flex-col gap-4">
        <View className="border border-black rounded-2xl overflow-hidden">
          <View className=" w-full h-8 bg-primary"></View>
          <View className=" w-full p-4 flex flex-col items-center gap-4">
            <Image
              source={require("../../assets/icons/quiz.png")}
              style={{ width: 48, height: 48 }}
              tintColor="#FF6B35"
            />

            <View className="flex flex-col items-center gap-1">
              <Text className="text-2xl text-custom-purple font-black">
                Quiz Time
              </Text>
              <Text className="text-sm text-center text-custom-purple">
                Test your maths skills with our interactive quizzes!
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/user/level-select")}>
              <ImageBackground
                source={require("../../assets/gradient.jpg")} // Replace with your actual image path
                style={{ borderRadius: 8, overflow: "hidden" }}
                imageStyle={{ borderRadius: 12 }}
              >
                <View className="py-3">
                  <Text className="text-white font-bold text-xl w-72 text-center">
                    Start Quiz
                  </Text>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          </View>
        </View>

        {/* Battle with Friends Card */}
        <View className="border border-black rounded-2xl overflow-hidden">
          <View className=" w-full h-8 bg-primary"></View>
          <View className=" w-full p-4 flex flex-col items-center gap-4">
            <Image
              source={require("../../assets/icons/swords.png")}
              style={{ width: 48, height: 48 }}
              tintColor="#FF6B35"
            />

            <View className="flex flex-col items-center gap-1">
              <Text className="text-2xl text-custom-purple font-black">
                Battle With Friends
              </Text>
              <Text className="text-sm text-center text-custom-purple">
                Challenge friends to real-time maths battles!
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/user/multiplayer-mode-selection")}
            >
              <ImageBackground
                source={require("../../assets/gradient.jpg")} // Replace with your actual image path
                style={{ borderRadius: 8, overflow: "hidden" }}
                imageStyle={{ borderRadius: 12 }}
              >
                <View className="py-3">
                  <Text className="text-white font-bold text-xl w-72 text-center">
                    Start Battle
                  </Text>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Stats Section */}
      <View className="px-4 pb-4 flex-row justify-around">
        <TouchableOpacity
          className="items-center"
          onPress={() => setShowStreakPopup(true)}
        >
          <View className="bg-custom-gray rounded-full w-16 h-16 flex justify-center items-center mb-2">
            <Text className="text-2xl">🔥</Text>
          </View>
          <Text className="text-sm">Streak</Text>
          <Text className="text-primary text-lg font-bold">{userStreak}</Text>
        </TouchableOpacity>

        <View className="items-center">
          <View className="bg-custom-gray rounded-full w-16 h-16 flex justify-center items-center mb-2">
            <Text className="text-2xl">💎</Text>
          </View>
          <Text className="text-sm">Points</Text>
          <Text className="text-primary text-lg font-bold">{userPoints}</Text>
        </View>

        <View className="items-center">
          <View className="bg-custom-gray rounded-full w-16 h-16 flex justify-center items-center mb-2">
            <Text className="text-2xl">👥</Text>
          </View>
          <Text className="text-sm">Referrals</Text>
          <Text className="text-primary text-lg font-bold">{referrals}</Text>
        </View>
      </View>

      {/* Streak Popup */}
      <Modal visible={showStreakPopup} transparent animationType="fade">
        <View className="flex-1 justify-center items-center bg-white bg-opacity-30">
          <View className="bg-primary rounded-2xl p-6 mx-8 items-center">
            <Text className="text-3xl font-bold text-center mb-2">
              Streak Rules 🔥
            </Text>
            <Text className="text-black text-xl font-semibold text-center">
              If you don't play the quiz for two consecutive days, your streak
              will reset to 0.
            </Text>
            <TouchableOpacity
              className="bg-black rounded-full px-6 py-3 mt-4"
              onPress={() => setShowStreakPopup(false)}
            >
              <Text className="text-white font-bold">Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
