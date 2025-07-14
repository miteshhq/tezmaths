import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { get, ref, update } from "firebase/database";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  BackHandler,
  Easing,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import SoundManager from "../../components/soundManager";

import { auth, database } from "../../firebase/firebaseConfig";
import { updateUserStreak } from "../../utils/streakManager";

// Configuration
const QUIZ_TIME_LIMIT = 15;
const AUTO_SUBMIT_DELAY = 0; // 0ms delay for auto-submit
const EXPLANATION_DISPLAY_TIME = 400; // 4 seconds

interface Question {
  id: string;
  questionText: string;
  correctAnswer: string;
  explanation?: string;
  point: number;
  timeLimit: number;
}

// Circular Progress Component for question count
const CircularProgress = ({
  size,
  progress,
  strokeWidth,
  color,
  text,
}: {
  size: number;
  progress: number; // 0 to 1
  strokeWidth: number;
  color: string;
  text?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={{ position: "relative", width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          stroke="#e0e0e0"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <Circle
          stroke={color}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {text && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{ fontWeight: "bold", fontSize: 14 }}
            className="text-primary"
          >
            {text}
          </Text>
        </View>
      )}
    </View>
  );
};

export default function QuizScreen() {
  const params = useLocalSearchParams();
  const { level, isSelectedLevel } = params;
  const currentLevel = Number(level) || 1;

  // State management
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [quizScore, setQuizScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isAnswerWrong, setIsAnswerWrong] = useState(false);
  const [isTimeOut, setIsTimeOut] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState(1);
  const [fullname, setFullname] = useState("");
  const [timeLeft, setTimeLeft] = useState(QUIZ_TIME_LIMIT);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isQuizActive, setIsQuizActive] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [quizReady, setQuizReady] = useState(false);
  const [currentHighScore, setCurrentHighScore] = useState(0);
  const [inputReady, setInputReady] = useState(false);
  const [maxDisplayQuestions, setMaxDisplayQuestions] = useState(20);

  const [accumulatedScore, setAccumulatedScore] = useState(0);
  const [startingLevel, setStartingLevel] = useState(currentLevel);

  const [isUserTyping, setIsUserTyping] = useState(false);
  const [lastInputTime, setLastInputTime] = useState(0);

  const [gameStartTime, setGameStartTime] = useState<number>(0);
  const [totalGameTimeMs, setTotalGameTimeMs] = useState<number>(0);
  const gameStartTimeRef = useRef<number>(0);
  const gameInitializedRef = useRef<boolean>(false);

  const [isLevelComplete, setIsLevelComplete] = useState(false);
  const [levelPointsEarned, setLevelPointsEarned] = useState(0);

  // Refs
  const timerRef = useRef<number | null>(null);
  const submitTimeoutRef = useRef<number | null>(null);
  const explanationTimeoutRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const inputRef = useRef<TextInput>(null);
  const isMountedRef = useRef(true);

  // Animated values
  const timerAnimation = useRef(new Animated.Value(1)).current;
  const questionTransition = useRef(new Animated.Value(1)).current;



  const loadHighScore = useCallback(async () => {
    try {
      const cachedHighScore = await AsyncStorage.getItem("highScore");
      if (cachedHighScore) {
        setCurrentHighScore(parseInt(cachedHighScore, 10));
      }
    } catch (error) {
      console.error("Error loading high score:", error);
    }
  }, []);

  // Cleanup function to stop all timers and processes
  const cleanupQuiz = useCallback(() => {
    // Clear all timers
    if (timerRef.current) clearInterval(timerRef.current);
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
    if (explanationTimeoutRef.current)
      clearTimeout(explanationTimeoutRef.current);

    // Reset all refs
    timerRef.current = null;
    submitTimeoutRef.current = null;
    explanationTimeoutRef.current = null;

    // Stop animations
    timerAnimation.stopAnimation();
    questionTransition.stopAnimation();

    // Mark quiz as inactive
    setIsQuizActive(true);
  }, [timerAnimation, questionTransition]);

  const clearAllQuizCache = useCallback(async () => {
    try {
      // Clear all quiz-related cache
      const keys = await AsyncStorage.getAllKeys();
      const quizKeys = keys.filter(
        (key) =>
          key.startsWith("quiz-level-") ||
          key.startsWith("quiz-session-") ||
          key === "currentQuizState"
      );

      if (quizKeys.length > 0) {
        await AsyncStorage.multiRemove(quizKeys);
        console.log(`🗑️ Cleared ${quizKeys.length} quiz cache entries`);
      }
    } catch (error) {
      console.error("Error clearing quiz cache:", error);
    }
  }, []);

  const clearLevelCache = useCallback(async () => {
    try {
      const cacheKey = `quiz-level-${currentLevel}`;
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      // console.error("Error clearing level cache:", error);
    }
  }, [currentLevel]);  
