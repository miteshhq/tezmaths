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
import SoundManager from "../../components/soundManager";
import { auth, database } from "../../firebase/firebaseConfig";

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

  const [accumulatedScore, setAccumulatedScore] = useState(0);
  const [startingLevel, setStartingLevel] = useState(currentLevel);

  const [isUserTyping, setIsUserTyping] = useState(false);
  const [lastInputTime, setLastInputTime] = useState(0);

  const [gameStartTime, setGameStartTime] = useState<number>(0);
  const [totalGameTimeMs, setTotalGameTimeMs] = useState<number>(0);

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
      // console.error("Error clearing level cache:", error);
    }
  }, [currentLevel]);

  const resetQuizState = useCallback(() => {
    if (!isMountedRef.current) return;

    // Stop all timers first
    cleanupQuiz();

    setCurrentQuestionIndex(0);
    setUserAnswer("");
    setQuizScore(0); // This is correct
    setCorrectAnswers(0);
    setShowExplanation(false);
    setIsAnswerWrong(false);
    setIsTimeOut(false);
    setTimeLeft(QUIZ_TIME_LIMIT);
    setIsProcessing(false);
    setIsQuizActive(true);
    setLoading(true);
    setNetworkError(false);

    // ADD THIS LINE - Reset accumulated score when restarting same level
    if (params.isSelectedLevel === "true") {
      setAccumulatedScore(0);
    }

    // Reset animation values
    questionTransition.setValue(1);
    timerAnimation.setValue(1);
  }, [cleanupQuiz, questionTransition, timerAnimation, params.isSelectedLevel]);

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

      // Start game timer only if this is a fresh start (not continuing from previous level)
      if (params.isSelectedLevel === "true" || !params.accumulatedScore) {
        const startTime = Date.now();
        setGameStartTime(startTime);
        // console.log(
        //   `Game timer started at: ${new Date(startTime).toLocaleTimeString()}`
        // );
      } else {
        // Continuing from previous level - keep existing start time
        // The start time should be passed in params, or keep the existing one
        // console.log(`Continuing game - keeping existing start time`);
      }

      // Clear any existing questions first
      setQuestions([]);
      setLoading(true);

      // ADD THIS - Clear cache when manually selecting a level
      if (params.isSelectedLevel === "true") {
        clearLevelCache();
      }

      // Reset animation values when screen focuses
      questionTransition.setValue(1);
      timerAnimation.setValue(1);

      resetQuizState();
      loadQuestions();

      return () => {
        setIsScreenFocused(false);
        cleanupQuiz();
        AsyncStorage.removeItem(`quiz-level-${currentLevel}`);
      };
    }, [
      currentLevel,
      level,
      questionTransition,
      timerAnimation,
      params.isSelectedLevel,
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
      // console.error("Error loading user data:", error);
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
        if (quiz.level === currentLevel && quiz.maxDisplayQuestions) {
          maxDisplayQuestions = Math.max(
            1,
            Number.parseInt(quiz.maxDisplayQuestions)
          );
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
      const getRandomQuestions = (questions: Question[], count: number) => {
        const shuffled = [...questions];

        // Use Fisher-Yates shuffle algorithm for better randomization
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return shuffled.slice(0, count);
      };

      // Apply the function:
      const selectedQuestions = getRandomQuestions(levelQuizzes, questionCount);

      setQuestions(selectedQuestions);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(selectedQuestions));
    } catch (error) {
      // console.error("Error loading questions:", error);
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

  const handleInputChange = (text: string) => {
    if (!isQuizActive || showExplanation || !isScreenFocused || isProcessing)
      return;

    // Track user typing activity
    setIsUserTyping(true);
    setLastInputTime(Date.now());
    setUserAnswer(text);

    // Clear typing state after 1 second of no input
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);

    if (text.trim() !== "") {
      submitTimeoutRef.current = setTimeout(() => {
        setIsUserTyping(false);
        validateAnswer(text);
      }, AUTO_SUBMIT_DELAY);
    } else {
      // Clear typing state immediately if input is empty
      setTimeout(() => setIsUserTyping(false), 1000);
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
    }
  };

  const updateScoreInDatabase = useCallback(async (levelScore: number) => {
    const userId = auth.currentUser?.uid;
    if (!userId || levelScore <= 0) {
      //   console.log("Skipping DB update - No user or zero score:", {
      //     userId,
      //     levelScore,
      //   });
      return;
    }

    try {
      //   console.log(`Updating score in DB: +${levelScore} points`);

      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val() || {};

      const currentTotalPoints = userData.totalPoints || 0;
      const newTotalPoints = currentTotalPoints + levelScore;

      // FIXED: Proper streak logic
      const today = new Date().toISOString().split("T")[0];
      const lastDate = userData.lastCompletionDate;
      const currentStreak = userData.streak || 0;

      let newStreak;
      if (!lastDate) {
        newStreak = 1;
      } else {
        const lastDateObj = new Date(lastDate);
        const todayDateObj = new Date(today);
        const diffInHours = (todayDateObj - lastDateObj) / (1000 * 60 * 60);
        if (diffInHours > 30) {
          newStreak = 0;
        } else {
          newStreak = currentStreak + 1;
        }
      }

      const updates = {
        totalPoints: newTotalPoints,
        streak: newStreak,
        lastCompletionDate: today,
      };

      await update(userRef, updates);
      //   console.log(
      //     `Score updated: ${currentTotalPoints} -> ${newTotalPoints}, Streak: ${currentStreak} -> ${newStreak}`
      //   );

      // Update local storage
      await AsyncStorage.setItem("totalPoints", newTotalPoints.toString());
      await AsyncStorage.setItem("streak", newStreak.toString());

      // Update accumulated score for this game session
      setAccumulatedScore((prev) => {
        const newAccumulated = prev + levelScore;
        // console.log(`Accumulated score updated: ${prev} -> ${newAccumulated}`);
        return newAccumulated;
      });
    } catch (error) {
      //   console.error("Error updating score in database:", error);
    }
  }, []);

  const handleSubmitAnswer = useCallback(
    async (isCorrect: boolean) => {
      if (isProcessing || !isQuizActive || !isScreenFocused) return;

      const currentQ = questions[currentQuestionIndex];
      if (!currentQ) return;

      setIsProcessing(true);
      stopTimer();

      const pointsPerQuestion = currentLevel;

      if (isCorrect) {
        await SoundManager.playSound("rightAnswerSoundEffect");
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );

        // Calculate new scores using CURRENT values, not state
        const newQuizScore = quizScore + pointsPerQuestion;
        const newCorrectAnswers = correctAnswers + 1;

        // console.log(
        //   `Correct answer! Points earned: ${pointsPerQuestion}, New quiz score: ${newQuizScore}, Total accumulated will be: ${
        //     accumulatedScore + newQuizScore
        //   }`
        // );

        // Update state
        setQuizScore(newQuizScore);
        setCorrectAnswers(newCorrectAnswers);

        // Check if this is the last question of current level
        if (currentQuestionIndex >= questions.length - 1) {
          //   console.log(
          //     `Last question completed. Total correct: ${newCorrectAnswers}/${questions.length}`
          //   );

          if (newCorrectAnswers === questions.length) {
            // console.log("All questions correct - continuing to next level");
            await updateScoreAndContinue(newQuizScore, newCorrectAnswers);
          } else {
            // console.log(
            //   "Not all questions correct - ending game, no level unlock"
            // );
            await updateScoreInDatabase(newQuizScore);
            handleGameEnd(
              accumulatedScore + newQuizScore,
              newCorrectAnswers,
              false
            );
          }
        } else {
          // Not last question - continue to next question
          setIsAnswerWrong(false);
          setIsProcessing(false);

          Animated.timing(questionTransition, {
            toValue: 0,
            duration: 100,
            useNativeDriver: true,
          }).start(() => {
            moveToNextQuestion();
            questionTransition.setValue(1);
          });
        }
      } else {
        // WRONG ANSWER - Update current score in DB and end game
        // console.log(
        //   `Wrong answer! Current quiz score: ${quizScore}, Session total: ${
        //     accumulatedScore + quizScore
        //   }`
        // );

        if (quizScore > 0) {
          await updateScoreInDatabase(quizScore);
        }

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        await SoundManager.playSound("wrongAnswerSoundEffect");

        setIsAnswerWrong(true);
        setShowExplanation(true);
        setIsProcessing(false);

        explanationTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && isScreenFocused) {
            // FIXED: Pass total accumulated score
            const finalScore = accumulatedScore + quizScore;
            // console.log(
            //   `Wrong answer - Final total accumulated score: ${finalScore}`
            // );
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
      accumulatedScore, // Important dependency
      isProcessing,
    ]
  );

  const updateScoreAndContinue = useCallback(
    async (levelScore: number, levelCorrectAnswers: number) => {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      try {
        console.log(
          `Updating score and continuing. Level score: ${levelScore}`
        );

        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val() || {};

        const currentTotalPoints = userData.totalPoints || 0;
        const newTotalPoints = currentTotalPoints + levelScore;

        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istDate = new Date(now.getTime() + istOffset);
        const today = istDate.toISOString().split("T")[0]; // YYYY-MM-DD

        let newStreak = userData.streak || 0;
        const lastDate = userData.lastCompletionDate;

        if (!lastDate) {
          newStreak = 1; // First play
        } else {
          const lastDateObj = new Date(lastDate);
          const todayDateObj = new Date(today);
          const diffInDays = Math.floor(
            (todayDateObj - lastDateObj) / (1000 * 60 * 60 * 24)
          );

          if (diffInDays === 0) {
            newStreak = userData.streak; // Same day, no change
          } else if (diffInDays === 1) {
            newStreak = (userData.streak || 0) + 1; // Next day, increment
          } else {
            newStreak = 1; // Missed day, reset to 1
          }
        }

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
          streak: newStreak,
          lastCompletionDate: today,
          [`completedLevels/${currentLevel}`]: true,
        };

        if (
          levelCorrectAnswers === questions.length &&
          currentLevel >= (userData.currentLevel || 1) &&
          nextLevelExists
        ) {
          updates.currentLevel = nextLevel;
          console.log(
            `Unlocking next level ${nextLevel} - all questions correct`
          );
        } else {
          console.log(
            `Not unlocking next level - correctAnswers: ${levelCorrectAnswers}/${questions.length}`
          );
        }

        await update(userRef, updates);
        console.log(
          `Database updated: Total points ${currentTotalPoints} -> ${newTotalPoints}`
        );

        await AsyncStorage.setItem("totalPoints", newTotalPoints.toString());
        await AsyncStorage.setItem("streak", newStreak.toString());
        if (updates.currentLevel) {
          await AsyncStorage.setItem(
            "currentLevel",
            updates.currentLevel.toString()
          );
        }

        const newAccumulatedScore = accumulatedScore + levelScore;
        setAccumulatedScore(newAccumulatedScore);
        console.log(
          `Accumulated score updated: ${accumulatedScore} -> ${newAccumulatedScore}`
        );

        if (nextLevelExists) {
          console.log(
            `Moving to level ${nextLevel} with accumulated score: ${newAccumulatedScore}`
          );
          setQuizScore(0);
          setCorrectAnswers(0);
          router.replace({
            pathname: "/user/quiz-screen",
            params: {
              level: nextLevel.toString(),
              isSelectedLevel: "false",
              accumulatedScore: newAccumulatedScore.toString(),
              gameStartTime: gameStartTime.toString(),
            },
          });
        } else {
          console.log("Game complete - no more levels");
          handleGameEnd(newAccumulatedScore, levelCorrectAnswers, true);
        }
      } catch (error) {
        console.error("Error updating score and continuing:", error);
        const newAccumulatedScore = accumulatedScore + levelScore;
        handleGameEnd(newAccumulatedScore, levelCorrectAnswers, false);
      }
    },
    [accumulatedScore, currentLevel]
  );

  const handleTimeUp = useCallback(async () => {
    if (!isQuizActive || isProcessing || !isScreenFocused || showExplanation)
      return;

    setIsProcessing(true);
    stopTimer();

    // Update score in database on timeout
    if (quizScore > 0) {
      await updateScoreInDatabase(quizScore);
    }

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
  ]);

  const moveToNextQuestion = useCallback(() => {
    if (!isMountedRef.current) return;

    // Don't change question if user is actively typing
    if (isUserTyping && Date.now() - lastInputTime < 2000) {
      //   console.log("Prevented question change - user is typing");
      return;
    }

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setUserAnswer("");
      setTimeLeft(QUIZ_TIME_LIMIT);
      setIsProcessing(false);
      setIsUserTyping(false); // Reset typing state
    }
  }, [currentQuestionIndex, questions.length, isUserTyping, lastInputTime]);

  const handleGameEnd = useCallback(
    async (
      finalScore?: number,
      finalCorrectAnswers?: number,
      isGameComplete = false
    ) => {
      if (!isQuizActive) return;

      // Calculate total game time
      const gameEndTime = Date.now();
      const totalTimeMs = gameEndTime - gameStartTime;
      setTotalGameTimeMs(totalTimeMs);

      // Convert to readable format for logging
      const totalTimeSeconds = Math.floor(totalTimeMs / 1000);
      const minutes = Math.floor(totalTimeSeconds / 60);
      const seconds = totalTimeSeconds % 60;

      //   console.log(
      //     `Game ended. Total time: ${minutes}m ${seconds}s (${totalTimeMs}ms)`
      //   );

      setIsQuizActive(false);
      cleanupQuiz();

      // FIXED: Properly calculate total accumulated score as a number
      let totalAccumulatedScore: number;

      if (typeof finalScore === "number") {
        totalAccumulatedScore = finalScore;
      } else {
        // For current session, only use quiz score if accumulated is 0 (new game)
        // Otherwise use the accumulated score which already includes current quiz points
        totalAccumulatedScore =
          accumulatedScore === 0 ? quizScore : accumulatedScore;
      }

      const gameCorrectAnswers = finalCorrectAnswers ?? correctAnswers;

      //   console.log("Game End - Final Stats:", {
      //     totalAccumulatedScore,
      //     gameCorrectAnswers,
      //     isGameComplete,
      //     accumulatedScore,
      //     currentQuizScore: quizScore,
      //     totalQuestions: questions.length,
      //   });

      try {
        const isPassed =
          isGameComplete &&
          (finalCorrectAnswers === questions.length ||
            gameCorrectAnswers === questions.length);

        // console.log("DEBUG PARAMS:", {
        //   totalAccumulatedScore,
        //   gameCorrectAnswers,
        //   questionsLength: questions.length,
        //   isPassed,
        //   isGameComplete,
        // });

        router.push({
          pathname: "/user/results",
          params: {
            quizScore: totalAccumulatedScore.toString(), // FIXED: Now guaranteed to be a number
            correctAnswers: gameCorrectAnswers.toString(),
            totalQuestions: questions.length.toString(),
            currentLevel: currentLevel.toString(),
            username: username || "player",
            fullname: fullname || "Player",
            avatar: avatar.toString(),
            isPassed: isPassed.toString(),
            isGameComplete: isGameComplete.toString(),
            totalGameTime: totalTimeMs.toString(),
          },
        });
      } catch (error) {
        // console.error("Error ending game:", error);
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
    ]
  );

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
            onSubmitEditing={handleManualSubmit} // Add this line
            placeholder="Type Your Answer"
            placeholderTextColor="#777"
            keyboardType="numeric"
            autoFocus={true}
            returnKeyType="done" // Add this line
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
                  {quizScore} pts
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
