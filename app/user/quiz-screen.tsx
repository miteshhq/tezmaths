// app/user/quiz-screen.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  BackHandler,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ref, get, update } from "firebase/database";
import { database, auth } from "../../firebase/firebaseConfig";
import { CountdownCircleTimer } from "react-native-countdown-circle-timer";
import * as Haptics from "expo-haptics";
import SoundManager from "../../components/soundManager";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Configuration
const QUIZ_TIME_LIMIT = 15;
const AUTO_SUBMIT_DELAY = 1000; // 1 second delay for auto-submit

interface Question {
  id: string;
  questionText: string;
  correctAnswer: string;
  explanation?: string;
  point: number;
  timeLimit: number;
}

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
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load user data
  const loadUserData = useCallback(async () => {
    try {
      const cachedData = await AsyncStorage.getItem("userData");
      if (cachedData) {
        const data = JSON.parse(cachedData);
        setUsername(data.fullName || data.username || "Player");
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }, []);

  // Load questions from Firebase
  const loadQuestions = useCallback(async () => {
    try {
      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);

      if (!snapshot.exists()) {
        throw new Error("No quizzes found");
      }

      const levelQuizzes: Question[] = [];
      snapshot.forEach((childSnapshot) => {
        const quiz = childSnapshot.val();
        if (quiz.level === currentLevel && quiz.questions) {
          quiz.questions.forEach((q: any) => {
            levelQuizzes.push({
              id: q.id || Math.random().toString(),
              questionText: q.questionText,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation || "",
              point: q.point || 100,
              timeLimit: QUIZ_TIME_LIMIT,
            });
          });
        }
      });

      if (levelQuizzes.length === 0) {
        Alert.alert("No Questions", "No questions available for this level");
        router.back();
        return;
      }

      // Shuffle questions
      setQuestions(levelQuizzes.sort(() => Math.random() - 0.5));
    } catch (error) {
      console.error("Error loading questions:", error);
      Alert.alert("Error", "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [currentLevel]);

  useEffect(() => {
    loadUserData();
    loadQuestions();
  }, [loadQuestions]);

  // Start timer for current question
  const startTimer = useCallback(() => {
    // Clear existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [currentQuestionIndex]);

  const [timeLeft, setTimeLeft] = useState(QUIZ_TIME_LIMIT);

  useEffect(() => {
    if (!loading && questions.length > 0) {
      setTimeLeft(QUIZ_TIME_LIMIT);
      startTimer();
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, [currentQuestionIndex, loading, questions, startTimer]);

  // Handle answer input with auto-submit delay
  const handleInputChange = (text: string) => {
    setUserAnswer(text);

    // Clear any existing timeout
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }

    // Set new timeout for auto-submission
    if (text.trim() !== "") {
      submitTimeoutRef.current = setTimeout(() => {
        validateAnswer(text);
      }, AUTO_SUBMIT_DELAY);
    }
  };

  // Validate answer (called after delay or when answer matches)
  const validateAnswer = (answer: string) => {
    if (!questions[currentQuestionIndex]) return;

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
      const currentQ = questions[currentQuestionIndex];
      if (!currentQ) return;

      // Clear timer and submit timeout
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }

      if (isCorrect) {
        // Correct answer handling
        await SoundManager.playSound("rightAnswerSoundEffect");
        setQuizScore((prev) => prev + currentQ.point);
        setCorrectAnswers((prev) => prev + 1);
        setIsAnswerWrong(false);

        // Move to next question after delay
        setTimeout(() => {
          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex((prev) => prev + 1);
            setUserAnswer("");
          } else {
            handleLevelCompletion();
          }
        }, 500);
      } else {
        // Incorrect answer handling
        await SoundManager.playSound("wrongAnswerSoundEffect");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setIsAnswerWrong(true);
        setShowExplanation(true);

        // Move to next question after explanation
        setTimeout(() => {
          setShowExplanation(false);
          setIsAnswerWrong(false);

          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex((prev) => prev + 1);
            setUserAnswer("");
          } else {
            handleLevelCompletion();
          }
        }, 3000);
      }
    },
    [currentQuestionIndex, questions]
  );

  // Handle timeout
  const handleTimeUp = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    await SoundManager.playSound("timeOutSound");
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setIsTimeOut(true);
    setShowExplanation(true);

    // Move to next question after explanation
    setTimeout(() => {
      setShowExplanation(false);
      setIsTimeOut(false);

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setUserAnswer("");
      } else {
        handleLevelCompletion();
      }
    }, 3000);
  }, [currentQuestionIndex, questions]);

  // Update user progress
  const updateUserProgress = useCallback(async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val() || {};

      // Update points and level
      const newPoints = (userData.totalPoints || 0) + quizScore;
      const newLevel = Math.min(
        currentLevel + 1,
        userData.maxLevel || currentLevel + 1
      );

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
        currentLevel: newLevel,
        streak: newStreak,
        lastCompletionDate: today,
        [`completedLevels/${currentLevel}`]: true,
      });

      // Save to AsyncStorage
      await AsyncStorage.setItem("currentLevel", newLevel.toString());
      await AsyncStorage.setItem("totalPoints", newPoints.toString());
      await AsyncStorage.setItem("streak", newStreak.toString());
    } catch (error) {
      console.error("Error updating user progress:", error);
    }
  }, [quizScore, currentLevel]);

  // Check consecutive days
  const isConsecutiveDay = (lastDate: string, today: string) => {
    const last = new Date(lastDate);
    const current = new Date(today);
    const diff = (current.getTime() - last.getTime()) / (1000 * 3600 * 24);
    return diff === 1;
  };

  // Handle level completion
  const handleLevelCompletion = useCallback(async () => {
    await updateUserProgress();

    router.push({
      pathname: "/user/results",
      params: {
        quizScore: quizScore.toString(),
        correctAnswers: correctAnswers.toString(),
        totalQuestions: questions.length.toString(),
        currentLevel: currentLevel.toString(),
        username: username || "Player",
      },
    });
  }, [quizScore, correctAnswers, questions, currentLevel, updateUserProgress]);

  // Handle back button
  useEffect(() => {
    const backAction = () => {
      Alert.alert(
        "Quit Quiz?",
        "Are you sure you want to quit? Your progress will be lost.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Quit",
            onPress: () => {
              SoundManager.stopAllSounds();
              router.push("/user/home");
            },
          },
        ]
      );
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, []);

  // Render current question
  const renderQuestion = () => {
    if (loading || !questions[currentQuestionIndex]) {
      return <Text className="text-white text-xl">Loading question...</Text>;
    }

    const question = questions[currentQuestionIndex];

    return (
      <View className="bg-white p-6 rounded-2xl shadow-lg">
        <Text className="text-xl font-bold text-purple-700 text-center mb-6">
          {question.questionText}
        </Text>

        <TextInput
          className={`bg-gray-100 p-4 rounded-xl text-xl text-center border-2 ${
            isAnswerWrong ? "border-red-500" : "border-gray-200"
          }`}
          value={userAnswer}
          onChangeText={handleInputChange}
          placeholder="Type your answer..."
          keyboardType="numeric"
          autoFocus
          editable={!showExplanation}
        />

        {isAnswerWrong && (
          <Text className="text-red-500 text-lg mt-2 text-center">
            Incorrect. Try again!
          </Text>
        )}

        {isTimeOut && (
          <Text className="text-red-500 text-lg mt-2 text-center">
            Time Out!
          </Text>
        )}
      </View>
    );
  };

  // Render explanation
  const renderExplanation = () => {
    if (!showExplanation || !questions[currentQuestionIndex]) return null;

    const question = questions[currentQuestionIndex];

    return (
      <View className="absolute inset-0 bg-black bg-opacity-70 justify-center items-center p-4">
        <View className="bg-white p-6 rounded-2xl w-full max-w-sm">
          <Text className="text-xl font-bold text-purple-700 mb-4">
            Explanation
          </Text>
          <Text className="text-gray-700 mb-4">
            {question.explanation || "No explanation available"}
          </Text>
          <Text className="text-lg font-bold text-green-600">
            Correct Answer: {question.correctAnswer}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-primary p-4"
    >
      {/* Header */}
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-white text-xl font-bold">
            Level {currentLevel}
          </Text>
          <Text className="text-gray-300">
            Question {currentQuestionIndex + 1}/{questions.length}
          </Text>
        </View>

        <View className="items-center">
          <CountdownCircleTimer
            key={`timer-${currentQuestionIndex}`}
            isPlaying={!showExplanation}
            duration={QUIZ_TIME_LIMIT}
            colors={["#10B981", "#F59E0B", "#EF4444", "#B91C1C"]}
            colorsTime={[10, 7, 4, 0]}
            size={80}
            onComplete={handleTimeUp}
          >
            {({ remainingTime }) => (
              <Text className="text-white text-xl font-bold">
                {remainingTime}s
              </Text>
            )}
          </CountdownCircleTimer>
        </View>

        <View className="bg-orange-500 px-3 py-1 rounded-full">
          <Text className="text-white font-bold">{quizScore} pts</Text>
        </View>
      </View>

      {/* Question Area */}
      {renderQuestion()}

      {/* Explanation Modal */}
      {renderExplanation()}
    </KeyboardAvoidingView>
  );
}