const resetQuizState = useCallback(() => {
  if (!isMountedRef.current) return;

  console.log(`🔄 Resetting quiz state for level ${currentLevel}`);
  cleanupQuiz();

  // Clear active timer
  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }

  setCurrentQuestionIndex(0);
  setUserAnswer("");
  setQuizScore(0);
  setCorrectAnswers(0);
  setShowExplanation(false);
  setIsAnswerWrong(false);
  setIsTimeOut(false);
  setTimeLeft(QUIZ_TIME_LIMIT);
  setIsProcessing(false);
  setIsQuizActive(false);
  setLoading(true);
  setNetworkError(false);
  setIsLevelComplete(false);
  setLevelPointsEarned(0);
  setQuestions([]);
  setMaxDisplayQuestions(0); // Will be updated after fetching
  timerAnimation.setValue(1);
  questionTransition.setValue(1);
  inputRef.current?.blur();
  setInputReady(false);

  if (params.isSelectedLevel === "true") {
    setAccumulatedScore(0);
    console.log("🆕 Fresh start - Reset accumulated score to 0");
  }
}, [cleanupQuiz, currentLevel, params.isSelectedLevel]);


useEffect(() => {
  const status = {
    editable: questions.length > 0 &&
      isQuizActive &&
      !showExplanation &&
      !isProcessing &&
      isScreenFocused,
    questions: questions.length,
    isQuizActive,
    showExplanation,
    isProcessing,
    isScreenFocused,
  };
  console.log("🧪 Input Editable State Check:", status);
}, [
  questions.length,
  isQuizActive,
  showExplanation,
  isProcessing,
  isScreenFocused,
]);


  // 4. Enhanced loadQuestions function with better cache management
const loadQuestions = useCallback(async () => {


  try {
    console.log(`📚 Loading questions for level ${currentLevel}`);
    setLoading(true);
    setNetworkError(false);
    setQuestions([]);
    setIsProcessing(false);
    questionTransition.setValue(1);
  //    SoundManager.playSoundWithFade("levelSoundEffect", {volume: 1,
  // },);

    const cacheKey = `quiz-level-${currentLevel}-v2`;

    if (params.isSelectedLevel === "true") {
      await AsyncStorage.removeItem(cacheKey);
      console.log(`🗑️ Cleared cache for level ${currentLevel}`);
      
    } else {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`💾 Loaded ${parsed.length} from cache`);
          setQuestions(parsed);
          setMaxDisplayQuestions(parsed.length);
          setIsQuizActive(true);
          setQuizReady(true);
          setInputReady(true);
          
          return;
        }
      }
    }

    const snapshot = await get(ref(database, "quizzes"));
    if (!snapshot.exists()) throw new Error("No quizzes found");

    let maxDisplay = 5;
    const levelQuizzes = [];

    snapshot.forEach((child) => {
      const quiz = child.val();
      if (quiz.level === currentLevel && Array.isArray(quiz.questions)) {
        if (quiz.maxDisplayQuestions)
          maxDisplay = Math.max(1, parseInt(quiz.maxDisplayQuestions));
        quiz.questions.forEach((q, idx) => {
          levelQuizzes.push({
            id: q.id || `${child.key}-${idx}`,
            questionText: q.questionText,
            correctAnswer: q.correctAnswer.toString(),
            explanation: q.explanation || "",
            point: currentLevel,
            timeLimit: QUIZ_TIME_LIMIT,
          });
        });
      }
    });

    if (levelQuizzes.length === 0)
      throw new Error(`No questions for level ${currentLevel}`);

    const shuffled = levelQuizzes.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, maxDisplay);

    console.log(`✅ Selected ${selected.length} questions`);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(selected));

  
    setQuestions(selected);
    setMaxDisplayQuestions(selected.length);
    setIsQuizActive(true);
    setQuizReady(true);
  } catch (err) {
    console.error("❌ Failed loading questions:", err);
    setNetworkError(true);
    Alert.alert("Error", "Failed to load questions. Retry?", [
      { text: "Retry", onPress: loadQuestions },
      { text: "Back", onPress: () => router.back() },
    ]);
  } finally {
    setLoading(false);
  }
}, [currentLevel, params.isSelectedLevel]);
const handleQuizInit = useCallback(async () => {
  console.log(`🎯 Focus effect triggered for level ${currentLevel}`);
  setIsScreenFocused(true);
  setCurrentQuestionIndex(0)

  const startTime =
    params.isSelectedLevel === "true" || !params.gameStartTime
      ? Date.now()
      : Number(params.gameStartTime);

  console.log(
    `${params.isSelectedLevel === "true" ? "🎮 NEW GAME" : "🔄 CONTINUING"} - ${new Date(startTime).toLocaleTimeString()}`
  );

  setGameStartTime(startTime);
  gameStartTimeRef.current = startTime;
  gameInitializedRef.current = true;

  resetQuizState();
  if (params.isSelectedLevel === "true") await clearAllQuizCache();
  await loadQuestions();
}, [
  resetQuizState,
  loadQuestions,
  currentLevel,
  params.isSelectedLevel,
  params.gameStartTime,
]);

