import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { get, ref, update } from "firebase/database";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { auth, database } from "../../firebase/firebaseConfig";
import SoundManager from "../../components/soundManager";

// Configuration
const QUIZ_TIME_LIMIT = 15;
const AUTO_SUBMIT_DELAY = 500; // 200ms delay for auto-submit
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
  // console.log("Current Level is:", currentLevel);

  // State management
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [quizScore, setQuizScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isAnswerWrong, setIsAnswerWrong] = useState(false);
  const [isTimeOut, setIsTimeOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState(1);
  const [fullname, setFullname] = useState("");
  const [timeLeft, setTimeLeft] = useState(QUIZ_TIME_LIMIT);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isQuizActive, setIsQuizActive] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const [maxDisplayQuestions, setMaxDisplayQuestions] = useState(20);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const explanationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const inputRef = useRef<TextInput>(null);
  const isMountedRef = useRef(true);

  // Animated values
  const timerAnimation = useRef(new Animated.Value(1)).current;
  const questionTransition = useRef(new Animated.Value(1)).current;

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
    setIsQuizActive(false);
  }, []);

  const clearLevelCache = useCallback(async () => {
    try {
      const cacheKey = `quiz-level-${currentLevel}`;
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      console.error("Error clearing level cache:", error);
    }
  }, [currentLevel]);

  const resetQuizState = useCallback(() => {
    if (!isMountedRef.current) return;

    // Stop all timers first
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
    setIsQuizActive(true);
    setLoading(true);
    setNetworkError(false);

    // Reset animation values - THIS IS THE KEY FIX
    questionTransition.setValue(1);
    timerAnimation.setValue(1);
  }, [cleanupQuiz, questionTransition, timerAnimation]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
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

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);

      // Clear any existing questions first
      setQuestions([]);
      setLoading(true);

      // Reset animation values when screen focuses - IMPORTANT FIX
      questionTransition.setValue(1);
      timerAnimation.setValue(1);

      resetQuizState();
      loadQuestions();

      return () => {
        setIsScreenFocused(false);
        cleanupQuiz();
        AsyncStorage.removeItem(`quiz-level-${currentLevel}`);
      };
    }, [currentLevel, level, questionTransition, timerAnimation])
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
  }, [resetQuizState]);

  // Load user data
  const loadUserData = useCallback(async () => {
    try {
      const cachedData = await AsyncStorage.getItem("userData");
      if (cachedData) {
        const data = JSON.parse(cachedData);
        setUsername(data.username || "player");
        setFullname(data.fullName || "Player");
        setAvatar(data.avatar || 0);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }, []);

  const loadQuestions = useCallback(async () => {
    try {
      setNetworkError(false);

      // Reset animation at the start of loading - ADDITIONAL SAFETY
      questionTransition.setValue(1);

      // Check cache first
      const cacheKey = `quiz-level-${currentLevel}`;
      const cachedQuestions = await AsyncStorage.getItem(cacheKey);

      if (cachedQuestions) {
        setQuestions(JSON.parse(cachedQuestions));
        setLoading(false);
        return;
      }

      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);

      if (!snapshot.exists()) throw new Error("No quizzes found");

      let maxDisplayQuestions = 20; // Default value
      const levelQuizzes: Question[] = [];

      // First pass: Find maxDisplayQuestions value
      snapshot.forEach((childSnapshot) => {
        const quiz = childSnapshot.val();
        if (
          quiz.level === currentLevel &&
          typeof quiz.maxDisplayQuestions === "number"
        ) {
          maxDisplayQuestions = Math.max(1, quiz.maxDisplayQuestions);
          setMaxDisplayQuestions(maxDisplayQuestions);
        }
      });

      // Second pass: Collect questions
      snapshot.forEach((childSnapshot) => {
        const quiz = childSnapshot.val();
        if (quiz.level === currentLevel && quiz.questions) {
          quiz.questions.forEach((q: any) => {
            levelQuizzes.push({
              id: q.id || Math.random().toString(),
              questionText: q.questionText,
              correctAnswer: q.correctAnswer.toString(),
              explanation: q.explanation || "",
              //   point: currentLevel * 20,
              timeLimit: QUIZ_TIME_LIMIT,
            });
          });
        }
      });

      if (levelQuizzes.length === 0) {
        Alert.alert("No Questions", "No questions available for this level", [
          { text: "OK", onPress: () => router.back() },
        ]);
        return;
      }

      // Apply maxDisplayQuestions - FIXED: Shuffle and select random questions
      const questionCount = Math.min(maxDisplayQuestions, levelQuizzes.length);
      const selectedQuestions = levelQuizzes
        .sort(() => Math.random() - 0.5)
        .slice(0, questionCount);

      setQuestions(selectedQuestions);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(selectedQuestions));
    } catch (error) {
      console.error("Error loading questions:", error);
      setNetworkError(true);
      Alert.alert(
        "Network Error",
        "Failed to load questions. Please check your connection and try again.",
        [
          { text: "Retry", onPress: loadQuestions },
          { text: "Cancel", onPress: () => router.back() },
        ]
      );
    } finally {
      setLoading(false);
    }
  }, [currentLevel, questionTransition]);

  useEffect(() => {
    if (initialLoadComplete && level) {
      // Only reset when level actually changes after initial load
      resetQuizState();
      loadQuestions();
    }
  }, [level, initialLoadComplete]);

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
  }, []); // Remove dependencies to prevent re-initialization

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

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    timerAnimation.stopAnimation();
  }, []);

  useEffect(() => {
    if (
      !loading &&
      questions.length > 0 &&
      isQuizActive &&
      !showExplanation &&
      isScreenFocused &&
      !isProcessing
    ) {
      // Add small delay to ensure state is settled
      const timer = setTimeout(() => {
        startTimer();
      }, 100);

      return () => clearTimeout(timer);
    }

    return () => {
      stopTimer();
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
      if (explanationTimeoutRef.current)
        clearTimeout(explanationTimeoutRef.current);
    };
  }, [
    currentQuestionIndex,
    loading,
    questions.length, // Use length instead of questions array
    isQuizActive,
    showExplanation,
    isScreenFocused,
    isProcessing,
  ]); // Remove function dependencies

  // Focus input when question changes
  useEffect(() => {
    if (!showExplanation && questions.length > 0 && isScreenFocused) {
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

  // Handle answer input
  const handleInputChange = (text: string) => {
    if (!isQuizActive || showExplanation || !isScreenFocused || isProcessing)
      return;

    setUserAnswer(text);

    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);

    if (text.trim() !== "") {
      submitTimeoutRef.current = setTimeout(() => {
        validateAnswer(text);
      }, AUTO_SUBMIT_DELAY);
    }
  };

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
    } else {
      handleSubmitAnswer(false);
    }
  };

  // Handle answer submission
  const handleSubmitAnswer = useCallback(
    async (isCorrect: boolean) => {
      if (isProcessing || !isQuizActive || !isScreenFocused) return;

      const currentQ = questions[currentQuestionIndex];
      if (!currentQ) return;

      setIsProcessing(true);
      stopTimer();

      if (isCorrect) {
        await SoundManager.playSound("rightAnswerSoundEffect");

        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );

        // FIXED: Each correct answer adds points equal to level number
        const pointsPerQuestion = currentLevel;
        setQuizScore((prev) => prev + pointsPerQuestion);
        setCorrectAnswers((prev) => prev + 1);
        setIsAnswerWrong(false);

        // Move to next question immediately for correct answers
        Animated.timing(questionTransition, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          moveToNextQuestion();
          questionTransition.setValue(1);
        });
      } else {
        // WRONG ANSWER - Only show explanation, don't move to next question yet
        // await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // setIsAnswerWrong(true);
        // setShowExplanation(true);
        // setIsProcessing(false); // Allow user to click continue

        // // Auto-advance after explanation time
        // explanationTimeoutRef.current = setTimeout(() => {
        //   if (isMountedRef.current && isScreenFocused) {
        //     handleNextAfterExplanation();
        //   }
        // }, EXPLANATION_DISPLAY_TIME);

        // WRONG ANSWER:
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // 1) play wrong-answer sound
        await SoundManager.playSound("wrongAnswerSoundEffect");

        // 2) show explanation
        setIsAnswerWrong(true);
        setShowExplanation(true);
        setIsProcessing(false);

        // 3) auto-advance after EXPLANATION_DISPLAY_TIME, or wait for user tap
        explanationTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && isScreenFocused) {
            handleLevelCompletion();
          }
        }, EXPLANATION_DISPLAY_TIME);
      }
    },
    [currentQuestionIndex, questions, isQuizActive, isScreenFocused, stopTimer]
  );

  // Handle time up
  const handleTimeUp = useCallback(async () => {
    if (!isQuizActive || isProcessing || !isScreenFocused || showExplanation)
      return;

    setIsProcessing(true);
    stopTimer();

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    await SoundManager.playSound("wrongAnswerSoundEffect");

    setIsTimeOut(true);
    setShowExplanation(true);
    setIsProcessing(false);

    explanationTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && isScreenFocused) {
        handleLevelCompletion();
      }
    }, EXPLANATION_DISPLAY_TIME);
  }, [isQuizActive, isProcessing, isScreenFocused, stopTimer, showExplanation]);

  // Move to next question
  const moveToNextQuestion = useCallback(() => {
    if (!isMountedRef.current) return;

    if (currentQuestionIndex < questions.length - 1) {
      // Move to next question
      setCurrentQuestionIndex((prev) => prev + 1);
      setUserAnswer("");
      setTimeLeft(QUIZ_TIME_LIMIT);
      setIsProcessing(false);
    } else {
      // Quiz completed
      handleLevelCompletion();
    }
  }, [currentQuestionIndex, questions.length]);

  // Handle next question after explanation
  const handleNextAfterExplanation = useCallback(() => {
    if (!isScreenFocused || !isMountedRef.current) return;

    // Clear the explanation timeout
    if (explanationTimeoutRef.current) {
      clearTimeout(explanationTimeoutRef.current);
      explanationTimeoutRef.current = null;
    }

    // Reset explanation states
    setShowExplanation(false);
    setIsAnswerWrong(false);
    setIsTimeOut(false);

    // Check if this was the last question
    if (currentQuestionIndex >= questions.length - 1) {
      // This was the last question, complete the quiz
      handleLevelCompletion();
      return;
    }

    // Animate transition and move to next question
    Animated.timing(questionTransition, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      // Move to next question
      setCurrentQuestionIndex((prev) => prev + 1);
      setUserAnswer("");
      setTimeLeft(QUIZ_TIME_LIMIT);
      setIsProcessing(false);

      questionTransition.setValue(1);
    });
  }, [isScreenFocused, currentQuestionIndex, questions.length]);

  const updateUserProgress = useCallback(
    async (totalScore: number) => {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        //   console.log("User not authenticated");
        return;
      }

      try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val() || {};

        const newPoints = (userData.totalPoints || 0) + totalScore;

        // Update streak
        const today = new Date().toISOString().split("T")[0];
        const lastDate = userData.lastCompletionDate;
        const currentStreak = userData.streak || 0;
        let newStreak = 1;

        if (lastDate === today) {
          newStreak = currentStreak;
        } else if (lastDate && isConsecutiveDay(lastDate, today)) {
          newStreak = currentStreak + 1;
        }

        await update(userRef, {
          totalPoints: newPoints,
          streak: newStreak,
          lastCompletionDate: today,
        });

        await AsyncStorage.setItem("totalPoints", newPoints.toString());
        await AsyncStorage.setItem("streak", newStreak.toString());

        // Calculate pass threshold
        const passThreshold = Math.ceil(questions.length * 0.7);
        const isPassed = correctAnswers >= passThreshold;

        // Only update progress if user passed
        if (isPassed) {
          // Only update level if this was current level
          const shouldUpdateLevel =
            currentLevel === (userData.currentLevel || 1);
          const newLevel = shouldUpdateLevel
            ? Math.min(currentLevel + 1, 6)
            : userData.currentLevel || 1;

          await update(userRef, {
            ...(shouldUpdateLevel && { currentLevel: newLevel }),
            [`completedLevels/${currentLevel}`]: true,
          });

          if (shouldUpdateLevel) {
            await AsyncStorage.setItem("currentLevel", newLevel.toString());
          }
        }

        return isPassed;
      } catch (error) {
        console.error("Error updating user progress:", error);
        Alert.alert(
          "Error",
          "Failed to save progress. Please check your connection."
        );
        return false;
      }
    },
    [currentLevel, questions.length]
  );

  // Check consecutive days
  const isConsecutiveDay = (lastDate: string, today: string) => {
    const last = new Date(lastDate);
    const current = new Date(today);
    const diff = (current.getTime() - last.getTime()) / (1000 * 3600 * 24);
    return diff === 1;
  };

  const handleLevelCompletion = useCallback(async () => {
    // Prevent multiple calls
    if (!isQuizActive) return;

    // FIXED: Calculate total score correctly
    const totalScore = quizScore;

    // console.log(
    //   "Completing quiz with score:",
    //   totalScore,
    //   "correct:",
    //   correctAnswers
    // );

    setIsQuizActive(false);
    cleanupQuiz(); // Clean up all timers and processes

    try {
      const isPassed = await updateUserProgress(totalScore);

      // Small delay to ensure cleanup is complete
      setTimeout(() => {
        router.push({
          pathname: "/user/results",
          params: {
            quizScore: totalScore.toString(),
            correctAnswers: correctAnswers.toString(),
            totalQuestions: questions.length.toString(),
            currentLevel: currentLevel.toString(),
            username: username || "player",
            fullname: fullname || "Player",
            avatar: avatar.toString(),
            isPassed: (isPassed || false).toString(),
          },
        });
      }, 100);
    } catch (error) {
      console.error("Error completing level:", error);
      router.push("/user/home");
    }
  }, [
    quizScore,
    correctAnswers,
    questions.length,
    currentLevel,
    username,
    fullname,
    avatar,
    isQuizActive,
    updateUserProgress,
    cleanupQuiz,
  ]);

  // Handle quit quiz
  const handleQuitQuiz = () => {
    Alert.alert(
      "Quit Quiz?",
      "Are you sure you want to quit? Your progress will be lost and you'll need to restart this level.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Quit",
          style: "destructive",
          onPress: () => {
            cleanupQuiz();
            resetQuizState();
            router.push("/user/home");
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (showExplanation && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      timerAnimation.stopAnimation();
    }
  }, [showExplanation]);

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
  }, [currentQuestionIndex]);

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
            className={`bg-custom-gray p-4 rounded-xl text-xl text-center border ${
              isAnswerWrong ? "border-red-500" : "border-gray-100"
            } ${isProcessing ? "opacity-50" : ""}`}
            value={userAnswer}
            onChangeText={handleInputChange}
            placeholder="Type Your Answer"
            keyboardType="numeric"
            autoFocus={true}
            editable={
              !showExplanation &&
              !isProcessing &&
              isQuizActive &&
              isScreenFocused
            }
          />
        </View>

        {isProcessing && (
          <Text className="text-primary text-center pb-2">Processing...</Text>
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
            onPress={handleLevelCompletion}
            disabled={isProcessing}
          >
            <Text className="text-white font-bold">
              {isLastQuestion ? "Finish Quiz" : "Continue"}
            </Text>
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
                {/* FIXED: Display correct score */}
                <Text className="text-white text-sm font-black">
                  {quizScore} pts
                </Text>
                <Text className="text-white text-lg ml-1">🔥</Text>
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
    </>
  );
}
