import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { get, onValue, ref } from "firebase/database";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
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
import { checkStreakDecay } from "../../utils/streakManager";
import { getRandomQuote } from "../../utils/mathQuotes";

// Define interfaces for type safety
interface Quiz {
  id: string;
  level: number;
  title?: string;
  description?: string;
  questions?: any[];
  [key: string]: any;
}

interface UserData {
  username: string;
  fullName: string;
  avatar?: number;
  referrals: number;
  totalPoints: number;
  highScore: number;
  streak: number;
  currentLevel: number;
  highestCompletedLevelCompleted: number;
}

interface AppData {
  maxLevel: number;
  availableLevels: number[];
  finishedQuizzes: Quiz[];
  highestCompletedLevelCompleted: number;
  isAllLevelsComplete: boolean;
  completedLevels: number[];
  lastUpdated?: number;
}

export default function HomeScreen() {
  const backHandlerRef = useRef<ReturnType<
    typeof BackHandler.addEventListener
  > | null>(null);

  const LEVEL_STORAGE_KEY = "highestLevelReached";
  const USER_DATA_KEY = "userData";
  const APP_DATA_KEY = "appData";

  const router = useRouter();
  const [currentQuote, setCurrentQuote] = useState(getRandomQuote());

  // User State
  const [userName, setUserName] = useState("");
  const [userPoints, setUserPoints] = useState(0);
  const [fullName, setFullName] = useState("Unavailable");
  const [referrals, setReferrals] = useState(0);
  const [userStreak, setUserStreak] = useState(0);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [streakPopupType, setStreakPopupType] = useState("manual");

  // Quiz State
  const [availableLevels, setAvailableLevels] = useState<number[]>([]);
  const [highestCompletedLevelCompleted, setHighestCompletedLevelComplete] =
    useState(0);
  const [finishedQuizzes, setFinishedQuizzes] = useState<Quiz[]>([]);
  const [maxLevel, setMaxLevel] = useState(1);

  // UI State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showStreakPopup, setShowStreakPopup] = useState(false);
  const [streakPopupMessage, setStreakPopupMessage] = useState("");
  const [isAllLevelsComplete, setIsAllLevelsComplete] = useState(false);
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);
  const [showExitDialog, setShowExitDialog] = useState(false);

  // Animation refs
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const animatedValue = useRef(new Animated.Value(270)).current;

  // App state tracking
  const appStateRef = useRef(AppState.currentState);
  const backgroundTimeRef = useRef<number | null>(null);

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
      // console.error("Error loading cached data:", error);
    }
  };

  // Fetch user data from Firebase
  const fetchUserData = async (userId: string) => {
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
  const fetchCompletedQuizzes = async (userId: string) => {
    const userRef = ref(database, `users/${userId}/completedQuizzes`);
    const snapshot = await get(userRef);
    return snapshot.exists() ? snapshot.val() : {};
  };

  // Process and update all data
  const processAndUpdateData = async (
    userData: any,
    quizzesData: any,
    completedQuizzes: any
  ) => {
    // setLoading(false);

    // Update user state
    const processedUserData: UserData = {
      username: userData.username || "User",
      fullName: userData.fullName || "Unavailable",
      referrals: userData.referrals || 0,
      totalPoints: userData.totalPoints || 0,
      highScore: userData.highScore || 0,
      streak: userData.streak || 0,
      currentLevel: userData.currentLevel || 1,
      highestCompletedLevelCompleted:
        userData.highestCompletedLevelCompleted || 0,
    };

    updateUserState(processedUserData);

    // Calculate max level
    let calculatedMaxLevel = 1;
    Object.values(quizzesData).forEach((quiz: any) => {
      if (quiz && typeof quiz === "object" && quiz.level > calculatedMaxLevel) {
        calculatedMaxLevel = quiz.level;
      }
    });

    // Process finished quizzes
    const finished: Quiz[] = [];
    const completedLevelsSet = new Set<number>(); // Track completed levels
    Object.entries(quizzesData).forEach(([key, quiz]: [string, any]) => {
      if (
        quiz &&
        typeof quiz === "object" &&
        completedQuizzes[key]?.completed
      ) {
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
    const appData: AppData = {
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
  const updateUserState = (userData: UserData) => {
    setUserName(userData.fullName || userData.username);
    setFullName(userData.fullName);
    setReferrals(userData.referrals || 0);
    setUserPoints(
      userData.highScore % 1 !== 0
        ? Math.round(userData.highScore * 10) / 10
        : userData.highScore || 0
    );
    setUserStreak(userData.streak || 0);
    setCurrentLevel(userData.currentLevel || 1);
  };

  // Update app-related state
  const updateAppState = (appData: AppData) => {
    setMaxLevel(appData.maxLevel || 1);
    setAvailableLevels(appData.availableLevels || []);
    setFinishedQuizzes(appData.finishedQuizzes || []);
    setHighestCompletedLevelComplete(
      appData.highestCompletedLevelCompleted || 0
    );
    setIsAllLevelsComplete(appData.isAllLevelsComplete || false);
    setCompletedLevels(appData.completedLevels || []); // Set completed levels
  };

  const cacheAllData = async (userData: any, quizzesData: any) => {
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
      Object.values(quizzesData || {}).forEach((quiz: any) => {
        if (
          quiz &&
          typeof quiz === "object" &&
          quiz.level > calculatedMaxLevel
        ) {
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
      // console.error("Error caching data:", error);
    }
  };

  const loadAllData = useCallback(async (forceRefresh = false) => {
    setCurrentQuote(getRandomQuote());
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Create minimum loading delay promise (3 seconds)
      const minLoadingDelay = new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );

      // Data loading promise
      const dataLoadingPromise = async () => {
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
      };

      // Wait for both data loading AND minimum delay to complete
      await Promise.all([dataLoadingPromise(), minLoadingDelay]);
    } catch (error) {
      // console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Enhanced exit confirmation function
  const showExitConfirmation = () => {
    setShowExitDialog(true);
  };

  const handleExitApp = () => {
    setShowExitDialog(false);
    BackHandler.exitApp();
  };

  const handleResumeApp = () => {
    setShowExitDialog(false);
  };

  // Back handler setup - ENSURES EXIT CONFIRMATION FROM ANYWHERE
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Always show exit confirmation when back is pressed from home screen
        // regardless of where user came from
        if (!showExitDialog) {
          showExitConfirmation();
        }
        return true; // Always prevent default back behavior
      };

      // Clean up previous listener
      backHandlerRef.current?.remove?.();

      // Add new listener
      backHandlerRef.current = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      // Cleanup on unmount or unfocus
      return () => {
        backHandlerRef.current?.remove?.();
        backHandlerRef.current = null;
      };
    }, [showExitDialog])
  );

  // Enhanced App state change handler
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current === "active" && nextAppState === "background") {
        // App is going to background (home button pressed)
        backgroundTimeRef.current = Date.now();
      } else if (
        appStateRef.current === "background" &&
        nextAppState === "active"
      ) {
        // App is coming back to foreground
        const backgroundTime = backgroundTimeRef.current;
        if (backgroundTime) {
          const timeInBackground = Date.now() - backgroundTime;
          // If user was in background for less than 2 seconds, they likely pressed home button
          if (timeInBackground < 2000) {
            // Don't show dialog again if they're returning quickly
            setShowExitDialog(false);
          }
        }
        loadAllData();
      } else if (nextAppState === "active") {
        loadAllData();
      }

      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => subscription.remove();
  }, [loadAllData]);

  useEffect(() => {
    SoundManager.unloadAll();
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const userRef = ref(database, `users/${userId}`);
    const unsubscribe = onValue(userRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        // console.log("[HOME] Real-time update received:", data);

        // Update state with latest data
        const processedUserData: UserData = {
          username: data.username || "User",
          fullName: data.fullName || "Unavailable",
          avatar: data.avatar || 0,
          referrals: data.referrals || 0,
          totalPoints: data.totalPoints || 0,
          highScore: data.highScore || 0,
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

  const params = useLocalSearchParams();

  const checkAndUpdateStreak = useCallback(async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const showStreakPopupFlag = await AsyncStorage.getItem("showStreakPopup");
      if (showStreakPopupFlag) {
        // User just completed a quiz - streak was already updated in quiz screen
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          const userData = snapshot.val();
          const currentStreak = userData.streak || 0;
          setUserStreak(currentStreak);
          setStreakPopupMessage(`Day ${currentStreak} completed! 🔥`);
          setStreakPopupType("completion"); // Set type to completion
          setShowStreakPopup(true);
          await AsyncStorage.removeItem("showStreakPopup");
          setTimeout(() => {
            setShowStreakPopup(false);
          }, 10000);
        }
      } else {
        // App opened normally - check for streak decay
        const decayResult = await checkStreakDecay();
        if (decayResult.decayed) {
          setUserStreak(0);
        } else {
          // Get current streak from Firebase
          const userRef = ref(database, `users/${userId}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            const userData = snapshot.val();
            setUserStreak(userData.streak || 0);
          }
        }
      }
    } catch (error) {
      console.error("Error checking streak:", error);
    }
  }, [params.quizCompleted]);

  const checkStreakDecayOnFocus = useCallback(async () => {
    await checkStreakDecay();
  }, []);

  const handleStreakIconPress = () => {
    setStreakPopupType("manual");
    setStreakPopupMessage(""); // Clear any completion message
    setShowStreakPopup(true);
  };

  useFocusEffect(
    useCallback(() => {
      loadAllData();

      // Always check for streak decay when home loads
      checkStreakDecayOnFocus();

      // Handle quiz completion popup
      checkAndUpdateStreak();
    }, [loadAllData, checkStreakDecayOnFocus, checkAndUpdateStreak])
  );

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

  useEffect(() => {
    // Check if user completed a quiz and show streak popup automatically
    if (params.quizCompleted === "true") {
      // Small delay to ensure UI is ready
      setTimeout(() => {
        checkAndUpdateStreak();
      }, 500);
    }
  }, [params.quizCompleted, checkAndUpdateStreak]);

  // Show enhanced loading screen with quotes
  if (loading) {
    return (
      <View className="flex-1 bg-white justify-center items-center px-4">
        {/* Enhanced Loading Card */}
        <View className="bg-white rounded-2xl border border-black overflow-hidden w-full max-w-sm">
          <View className="w-full h-8 bg-primary"></View>
          <View className="p-6 flex flex-col items-center gap-5">
            {/* Animated Loading Icon */}
            <View className="relative">
              <ActivityIndicator size="large" color="#FF6B35" />
            </View>

            {/* Quote Section */}
            <View className="flex flex-col items-center gap-3">
              <Text className="text-xl italic font-bold text-center text-custom-purple leading-6">
                "{currentQuote}"
              </Text>
            </View>

            {/* Loading Message */}
            <View className="flex flex-col items-center gap-2">
              <Text className="text-primary font-bold text-lg">
                Preparing your math adventure...
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {/* HEADER HERE */}
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-4">
          <View className="flex-row justify-between items-center">
            <Text className="text-white text-3xl font-black">TezMaths</Text>
            <View className="flex-row items-center gap-4">
              {" "}
              <TouchableOpacity
                className="items-center"
                onPress={handleStreakIconPress} // Use the new handler
              >
                <View className="flex-row items-center bg-primary p-1 pl-4 rounded-full">
                  <Text className="text-white text-sm font-black">
                    Day {userStreak}
                  </Text>
                  <View className="w-8 h-8 rounded-full bg-white ml-2 flex items-center justify-center">
                    <Text className="text-white text-lg">🔥</Text>
                  </View>
                </View>
              </TouchableOpacity>
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
      <ScrollView
        className="flex-1 bg-white"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
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
              <TouchableOpacity
                onPress={() => router.push("/user/level-select")}
              >
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
            onPress={handleStreakIconPress} // Use the new handler
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
            <Text className="text-sm">High Score</Text>
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

        {/* Exit App Confirmation Modal */}
        <Modal visible={showExitDialog} transparent animationType="fade">
          <View className="flex-1 justify-center items-center bg-black/60">
            <View className="bg-white rounded-2xl p-6 mx-8 items-center">
              <Text className="text-2xl font-bold text-center mb-4 text-black">
                Exit App
              </Text>
              <Text className="text-gray-600 text-center mb-6">
                Are you sure you want to quit TezMaths?
              </Text>
              <View className="flex-row gap-4">
                <TouchableOpacity
                  className="bg-gray-200 rounded-full px-6 py-3 flex-1"
                  onPress={handleResumeApp}
                >
                  <Text className="text-black font-bold text-center">
                    Resume
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-red-500 rounded-full px-6 py-3 flex-1"
                  onPress={handleExitApp}
                >
                  <Text className="text-white font-bold text-center">Quit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Streak Popup Modal - Updated to match new version */}
        <Modal visible={showStreakPopup} transparent animationType="fade">
          <View className="flex-1 justify-center items-center bg-black/60">
            <View className="bg-white rounded-2xl p-6 mx-8 items-center">
              {streakPopupType === "completion" && streakPopupMessage ? (
                // Streak completion popup (after quiz)
                <>
                  <Text className="text-4xl mb-4">🔥</Text>
                  <Text className="text-2xl font-bold text-center mb-2 text-black">
                    {streakPopupMessage}
                  </Text>
                  <Text className="text-gray-600 text-center mb-4">
                    Keep it up! Come back tomorrow to maintain your streak.
                  </Text>
                  <TouchableOpacity
                    className="bg-black rounded-full px-6 py-3"
                    onPress={() => {
                      setShowStreakPopup(false);
                      setStreakPopupMessage("");
                    }}
                  >
                    <Text className="text-white font-bold">Awesome!</Text>
                  </TouchableOpacity>
                </>
              ) : (
                // Manual streak popup (when icon is pressed)
                <>
                  <Text className="text-4xl mb-4">🔥</Text>
                  <Text className="text-2xl font-bold text-center mb-2 text-black">
                    Current Streak: Day {userStreak}
                  </Text>
                  {userStreak === 0 ? (
                    <Text className="text-gray-600 text-center mb-4">
                      Complete a quiz today to start your streak!
                    </Text>
                  ) : (
                    <Text className="text-gray-600 text-center mb-4">
                      Great job! Keep playing daily to maintain your streak.
                    </Text>
                  )}
                  <Text className="text-sm text-gray-500 text-center mb-6">
                    💡 Tip: If you don't play for two consecutive days, your
                    streak will reset to 0.
                  </Text>
                  <TouchableOpacity
                    className="bg-black rounded-full px-6 py-3"
                    onPress={() => setShowStreakPopup(false)}
                  >
                    <Text className="text-white font-bold">Got it!</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}