useFocusEffect(
  useCallback(() => {
    handleQuizInit();

    return () => {
      console.log(`🚪 Cleanup for level ${currentLevel}`);
      setIsScreenFocused(true);
      cleanupQuiz();
    };
  }, [handleQuizInit, currentLevel])
);
useFocusEffect(
  useCallback(() => {
    handleQuizInit();

    return () => {
      console.log(`🚪 Cleanup for level ${currentLevel}`);
      setIsScreenFocused(false);
      cleanupQuiz();
    };
  }, [handleQuizInit, currentLevel, cleanupQuiz])
);
 const startTimer = useCallback(() => {
      if (!isQuizActive || !isScreenFocused || isProcessing || showExplanation) {
        return;
      }
  
      // Always clear existing timer first
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
  
      setTimeLeft(QUIZ_TIME_LIMIT);
      timerAnimation.setValue(1);
  
      Animated.timing(timerAnimation, {
        toValue: 0,
        duration: QUIZ_TIME_LIMIT * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
  
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            // Only call handleTimeUp if not already showing explanation
            if (!showExplanation) {
              handleTimeUp();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, [isQuizActive, isScreenFocused, isProcessing, showExplanation]);
  useEffect(() => {
  if (
    quizReady &&
    !loading &&
    questions.length > 0 &&
    isQuizActive &&
    !showExplanation &&
    isScreenFocused &&
    !isProcessing
  ) {
    console.log("🚀 Starting timer after quiz ready");
    startTimer();

    setQuizReady(false); // prevent re-runs
  }
}, [
  quizReady,
  loading,
  questions,
  isQuizActive,
  showExplanation,
  isScreenFocused,
  isProcessing,
  startTimer,
]);
  useEffect(() => {
    // Only use accumulated score when coming from a previous level in same session
    const accScore =
      params.isSelectedLevel === "true"
        ? 0
        : Number(params.accumulatedScore) || 0;
    // console.log(`Setting accumulated score from params: ${accScore}`);
    setAccumulatedScore(accScore);
    setStartingLevel(currentLevel);

    // Get game start time from params if continuing from previous level
    if (params.gameStartTime) {
      const startTime = Number(params.gameStartTime);
      setGameStartTime(startTime);
      //   console.log(
      //     `Retrieved game start time from params: ${new Date(
      //       startTime
      //     ).toLocaleTimeString()}`
      //   );
    }
  }, [
    params.accumulatedScore,
    params.gameStartTime,
    currentLevel,
    params.isSelectedLevel,
  ]);
  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/active/) &&
        nextAppState === "background"
      ) {
        cleanupQuiz();
      } else if (
        appStateRef.current === "background" &&
        nextAppState === "active"
      ) {
        if (isScreenFocused && isQuizActive) {
          handleQuizInterruption();
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription?.remove();
  }, [isScreenFocused, isQuizActive, cleanupQuiz]);

  // Handle quiz interruption
  const handleQuizInterruption = useCallback(() => {
    Alert.alert(
      "Quiz Interrupted",
      "Your quiz session was interrupted. You'll need to restart this level.",
      [
        {
          text: "Restart Level",
          onPress: () => {
            resetQuizState();
            loadQuestions();
          },
        },
        {
          text: "Go Home",
          onPress: () => router.push("/user/home"),
        },
      ]
    );
  }, [resetQuizState, loadQuestions]);

  useFocusEffect(
    useCallback(() => {
      console.log(`🎯 Focus effect triggered for level ${currentLevel}`);
      setIsScreenFocused(true);

      // Initialize game start time logic
      let startTime: number;

      if (params.isSelectedLevel === "true" || !params.gameStartTime) {
        startTime = Date.now();
        console.log(
          `🎮 NEW GAME - Start time: ${new Date(
            startTime
          ).toLocaleTimeString()}`
        );
      } else {
        const existingStartTime = Number(params.gameStartTime);
        if (existingStartTime && existingStartTime > 0) {
          startTime = existingStartTime;
          console.log(
            `🔄 CONTINUING - Start time: ${new Date(
              startTime
            ).toLocaleTimeString()}`
          );
        } else {
          startTime = Date.now();
          console.log(
            `⚠️ FALLBACK - Start time: ${new Date(
              startTime
            ).toLocaleTimeString()}`
          );
        }
      }

      setGameStartTime(startTime);
      gameStartTimeRef.current = startTime;
      gameInitializedRef.current = true;

      // Clear cache and reset state if it's a selected level
      if (params.isSelectedLevel === "true") {
        clearAllQuizCache().then(() => {
          resetQuizState();
          loadQuestions();
        });
      } else {
        resetQuizState();
        loadQuestions();
      }

      return () => {
        console.log(`🚪 Cleanup for level ${currentLevel}`);
        setIsScreenFocused(false);
        cleanupQuiz();
      };
    }, [
      currentLevel,
      params.isSelectedLevel,
      params.gameStartTime,
      clearAllQuizCache,
      resetQuizState,
      loadQuestions,
      cleanupQuiz,
    ])
  );

  // Debug questions state
  useEffect(() => {
    // console.log(
    //   `Questions updated: ${questions.length} questions for level ${currentLevel}`
    // );
    // console.log("Current question index:", currentQuestionIndex);
    if (questions.length > 0) {
      //   console.log("First question:", questions[0]?.questionText);
    }
  }, [questions, currentQuestionIndex, currentLevel]);

  const loadUserData = useCallback(async () => {
    try {
      const cachedData = await AsyncStorage.getItem("userData");
      if (cachedData) {
        const data = JSON.parse(cachedData);
        setUsername(data.username || "player");
        setFullname(data.fullName || "Player");
        setAvatar(data.avatar || 0);
        SoundManager.playSoundWithFade("victorySoundEffect", {volume: 1})
      }

      // Also load high score
      await loadHighScore();
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }, [loadHighScore]);

  const updateHighScore = useCallback(
    async (newScore: number) => {
      try {
        const userId = auth.currentUser?.uid;
        if (!userId) return false;

        // Check if new score is higher than current high score
        if (newScore > currentHighScore) {
          // Update local state
          setCurrentHighScore(newScore);

          // Update AsyncStorage
          await AsyncStorage.setItem("highScore", newScore.toString());

          // Update Firebase database
          const userRef = ref(database, `users/${userId}`);
          await update(userRef, {
            highScore: newScore,
            lastHighScoreDate: Date.now(),
          });

          console.log(
            `🎉 New High Score: ${newScore} (Previous: ${currentHighScore})`
          );
          return true; // Return true if it's a new high score
        }

        return false; // Return false if it's not a new high score
      } catch (error) {
        console.error("Error updating high score:", error);
        return false;
      }
    },
    [currentHighScore]
  );

  const updateScoreInDatabase = useCallback(
    async (levelScore: number) => {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        return;
      }

      try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val() || {};

        const currentTotalPoints = userData.totalPoints || 0;
        const newTotalPoints = currentTotalPoints + levelScore;

        const streakResult = await updateUserStreak();
        if (!streakResult.alreadyPlayedToday) {
          await AsyncStorage.setItem("showStreakPopup", "true");
        }

        // Calculate final accumulated score for this game session
        const finalGameScore = accumulatedScore + levelScore;

        // Check for new high score
        const isNewHighScore = await updateHighScore(finalGameScore);

        const updates = {
          totalPoints: newTotalPoints,
        };

        await update(userRef, updates);

        // Update local storage
        await AsyncStorage.setItem("totalPoints", newTotalPoints.toString());

        // Update accumulated score for this game session
        setAccumulatedScore((prev) => {
          const newAccumulated = prev + levelScore;
          return newAccumulated;
        });

        // Return streak info and high score info for potential popup
        return {
          scoreUpdated: true,
          newStreak: streakResult.streak,
          streakIncreased: streakResult.increased,
          alreadyPlayedToday: streakResult.alreadyPlayedToday,
          isNewHighScore: isNewHighScore,
          highScore: isNewHighScore ? finalGameScore : currentHighScore,
        };
      } catch (error) {
        return { scoreUpdated: false, isNewHighScore: false };
      }
    },
    [accumulatedScore, updateHighScore, currentHighScore]
  );

  const handleLevelComplete = useCallback(
    async (levelScore: number, levelCorrectAnswers: number) => {
      console.log(`🎯 Handling level completion for level ${currentLevel}`);
      console.log(
        `📊 Level score: ${levelScore}, Correct answers: ${levelCorrectAnswers}/${questions.length}`
      );

      const userId = auth.currentUser?.uid;
      if (!userId) return;

      try {
        // Update user data in Firebase
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val() || {};

        const currentTotalPoints = userData.totalPoints || 0;
        const newTotalPoints = currentTotalPoints + levelScore;

        // Update streak
        const streakResult = await updateUserStreak();
        if (!streakResult.alreadyPlayedToday) {
          await AsyncStorage.setItem("showStreakPopup", "true");
        }

        // Check if next level exists
        const nextLevel = currentLevel + 1;
        SoundManager.playSoundWithFade("clappingSoundEffect")
        const quizzesRef = ref(database, "quizzes");
        const quizSnapshot = await get(quizzesRef);

        let nextLevelExists = false;
        if (quizSnapshot.exists()) {
          quizSnapshot.forEach((childSnapshot) => {
            const quiz = childSnapshot.val();
            if (quiz.level === nextLevel) {
              nextLevelExists = true;
            }
          });
        }

        // Prepare updates
        const updates: any = {
          totalPoints: newTotalPoints,
          [`completedLevels/${currentLevel}`]: true,
          lastPlayedLevel: currentLevel,
          lastPlayedDate: Date.now(),
        };

        // Only update currentLevel if player completed all questions correctly
        // and this level is the player's current progression point
        if (
          levelCorrectAnswers === questions.length &&
          currentLevel >= (userData.currentLevel || 1)
        ) {
          updates.currentLevel = nextLevel;
          console.log(`🆙 Unlocking next level: ${nextLevel}`);
        }

        await update(userRef, updates);

        // Update local storage
        await AsyncStorage.setItem("totalPoints", newTotalPoints.toString());
        if (updates.currentLevel) {
          await AsyncStorage.setItem(
            "currentLevel",
            updates.currentLevel.toString()
          );
        }

        // Update accumulated score
        const newAccumulatedScore = accumulatedScore + levelScore;
        setAccumulatedScore(newAccumulatedScore);

        console.log(`📊 New accumulated score: ${newAccumulatedScore}`);

        // Decide what to do next
        if (nextLevelExists && levelCorrectAnswers === questions.length) {
          // Continue to next level
          console.log(`➡️ Continuing to level ${nextLevel}`);

          const startTimeToPass = gameStartTimeRef.current || gameStartTime;

          // Clear current level cache before moving to next
          await clearLevelCache();

          // Reset current level scores
          setQuizScore(0);
          setCorrectAnswers(0);
          setIsLevelComplete(false);
          setLevelPointsEarned(0);

          router.replace({
            pathname: "/user/quiz-screen",
            params: {
              level: nextLevel.toString(),
              isSelectedLevel: "false",
              accumulatedScore: newAccumulatedScore.toString(),
              gameStartTime: startTimeToPass.toString(),
              reload: Date.now().toString(),
            },
          });
        } else {
          // End game - either no next level or didn't get perfect score
          console.log(`🏁 Ending game`);
          handleGameEnd(newAccumulatedScore, levelCorrectAnswers, true);
        }
      } catch (error) {
        console.error("❌ Error handling level completion:", error);
        const newAccumulatedScore = accumulatedScore + levelScore;
        handleGameEnd(newAccumulatedScore, levelCorrectAnswers, false);
      }
    },
    [
      accumulatedScore,
      currentLevel,
      gameStartTime,
      questions.length,
      clearLevelCache,
    ]
  );

  const handleGameEnd = useCallback(
    async (
      finalScore?: number,
      finalCorrectAnswers?: number,
      isGameComplete = false
    ) => {
      if (!isQuizActive) return;

      const startTime = gameStartTimeRef.current || gameStartTime;
      const gameEndTime = Date.now();

      let calculatedTimeMs = 0;

      if (startTime && startTime > 0 && gameInitializedRef.current) {
        const rawTimeMs = gameEndTime - startTime;
        const maxReasonableTime = 2 * 60 * 60 * 1000; // 2 hours in ms
        const minReasonableTime = 1000; // 1 second minimum

        if (rawTimeMs >= minReasonableTime && rawTimeMs <= maxReasonableTime) {
          calculatedTimeMs = rawTimeMs;
        } else {
          console.warn(
            `⚠️ Time out of range: ${rawTimeMs}ms (${rawTimeMs / 1000}s)`
          );
          calculatedTimeMs =
            rawTimeMs < minReasonableTime ? minReasonableTime : 0;
        }
      } else {
        console.warn(`⚠️ Invalid start time or game not initialized`);
      }

      setTotalGameTimeMs(calculatedTimeMs);

      setIsQuizActive(false);
      cleanupQuiz();

      // Calculate total accumulated score
      let totalAccumulatedScore: number;
      if (typeof finalScore === "number") {
        totalAccumulatedScore = finalScore;
      } else {
        totalAccumulatedScore =
          accumulatedScore === 0 ? quizScore : accumulatedScore;
      }

      const gameCorrectAnswers = finalCorrectAnswers ?? correctAnswers;

      // Check if this is a new high score
      const isNewHighScore = totalAccumulatedScore > currentHighScore;

      try {
        const isPassed =
          isGameComplete &&
          (finalCorrectAnswers === questions.length ||
            gameCorrectAnswers === questions.length);

        router.push({
          pathname: "/user/results",
          params: {
            quizScore: totalAccumulatedScore.toString(),
            correctAnswers: gameCorrectAnswers.toString(),
            totalQuestions: questions.length.toString(),
            currentLevel: currentLevel.toString(),
            username: username || "player",
            fullname: fullname || "Player",
            avatar: avatar.toString(),
            isPassed: isPassed.toString(),
            isGameComplete: isGameComplete.toString(),
            totalGameTime: calculatedTimeMs.toString(),
            isNewHighScore: isNewHighScore.toString(), // Add this
            highScore: Math.max(
              totalAccumulatedScore,
              currentHighScore
            ).toString(), // Add this
          },
        });
      } catch (error) {
        router.push("/user/home");
      }
    },
    [
      quizScore,
      correctAnswers,
      accumulatedScore,
      currentLevel,
      username,
      fullname,
      avatar,
      isQuizActive,
      cleanupQuiz,
      questions.length,
      gameStartTime,
      currentHighScore, // Add this dependency
    ]
  );

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    timerAnimation.stopAnimation();
  }, [timerAnimation]);

  const handleSubmitAnswer = useCallback(
    async (isCorrect: boolean) => {
      if (isProcessing || !isQuizActive || !isScreenFocused || currentQuestionIndex >= questions.length) return;

      const currentQ = questions[currentQuestionIndex];
      await SoundManager.playSound("rightAnswerSoundEffect");
      if (!currentQ) return;

      console.log(
        `🎯 Submitting answer for question ${currentQuestionIndex + 1}/${questions.length
        }`
      );
      console.log(`✅ Is correct: ${isCorrect}`);

      setIsProcessing(true);
      startTimer();

      const pointsPerQuestion = currentLevel;

      if (isCorrect) {
        
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );

        // Calculate new scores
        const newQuizScore = quizScore + pointsPerQuestion;
        const newCorrectAnswers = correctAnswers + 1;

        console.log(`📊 Current quiz score: ${quizScore} -> ${newQuizScore}`);
        console.log(
          `📊 Correct answers: ${correctAnswers} -> ${newCorrectAnswers}`
        );

        // Update state
        setQuizScore(newQuizScore);
        setCorrectAnswers(newCorrectAnswers);

        // Check if this is the last question
        const isLastQuestion = currentQuestionIndex >= questions.length - 1;
        console.log(
          `🏁 Is last question: ${isLastQuestion} (${currentQuestionIndex + 1
          }/${questions.length})`
        );

        if (isLastQuestion) {
          // Level completed
          console.log(`🎉 Level ${currentLevel} completed!`);
          setIsLevelComplete(true);
          setLevelPointsEarned(newQuizScore);

          // Wait a moment before continuing
          setTimeout(() => {
            handleLevelComplete(newQuizScore, newCorrectAnswers);
          }, 1000);
        } else {
          // Move to next question - THIS IS THE KEY FIX
          console.log(`➡️ Moving to next question`);
          setIsAnswerWrong(false);

          // Use setTimeout to ensure state updates properly
          setTimeout(() => {
            setIsProcessing(false);

            Animated.timing(questionTransition, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              // ✅ Prevent index overflow
              if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex((prev) => prev + 1);
                setUserAnswer("");
                setTimeLeft(QUIZ_TIME_LIMIT);

                // Reset animation
                questionTransition.setValue(1);

                // Focus input
                setTimeout(() => {
                  inputRef.current?.focus();
                }, 100);
              } else {
                console.log("🚫 No more questions left. ");
              }
            });
          }, 500);
          // Small delay to show success
        }
      } else {
        // Wrong answer - end game
        console.log(`❌ Wrong answer - ending game`);
        await updateScoreInDatabase(quizScore);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        await SoundManager.playSound("wrongAnswerSoundEffect");

        setIsAnswerWrong(true);
        setShowExplanation(true);
        setIsProcessing(false);

        explanationTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && isScreenFocused) {
            const finalScore = accumulatedScore + quizScore;
            console.log(`📊 Final accumulated score: ${finalScore}`);
            handleGameEnd(finalScore, correctAnswers, false);
          }
        }, EXPLANATION_DISPLAY_TIME);
      }
    },
    [
      currentQuestionIndex,
      questions,
      isQuizActive,
      isScreenFocused,
      stopTimer,
      currentLevel,
      quizScore,
      correctAnswers,
      accumulatedScore,
      isProcessing,
      handleLevelComplete,
      updateScoreInDatabase,
      handleGameEnd,
      questionTransition,
    ]
  );

  const updateScoreAndContinue = useCallback(
    async (levelScore: number, levelCorrectAnswers: number) => {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val() || {};

        const currentTotalPoints = userData.totalPoints || 0;
        const newTotalPoints = currentTotalPoints + levelScore;

        const streakResult = await updateUserStreak();

        if (!streakResult.alreadyPlayedToday) {
          await AsyncStorage.setItem("showStreakPopup", "true");
        }

        // Calculate current game session score
        const currentGameScore = accumulatedScore + levelScore;

        // Check for new high score
        const isNewHighScore = await updateHighScore(currentGameScore);

        const nextLevel = currentLevel + 1;
        const quizzesRef = ref(database, "quizzes");
        const quizSnapshot = await get(quizzesRef);

        let nextLevelExists = false;
        if (quizSnapshot.exists()) {
          quizSnapshot.forEach((childSnapshot) => {
            const quiz = childSnapshot.val();
            if (quiz.level === nextLevel) {
              nextLevelExists = true;
            }
          });
        }

        const updates = {
          totalPoints: newTotalPoints,
          [`completedLevels/${currentLevel}`]: true,
          currentLevel: currentLevel + 1,
        };

        if (
          levelCorrectAnswers === questions.length &&
          currentLevel >= (userData.currentLevel || 1) &&
          nextLevelExists
        ) {
          updates.currentLevel = nextLevel;
        }

        await update(userRef, updates);

        await AsyncStorage.setItem("totalPoints", newTotalPoints.toString());
        if (updates.currentLevel) {
          await AsyncStorage.setItem(
            "currentLevel",
            updates.currentLevel.toString()
          );
        }

        const newAccumulatedScore = currentGameScore;
        setAccumulatedScore(newAccumulatedScore);

        if (nextLevelExists) {
          const startTimeToPass = gameStartTimeRef.current || gameStartTime;
          setQuizScore(0);
          setCorrectAnswers(0);
          router.replace({
            pathname: "/user/quiz-screen",
            params: {
              level: nextLevel.toString(),
              isSelectedLevel: "false",
              accumulatedScore: newAccumulatedScore.toString(),
              gameStartTime: startTimeToPass.toString(),
            },
          });
        } else {
          handleGameEnd(newAccumulatedScore, levelCorrectAnswers, true);
        }
      } catch (error) {
        console.error("Error updating score and continuing:", error);
        const newAccumulatedScore = accumulatedScore + levelScore;
        handleGameEnd(newAccumulatedScore, levelCorrectAnswers, false);
      }
    },
    [accumulatedScore, currentLevel, gameStartTime, updateHighScore]
  );
  const handleTimeUp = useCallback(async () => {
    if (!isQuizActive || isProcessing || !isScreenFocused || showExplanation)
      return;

    setIsProcessing(true);
    stopTimer();

    // Update score in database on timeout
    await updateScoreInDatabase(quizScore);

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    await SoundManager.playSound("wrongAnswerSoundEffect");

    setIsTimeOut(true);
    setShowExplanation(true);
    setIsProcessing(false);

    explanationTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && isScreenFocused) {
        // FIXED: Pass total accumulated score
        const finalScore = accumulatedScore + quizScore;
        // console.log(`Time up - Final total accumulated score: ${finalScore}`);
        handleGameEnd(finalScore, correctAnswers, false);
      }
    }, EXPLANATION_DISPLAY_TIME);
  }, [
    isQuizActive,
    isProcessing,
    isScreenFocused,
    stopTimer,
    showExplanation,
    quizScore,
    correctAnswers,
    accumulatedScore, // Important dependency
    updateScoreInDatabase,
    handleGameEnd,
  ]);
  useEffect(() => {
    if (initialLoadComplete && level) {
      // Only reset when level actually changes after initial load
      resetQuizState();
      loadQuestions();
    }
  }, [level, params.reload, initialLoadComplete, resetQuizState, loadQuestions]);

  // Add this new effect to track initial load
  useEffect(() => {
    if (!initialLoadComplete && !loading) {
      setInitialLoadComplete(true);
    }
  }, [loading, initialLoadComplete]);

 

  useEffect(() => {
    isMountedRef.current = true;
    loadUserData();

    // Only load questions if not already loaded
    if (questions.length === 0) {
      loadQuestions();
    }

    return () => {
      isMountedRef.current = false;
      cleanupQuiz();
    };
  }, [loadUserData, loadQuestions, cleanupQuiz]); // Add dependencies

  useEffect(() => {
  if (
    quizReady &&
    !loading &&
    isQuizActive &&
    isScreenFocused &&
    questions.length > 0 &&
    !showExplanation &&
    !isProcessing
  ) {
    console.log("🚀 Starting timer after quiz ready");
    startTimer();
    inputRef.current?.focus(); // 🔥 Focus input
    setQuizReady(false);
  }
}, [
  quizReady,
  loading,
  isQuizActive,
  isScreenFocused,
  questions.length,
  showExplanation,
  isProcessing,
  startTimer,
]);

  // Focus input when question changes
  useEffect(() => {
    if (!showExplanation && isScreenFocused && questions.length > 0) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [
    currentQuestionIndex,
    showExplanation,
    questions.length,
    isScreenFocused,
  ]);

  const handleInputChange = useCallback(
    (text: string) => {
      if (!isQuizActive || showExplanation || !isScreenFocused || isProcessing)
        return;

      setUserAnswer(text);

      // Clear existing timeout
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }

      // Auto-submit if answer is provided
      if (text.trim() !== "" && AUTO_SUBMIT_DELAY === 0) {
        const normalizedUserAnswer = text.trim().toLowerCase();
        const normalizedCorrect = questions[currentQuestionIndex]?.correctAnswer
          .trim()
          .toLowerCase();

        if (normalizedUserAnswer === normalizedCorrect) {
          handleSubmitAnswer(true);
        }
      }
    },
    [
      isQuizActive,
      showExplanation,
      isScreenFocused,
      isProcessing,
      questions,
      currentQuestionIndex,
      handleSubmitAnswer,
    ]
  );

  // Validate answer
  const validateAnswer = (answer: string) => {
    if (
      !questions[currentQuestionIndex] ||
      isProcessing ||
      !isScreenFocused ||
      showExplanation
    )
      return;

    const normalizedUserAnswer = answer.trim().toLowerCase();
    const normalizedCorrect = questions[currentQuestionIndex].correctAnswer
      .trim()
      .toLowerCase();

    if (normalizedUserAnswer === normalizedCorrect) {
      handleSubmitAnswer(true);
    }
  };

  const handleManualSubmit = useCallback(() => {
    if (!userAnswer.trim() || isProcessing || showExplanation) return;

    const normalizedUserAnswer = userAnswer.trim().toLowerCase();
    const normalizedCorrect = questions[currentQuestionIndex]?.correctAnswer
      .trim()
      .toLowerCase();

    const isCorrect = normalizedUserAnswer === normalizedCorrect;
    handleSubmitAnswer(isCorrect);
  }, [
    userAnswer,
    isProcessing,
    showExplanation,
    questions,
    currentQuestionIndex,
    handleSubmitAnswer,
  ]);
