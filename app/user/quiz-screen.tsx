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
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import SoundManager from "../../components/soundManager";

import { auth, database } from "../../firebase/firebaseConfig";
import { updateUserStreak } from "../../utils/streakManager";

// Configuration
const QUIZ_TIME_LIMIT = 15;
const EXPLANATION_DISPLAY_TIME = 4000; // 4 seconds

interface Question {
  id: string;
  questionText: string;
  correctAnswer: string;
  explanation?: string;
  point: number;
  timeLimit: number;
}

// Circular Progress Component
const CircularProgress = ({
  size,
  progress,
  strokeWidth,
  color,
  text,
}: {
  size: number;
  progress: number;
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

  // Core quiz state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [quizScore, setQuizScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUIZ_TIME_LIMIT);
  const [maxDisplayQuestions, setMaxDisplayQuestions] = useState(5);

  // UI state
  const [showExplanation, setShowExplanation] = useState(false);
  const [isAnswerWrong, setIsAnswerWrong] = useState(false);
  const [isTimeOut, setIsTimeOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(true);

  // User data
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState(1);
  const [fullname, setFullname] = useState("");
  const [currentHighScore, setCurrentHighScore] = useState(0);

  // Game session data
  const [accumulatedScore, setAccumulatedScore] = useState(0);
  const [gameStartTime, setGameStartTime] = useState<number>(0);
  const [totalGameTimeMs, setTotalGameTimeMs] = useState<number>(0);

  // Level transition
  const [isLevelTransition, setIsLevelTransition] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);

  // Refs
  const timerRef = useRef<number | null>(null);
  const explanationTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const isMountedRef = useRef(true);
  const gameStartTimeRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Animated values
  const timerAnimation = useRef(new Animated.Value(1)).current;
  const questionTransition = useRef(new Animated.Value(1)).current;
  const levelTransitionAnimation = useRef(new Animated.Value(0)).current;

  // **CORE CLEANUP FUNCTION**
  const cleanupQuiz = useCallback(() => {
    // console.log("🧹 Cleaning up quiz resources");

    // Clear all timers
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (explanationTimeoutRef.current) {
      clearTimeout(explanationTimeoutRef.current);
      explanationTimeoutRef.current = null;
    }

    // Stop all animations
    timerAnimation.stopAnimation();
    questionTransition.stopAnimation();
    levelTransitionAnimation.stopAnimation();

    // Reset animation values
    timerAnimation.setValue(1);
    questionTransition.setValue(1);
    levelTransitionAnimation.setValue(0);
  }, [timerAnimation, questionTransition, levelTransitionAnimation]);

  // **RESET QUIZ STATE**
  const resetQuizState = useCallback(() => {
    // console.log(`🔄 Resetting quiz state for level ${currentLevel}`);

    cleanupQuiz();

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
    setNetworkError(false);
    setIsLevelTransition(false);
    setTransitionProgress(0);

    // Clear input
    inputRef.current?.clear();
    inputRef.current?.blur();

    // Reset accumulated score only for fresh starts
    if (params.isSelectedLevel === "true") {
      setAccumulatedScore(0);
    }
  }, [cleanupQuiz, currentLevel, params.isSelectedLevel]);

  // **LOAD USER DATA**
  const loadUserData = useCallback(async () => {
    try {
      const cachedData = await AsyncStorage.getItem("userData");
      if (cachedData) {
        const data = JSON.parse(cachedData);
        setUsername(data.username || "player");
        setFullname(data.fullName || "Player");
        setAvatar(data.avatar || 1);
      }

      const cachedHighScore = await AsyncStorage.getItem("highScore");
      if (cachedHighScore) {
        setCurrentHighScore(parseInt(cachedHighScore, 10));
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }, []);

  // **LOAD QUESTIONS**
  const loadQuestions = useCallback(async () => {
    try {
    //   console.log(`📚 Loading questions for level ${currentLevel}`);
      setLoading(true);
      setNetworkError(false);

      const cacheKey = `quiz-level-${currentLevel}-v2`;

      // Clear cache for fresh level selection
      if (params.isSelectedLevel === "true") {
        await AsyncStorage.removeItem(cacheKey);
      } else {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // console.log(`💾 Loaded ${parsed.length} questions from cache`);
            setQuestions(parsed);
            setMaxDisplayQuestions(parsed.length);
            setLoading(false);
            return;
          }
        }
      }

      // Load from Firebase
      const snapshot = await get(ref(database, "quizzes"));
      if (!snapshot.exists()) {
        throw new Error("No quizzes found");
      }

      let maxDisplay = 5;
      const levelQuizzes = [];

      snapshot.forEach((child) => {
        const quiz = child.val();
        if (quiz.level === currentLevel && Array.isArray(quiz.questions)) {
          if (quiz.maxDisplayQuestions) {
            maxDisplay = Math.max(1, parseInt(quiz.maxDisplayQuestions));
          }
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

      if (levelQuizzes.length === 0) {
        throw new Error(`No questions found for level ${currentLevel}`);
      }

      // Shuffle and select questions
      const shuffled = levelQuizzes.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, maxDisplay);

    //   console.log(
    //     `✅ Selected ${selected.length} questions for level ${currentLevel}`
    //   );

      // Cache the questions
      await AsyncStorage.setItem(cacheKey, JSON.stringify(selected));

      setQuestions(selected);
      setMaxDisplayQuestions(selected.length);
      setLoading(false);
    } catch (error) {
      console.error("❌ Failed to load questions:", error);
      setNetworkError(true);
      setLoading(false);

      Alert.alert("Error", "Failed to load questions. Please try again.", [
        { text: "Retry", onPress: loadQuestions },
        { text: "Back", onPress: () => router.back() },
      ]);
    }
  }, [currentLevel, params.isSelectedLevel]);

  // **TIMER MANAGEMENT**
  const startTimer = useCallback(() => {
    // console.log("⏰ Starting timer");

    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Reset timer state
    setTimeLeft(QUIZ_TIME_LIMIT);
    timerAnimation.setValue(1);

    // Start timer animation
    Animated.timing(timerAnimation, {
      toValue: 0,
      duration: QUIZ_TIME_LIMIT * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Start countdown
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timerAnimation]);

  const stopTimer = useCallback(() => {
    // console.log("⏹️ Stopping timer");

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    timerAnimation.stopAnimation();
  }, [timerAnimation]);

  // **HANDLE TIME UP**
  const handleTimeUp = useCallback(async () => {
    if (!isQuizActive || isProcessing || showExplanation) return;

    // console.log("⏰ Time's up!");

    setIsProcessing(true);
    setIsTimeOut(true);
    setShowExplanation(true);

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    await SoundManager.playSound("wrongAnswerSoundEffect");

    // Auto-navigate to results after explanation
    explanationTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        handleGameEnd();
      }
    }, EXPLANATION_DISPLAY_TIME);

    setIsProcessing(false);
  }, [isQuizActive, isProcessing, showExplanation]);

  // **HANDLE ANSWER SUBMISSION**
  const handleSubmitAnswer = useCallback(
    async (isCorrect: boolean) => {
      if (
        isProcessing ||
        !isQuizActive ||
        currentQuestionIndex >= questions.length
      ) {
        return;
      }

    //   console.log(
    //     `🎯 Submitting answer: ${isCorrect ? "✅ Correct" : "❌ Wrong"}`
    //   );

      setIsProcessing(true);
      stopTimer();

      if (isCorrect) {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
        await SoundManager.playSound("rightAnswerSoundEffect");

        const pointsPerQuestion = currentLevel;
        const newQuizScore = quizScore + pointsPerQuestion;
        const newCorrectAnswers = correctAnswers + 1;

        setQuizScore(newQuizScore);
        setCorrectAnswers(newCorrectAnswers);

        // Check if this is the last question
        if (currentQuestionIndex >= questions.length - 1) {
        //   console.log(`🎉 Level ${currentLevel} completed!`);
          handleLevelComplete(newQuizScore, newCorrectAnswers);
        } else {
          // Move to next question
        //   console.log(`➡️ Moving to next question`);
          moveToNextQuestion();
        }
      } else {
        // Wrong answer
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        await SoundManager.playSound("wrongAnswerSoundEffect");

        setIsAnswerWrong(true);
        setShowExplanation(true);

        // Auto-navigate to results after explanation
        explanationTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            handleGameEnd();
          }
        }, EXPLANATION_DISPLAY_TIME);
      }

      setIsProcessing(false);
    },
    [
      isProcessing,
      isQuizActive,
      currentQuestionIndex,
      questions.length,
      quizScore,
      correctAnswers,
      currentLevel,
      stopTimer,
    ]
  );

  // **MOVE TO NEXT QUESTION**
  const moveToNextQuestion = useCallback(() => {
    // console.log("➡️ Moving to next question");

    // Animate question transition
    Animated.timing(questionTransition, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // Update question index
      setCurrentQuestionIndex((prev) => prev + 1);
      setUserAnswer("");
      setIsAnswerWrong(false);

      // Animate in new question
      Animated.timing(questionTransition, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Start timer for new question
        startTimer();

        // Focus input after a short delay
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      });
    });
  }, [questionTransition, startTimer]);

  // **HANDLE LEVEL COMPLETION**
  const handleLevelComplete = useCallback(
    async (levelScore: number, levelCorrectAnswers: number) => {
    //   console.log(
    //     `🎉 Level ${currentLevel} completed with score: ${levelScore}`
    //   );

      try {
        // Update user data in Firebase
        const userId = auth.currentUser?.uid;
        if (!userId) {
          handleGameEnd();
          return;
        }

        setIsLevelTransition(true);

        // Animate level transition
        Animated.timing(levelTransitionAnimation, {
          toValue: 1,
          duration: 800,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: false,
        }).start();

        // Update progress
        const progressInterval = setInterval(() => {
          setTransitionProgress((prev) => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return 90;
            }
            return prev + 10;
          });
        }, 100);

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
        const updates = {
          totalPoints: newTotalPoints,
          [`completedLevels/${currentLevel}`]: true,
          lastPlayedLevel: currentLevel,
          lastPlayedDate: Date.now(),
        };

        // Unlock next level if all questions answered correctly
        if (
          levelCorrectAnswers === questions.length &&
          currentLevel >= (userData.currentLevel || 1)
        ) {
          updates.currentLevel = nextLevel;
        //   console.log(`🆙 Unlocking next level: ${nextLevel}`);
        }

        await update(userRef, updates);
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

        // Complete progress
        clearInterval(progressInterval);
        setTransitionProgress(100);

        // Decide next action
        if (nextLevelExists && levelCorrectAnswers === questions.length) {
          // Continue to next level
          setTimeout(() => {
            const startTimeToPass = gameStartTimeRef.current || gameStartTime;

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
          }, 1000);
        } else {
          // End game
          setTimeout(() => {
            handleGameEnd(newAccumulatedScore, levelCorrectAnswers, true);
          }, 1000);
        }
      } catch (error) {
        console.error("❌ Error handling level completion:", error);
        setIsLevelTransition(false);
        handleGameEnd();
      }
    },
    [
      currentLevel,
      accumulatedScore,
      gameStartTime,
      questions.length,
      levelTransitionAnimation,
    ]
  );

  // **HANDLE GAME END**
  const handleGameEnd = useCallback(
    async (
      finalScore?: number,
      finalCorrectAnswers?: number,
      isGameComplete = false
    ) => {
    //   console.log("🏁 Game ending");

      setIsQuizActive(false);
      cleanupQuiz();

      // Calculate final scores
      const totalScore = finalScore ?? accumulatedScore + quizScore;
      const totalCorrect = finalCorrectAnswers ?? correctAnswers;

      // Calculate game time
      const startTime = gameStartTimeRef.current || gameStartTime;
      const gameEndTime = Date.now();
      let calculatedTimeMs = 0;

      if (startTime && startTime > 0) {
        const rawTimeMs = gameEndTime - startTime;
        const maxReasonableTime = 2 * 60 * 60 * 1000; // 2 hours
        const minReasonableTime = 1000; // 1 second

        if (rawTimeMs >= minReasonableTime && rawTimeMs <= maxReasonableTime) {
          calculatedTimeMs = rawTimeMs;
        }
      }

      setTotalGameTimeMs(calculatedTimeMs);

      // Check for new high score
      const isNewHighScore = totalScore > currentHighScore;

      if (isNewHighScore) {
        const userId = auth.currentUser?.uid;
        if (userId) {
          try {
            const userRef = ref(database, `users/${userId}`);
            await update(userRef, { highScore: totalScore });
            await AsyncStorage.setItem("highScore", totalScore.toString());
            // console.log(
            //   `Updated highScore to ${totalScore} in database and AsyncStorage`
            // );
          } catch (error) {
            console.error("Error updating highScore:", error);
          }
        }
      }

      // Navigate to results
      router.push({
        pathname: "/user/results",
        params: {
          quizScore: totalScore.toString(),
          correctAnswers: totalCorrect.toString(),
          totalQuestions: questions.length.toString(),
          currentLevel: currentLevel.toString(),
          username: username || "player",
          fullname: fullname || "Player",
          avatar: avatar.toString(),
          isPassed: (
            isGameComplete && totalCorrect === questions.length
          ).toString(),
          isGameComplete: isGameComplete.toString(),
          totalGameTime: calculatedTimeMs.toString(),
          isNewHighScore: isNewHighScore.toString(),
          highScore: Math.max(totalScore, currentHighScore).toString(),
        },
      });
    },
    [
      accumulatedScore,
      quizScore,
      correctAnswers,
      gameStartTime,
      currentHighScore,
      questions.length,
      currentLevel,
      username,
      fullname,
      avatar,
      cleanupQuiz,
    ]
  );

  // **HANDLE INPUT CHANGE**
  const handleInputChange = useCallback(
    (text: string) => {
      if (!isQuizActive || showExplanation || isProcessing) return;

      setUserAnswer(text);

      // Auto-submit correct answers
      if (text.trim() !== "") {
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
      isProcessing,
      questions,
      currentQuestionIndex,
      handleSubmitAnswer,
    ]
  );

  // **HANDLE MANUAL SUBMIT**
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

  // **HANDLE QUIT QUIZ**
  const handleQuitQuiz = useCallback(() => {
    Alert.alert(
      "Quit Quiz?",
      "Are you sure you want to quit? Your progress will be lost.",
      [
        { text: "Resume", style: "cancel" },
        {
          text: "Quit",
          style: "destructive",
          onPress: () => {
            cleanupQuiz();
            router.push("/user/home");
          },
        },
      ]
    );
  }, [cleanupQuiz]);

  // **HANDLE QUIZ INITIALIZATION**
  const handleQuizInit = useCallback(async () => {
    // console.log(`🎯 Initializing quiz for level ${currentLevel}`);

    setIsScreenFocused(true);

    // Set game start time
    const startTime =
      params.isSelectedLevel === "true" || !params.gameStartTime
        ? Date.now()
        : Number(params.gameStartTime);

    setGameStartTime(startTime);
    gameStartTimeRef.current = startTime;

    // Set accumulated score
    const accScore =
      params.isSelectedLevel === "true"
        ? 0
        : Number(params.accumulatedScore) || 0;
    setAccumulatedScore(accScore);

    // Reset quiz state and load questions
    resetQuizState();
    await loadUserData();
    await loadQuestions();
  }, [
    currentLevel,
    params.isSelectedLevel,
    params.gameStartTime,
    params.accumulatedScore,
    resetQuizState,
    loadUserData,
    loadQuestions,
  ]);

  // **FOCUS EFFECT**
  useFocusEffect(
    useCallback(() => {
      handleQuizInit();

      return () => {
        // console.log(`🚪 Cleanup for level ${currentLevel}`);
        setIsScreenFocused(false);
        cleanupQuiz();
      };
    }, [handleQuizInit, currentLevel, cleanupQuiz])
  );

  // **START QUIZ WHEN READY**
  useEffect(() => {
    if (!loading && questions.length > 0 && !isQuizActive && !showExplanation) {
    //   console.log("🚀 Starting quiz");
      setIsQuizActive(true);

      // Start timer after a short delay
      setTimeout(() => {
        startTimer();
        inputRef.current?.focus();
      }, 500);
    }
  }, [loading, questions.length, isQuizActive, showExplanation, startTimer]);

  // **APP STATE HANDLING**
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/active/) &&
        nextAppState === "background"
      ) {
        cleanupQuiz();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription?.remove();
  }, [cleanupQuiz]);

  // **BACK BUTTON HANDLING**
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
  }, [isQuizActive, isScreenFocused, handleQuitQuiz]);

  // **CLEANUP ON UNMOUNT**
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      cleanupQuiz();
    };
  }, [cleanupQuiz]);

  // **TIMER COLOR**
  const getTimerColor = () => {
    const percentage = timeLeft / QUIZ_TIME_LIMIT;
    if (percentage > 0.6) return "#10B981";
    if (percentage > 0.3) return "#F59E0B";
    return "#EF4444";
  };

  // **RENDER LEVEL TRANSITION**
  const renderLevelTransition = () => {
    if (!isLevelTransition) return null;

    return (
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(139, 69, 19, 0.95)",
          zIndex: 1000,
          justifyContent: "center",
          alignItems: "center",
          opacity: levelTransitionAnimation,
        }}
      >
        <View className="items-center">
          <Text className="text-white text-4xl font-black mb-4">
            Level {currentLevel} Complete! 🎉
          </Text>
          <Text className="text-white text-xl mb-6">
            Moving to Level {currentLevel + 1}
          </Text>
          <View className="w-64 h-2 bg-white/30 rounded-full mb-4">
            <View
              className="h-full bg-white rounded-full"
              style={{ width: `${transitionProgress}%` }}
            />
          </View>
          <Text className="text-white text-lg">
            {transitionProgress < 100 ? "Preparing next level..." : "Ready!"}
          </Text>
        </View>
      </Animated.View>
    );
  };

  // **RENDER QUESTION**
  const renderQuestion = () => {
    if (!questions[currentQuestionIndex]) {
      return (
        <View className="bg-white overflow-hidden rounded-2xl border border-black min-h-[200px] justify-center items-center">
          <Text className="text-primary text-xl">Loading question...</Text>
        </View>
      );
    }

    const question = questions[currentQuestionIndex];
    const isInputEditable =
      isQuizActive && !showExplanation && !isProcessing && isScreenFocused;

    return (
      <Animated.View
        style={{
          opacity: questionTransition,
          transform: [{ scale: questionTransition }],
        }}
        className="bg-white overflow-hidden rounded-2xl border border-black"
      >
        <Text className="text-3xl font-black bg-light-orange px-2 py-6 text-custom-purple text-center">
          What is {question.questionText}?
        </Text>

        <View className="p-10">
          <TextInput
            ref={inputRef}
            className={`bg-custom-gray p-4 rounded-xl text-xl text-center border ${
              isAnswerWrong ? "border-red-500" : "border-gray-100"
            } ${isProcessing ? "opacity-50" : ""}`}
            value={userAnswer}
            onChangeText={handleInputChange}
            onSubmitEditing={handleManualSubmit}
            placeholder="Type Your Answer"
            placeholderTextColor="#777"
            keyboardType="numeric"
            returnKeyType="done"
            editable={isInputEditable}
            autoFocus={false}
          />
        </View>
      </Animated.View>
    );
  };

  // **RENDER EXPLANATION**
  const renderExplanation = () => {
    if (!showExplanation || !questions[currentQuestionIndex]) return null;

    const question = questions[currentQuestionIndex];

    return (
      <View className="bg-white border border-black p-0 rounded-2xl mt-4 overflow-hidden">
        <View className="flex-row items-center mb-2 p-4 border-b bg-light-orange">
          <Text className="text-red-600 font-bold text-lg text-center w-full">
            {isTimeOut ? "⏰ Time's Up!" : "❌ Incorrect"}
          </Text>
        </View>
        <View className="flex flex-col items-center gap-2 p-4">
          <Text className="text-custom-purple text-3xl font-black mb-2">
            Explanation
          </Text>
          {question.explanation && (
            <Text className="text-primary text-xl font-bold mb-4 text-center">
              {question.explanation}
            </Text>
          )}
          <Text className="text-gray-600 text-center">
            Redirecting to results in{" "}
            {Math.ceil(
              explanationTimeoutRef.current
                ? EXPLANATION_DISPLAY_TIME / 1000
                : 0
            )}{" "}
            seconds...
          </Text>
        </View>
      </View>
    );
  };

  // **RENDER LOADING**
  if (loading) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <Text className="text-white text-2xl mb-4 font-bold">
          Loading Level {currentLevel}...
        </Text>
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

  // **RENDER NETWORK ERROR**
  if (networkError) {
    return (
      <View className="flex-1 bg-primary justify-center items-center p-4">
        <Text className="text-white text-xl mb-4 text-center">
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

  return (
    <>
      {/* Header */}
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
              <TouchableOpacity onPress={handleQuitQuiz}>
                <View className="flex-row items-center gap-1 bg-red-500 px-3 py-1 rounded-full">
                  <Text className="text-white text-sm font-black">Quit</Text>
                  <Image
                    source={require("../../assets/icons/quitquiz.png")}
                    style={{ width: 20, height: 20 }}
                    tintColor="#fff"
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>

      {/* Main Content */}
      <ScrollView className="flex-1 bg-white">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 bg-white p-4"
        >
          {/* Progress Indicators */}
          <View className="flex-row justify-between items-center mb-6">
            <View className="items-center">
              <CircularProgress
                size={70}
                strokeWidth={8}
                color="#F97316"
                progress={(currentQuestionIndex + 1) / maxDisplayQuestions}
                text={`${currentQuestionIndex + 1}/${maxDisplayQuestions}`}
              />
            </View>

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

          {/* Question */}
          {renderQuestion()}

          {/* Explanation */}
          {renderExplanation()}
        </KeyboardAvoidingView>
      </ScrollView>

      {/* Level Transition Overlay */}
      {renderLevelTransition()}
    </>
  );
}