useEffect(()=>{
  return()=>{
    SoundManager.forceStopSound('levelSoundEffect');

  }
})
  // Handle quit quiz
  const handleQuitQuiz = () => {
    Alert.alert(
      "Quit Quiz?",
      "Are you sure you want to quit? Your progress will be lost and you'll need to restart this level.",
      [
        { text: "Resume", style: "cancel" },
        {
          text: "Quit",
          style: "destructive",
          onPress: () => {
            SoundManager.forceStopSound('levelSoundEffect');
            cleanupQuiz();
            resetQuizState();
            router.push("/user/home");
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!loading && questions.length > 0 && !gameStartTimeRef.current) {
      // If for some reason the start time wasn't set, set it now
      const startTime = Date.now();
      setGameStartTime(startTime);
      gameStartTimeRef.current = startTime;
      gameInitializedRef.current = true;
    }
  }, [loading, questions.length]);

  useEffect(() => {
    if (showExplanation && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      timerAnimation.stopAnimation();
    }
  }, [showExplanation, timerAnimation]);

 
  // Handle back button
  useEffect(() => {
    const backAction = () => {
      if (isQuizActive && isScreenFocused) {
        handleQuitQuiz();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [isQuizActive, isScreenFocused]);

  useEffect(() => {
    // whenever we move to a new question, make sure it starts fully visible
    questionTransition.setValue(1);
  }, [currentQuestionIndex, questionTransition]);

  // Get timer color
  const getTimerColor = () => {
    const percentage = timeLeft / QUIZ_TIME_LIMIT;
    if (percentage > 0.6) return "#10B981";
    if (percentage > 0.3) return "#F59E0B";
    return "#EF4444";
  };
  // Render loading state
  if (loading) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <Text className="text-primary text-xl mb-4">Loading Quiz...</Text>
        <CircularProgress
          size={80}
          progress={0.6}
          strokeWidth={8}
          color="#FFFFFF"
          text="Loading"
        />
      </View>
    );
  }
  // Render network error
  if (networkError) {
    return (
      <View className="flex-1 bg-primary justify-center items-center p-4">
        <Text className="text-primary text-xl mb-4 text-center">
          Network Error
        </Text>
        <Text className="text-gray-300 text-center mb-6">
          Please check your internet connection and try again.
        </Text>
        <TouchableOpacity
          className="bg-white px-6 py-3 rounded-xl"
          onPress={loadQuestions}
        >
          <Text className="text-primary font-bold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const renderQuestion = () => {
    if (!questions[currentQuestionIndex]) {
      return <Text className="text-primary text-xl">Loading question...</Text>;
    }

    const question = questions[currentQuestionIndex];
    const inputReady =
  questions.length > 0 &&
  isQuizActive &&
  !showExplanation &&
  !isProcessing &&
  isScreenFocused;


    return (
      <Animated.View
        key={currentQuestionIndex}
        style={{
          opacity: questionTransition,
          transform: [{ scale: questionTransition }], // Optional: add scale for smoother transition
        }}
        className="bg-white overflow-hidden rounded-2xl border border-black"
      >
        <Text className="text-3xl font-black bg-light-orange px-2 py-6 text-custom-purple text-center">
          What is {question.questionText} ?
        </Text>

        <View className="p-10">
          <TextInput
            ref={inputRef}
            className={`bg-custom-gray p-4 rounded-xl text-xl text-center border ${isAnswerWrong ? "border-red-500" : "border-gray-100"
              } ${isProcessing ? "opacity-50" : ""}`}
            value={userAnswer}
            onChangeText={handleInputChange}
            onSubmitEditing={handleManualSubmit} // Add this line
            placeholder="Type Your Answer"
            placeholderTextColor="#777"
            keyboardType="numeric"
            autoFocus={true}
            returnKeyType="done" // Add this line
            editable={
              inputReady
            }
          />
          
        </View>

        {isProcessing && (
          <Text className="text-primary text-center pb-2"></Text>
        )}
      </Animated.View>
    );
  };
 // Render explanation
  const renderExplanation = () => {
    if (!showExplanation || !questions[currentQuestionIndex]) return null;

    const question = questions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex >= questions.length - 1;

    return (
      <View className="bg-white border border-black p-0 rounded-2xl mt-4 overflow-hidden">
        <View className="flex-row items-center mb-2 p-4 border-b bg-light-orange">
          <Text className="text-red-600 font-bold text-lg text-center w-full">
            {isTimeOut ? "⏰ Time's Up!" : "❌ Incorrect"}
          </Text>
        </View>
        <View className="flex flex-col items-center gap-2 p-4">
          <Text className="text-custom-purple text-3xl">
            <Text className="font-black">Explanation</Text>
          </Text>
          {question.explanation && (
            <Text className="text-primary text-xl font-bold mb-4 text-center">
              {question.explanation}
            </Text>
          )}

          <TouchableOpacity
            className="bg-primary py-3 px-6 rounded-xl"
            onPress={() => handleGameEnd()}
            disabled={isProcessing}
          >
            <Text className="text-white font-bold">View Results</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  return (
    <>
      {/* HEADER HERE */}
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-4">
          <View className="flex-row justify-between items-center">
            <Text className="text-white text-3xl font-black">
              Level {currentLevel}
            </Text>
            <View className="flex-row items-center gap-4">
              <View className="flex-row items-center bg-primary px-3 py-1 rounded-full">
                <Text className="text-white text-sm font-black">
                  {accumulatedScore + quizScore} pts
                </Text>
              </View>
              <View className="flex-row items-center bg-yellow-500 px-3 py-1 rounded-full">
                <Text className="text-white text-sm font-black">
                  Best: {currentHighScore}
                </Text>
              </View>
              <TouchableOpacity className="" onPress={handleQuitQuiz}>
                <View className="flex-row items-center gap-1 bg-red-500 contrast-200 px-3 py-1 rounded-full">
                  <Text className="text-white text-sm font-black">Quit</Text>
                  <Image
                    source={require("../../assets/icons/quitquiz.png")}
                    style={{ width: 20, height: 20 }}
                    tintColor={"#fff"}
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
      <ScrollView className="flex-1 bg-white">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 bg-white p-4"
        >
          {/* Progress Indicators */}
          <View className="flex-row justify-between items-center mb-6">
            {/* Question Progress */}
            <View className="items-center">
              <CircularProgress
                size={70}
                strokeWidth={8}
                color="#F97316"
                progress={(currentQuestionIndex + 1) / maxDisplayQuestions}
                text={`${currentQuestionIndex + 1}/${maxDisplayQuestions}`}
              />
            </View>

            {/* Timer Bar */}
            <View className="flex-1 ml-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-primary">Time Remaining:</Text>
                <Text className="text-primary font-bold">{timeLeft}s</Text>
              </View>
              <View className="bg-gray-300 h-4 rounded-full overflow-hidden">
                <Animated.View
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: getTimerColor(),
                    width: timerAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  }}
                />
              </View>
            </View>
          </View>

          {/* Question Area */}
          {renderQuestion()}

          {/* Explanation */}
          {renderExplanation()}
        </KeyboardAvoidingView>
      </ScrollView>
    </>
  );
}

