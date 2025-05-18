// app/user/QuizScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Image,
  ScrollView,
  BackHandler,
  TouchableOpacity,
} from "react-native";
import { Player } from "@lottiefiles/react-lottie-player";
import { CountdownCircleTimer } from "react-native-countdown-circle-timer";
import { router, useLocalSearchParams } from "expo-router";
import { ref, get, update } from "firebase/database";
import { database, auth } from "../../firebase/firebaseConfig";

import * as Haptics from "expo-haptics";
import SoundManager from "./components/souund/soundManager";
import AsyncStorage from "@react-native-async-storage/async-storage";

const windowHeight = Dimensions.get("window").height;

interface Explanation {
  text?: string;
  image?: string;
}

interface Question {
  id: string;
  question: string;
  correctAnswer: string;
  explanation?: string;
  answerImage?: string;
  timeLimit?: number;
  points?: number;
}

interface CurrentQuestion {
  questionText: string;
  timeLimit: number;
  explanation: string;
  image?: string;
  correctAnswer: string;
  options?: [];
}

const getMaxLevel = async () => {
  try {
    const quizzesRef = ref(database, "quizzes");
    const snapshot = await get(quizzesRef);
    if (!snapshot.exists()) return 1;

    let maxLvl = 1;
    snapshot.forEach((childSnapshot) => {
      const quiz = childSnapshot.val();
      if (quiz.level > maxLvl) {
        maxLvl = quiz.level;
      }
    });
    return maxLvl;
  } catch (error) {
    console.error("Error getting max level:", error);
    return 1;
  }
};

export default function QuizScreen() {
  const params = useLocalSearchParams();
  const { level, isSelectedLevel } = params;

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState(""); // e.g., "correct", "incorrect", "levelStart"

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [qizScore, setQuizScore] = useState(0);
  const [isAnswerWrong, setIsAnswerWrong] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [currentLevel, setCurrentLevel] = useState(0);
  const [maxLevel, setMaxLevel] = useState<number>(0);
  const [currentExplanation, setCurrentExplanation] =
    useState<Explanation | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [nextQuestion, setNextQuestion] = useState(null);
  const [currentQuestion, setCurrentQuestion] =
    useState<CurrentQuestion | null>(null);
  const questionsCache = useRef<any>({});
  const [questionsLocked, setQuestionsLocked] = useState(false);
  const [isTimeOut, setIsTimeOut] = useState(false);

  const LEVEL_STORAGE_KEY = "highestLevelReached";
  const [highestLevelReached, setHighestLevelReached] = useState(1);

  useEffect(() => {
    const loadHighestLevel = async () => {
      try {
        const storedLevel = await AsyncStorage.getItem(LEVEL_STORAGE_KEY);
        if (storedLevel !== null) {
          setHighestLevelReached(Number(storedLevel));
          return;
        }
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        const userRef = ref(database, `users/${userId}`);
        const userSnapshot = await get(userRef);
        const userData = userSnapshot.val() || {};

        const userCurrentLevel = userData.currentLevel || 1;
        console.log("Fetched level from database:", userCurrentLevel);

        setHighestLevelReached(userCurrentLevel);
        await AsyncStorage.setItem(
          LEVEL_STORAGE_KEY,
          userCurrentLevel.toString()
        );
      } catch (error) {
        console.error("Error loading highest level:", error);
      }
    };

    loadHighestLevel();
  }, []);

  async function updateStreak() {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    try {
      const userRef = ref(database, `users/${userId}`);
      const currentDate = new Date();
      const currentDateString = currentDate.toISOString().split("T")[0];
      const snapshot = await get(userRef);
      const userData = snapshot.val() || {};
      const lastCompletionDate = userData.lastCompletionDate;
      const currentStreak = userData.streak || 0;

      if (lastCompletionDate) {
        const lastDate = new Date(lastCompletionDate + "T00:00:00");
        const nextDay = new Date(lastDate);
        nextDay.setDate(lastDate.getDate() + 1);
        const nextDayString = nextDay.toISOString().split("T")[0];

        if (currentDateString === lastCompletionDate) {
          return;
        } else if (currentDateString === nextDayString) {
          await update(userRef, {
            streak: currentStreak + 1,
            lastCompletionDate: currentDateString,
          });
        } else {
          await update(userRef, {
            streak: 1,
            lastCompletionDate: currentDateString,
          });
        }
      } else {
        await update(userRef, {
          streak: 1,
          lastCompletionDate: currentDateString,
        });
      }
    } catch (error) {
      console.error("Error updating streak:", error);
    }
  }

  const updateUserPoints = async (points: number) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val() || {};

      if (currentLevel > highestLevelReached) {
        await update(userRef, {
          totalPoints: (Number(userData.totalPoints) || 0) + points,
        });
      }
    } catch (error) {
      console.error("Error updating user points:", error);
    }
  };

  const saveLevelLocalScore = async (currentLevel: number, points: number) => {
    try {
      const key = `levelScore_${currentLevel}`;
      await AsyncStorage.setItem(key, points.toString());
      console.log(`Saved score for Level ${currentLevel}: ${points}`);
    } catch (error) {
      console.error("Error saving level score:", error);
    }
  };

  const clearAllLevelScores = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const levelKeys = keys.filter((key) => key.startsWith("levelScore_"));
      if (levelKeys.length > 0) {
        await AsyncStorage.multiRemove(levelKeys);
        console.log("All level scores removed successfully!");
      } else {
        console.log("No level scores found to remove.");
      }
    } catch (error) {
      console.error("Error clearing level scores:", error);
    }
  };

  const handleLevelChange = async (newLevel: number) => {
    if (newLevel < highestLevelReached && newLevel !== 1) {
      console.log(`User selected a lower level (${newLevel}), ignoring...`);
      return;
    }

    console.log(`Updating level to ${newLevel}`);
    setCurrentLevel(newLevel);

    if (newLevel > highestLevelReached) {
      setHighestLevelReached(newLevel);
      await AsyncStorage.setItem(LEVEL_STORAGE_KEY, newLevel.toString());
    }
  };

  useEffect(() => {
    if (level) {
      questionsCache.current = {};
      setCurrentLevel(Number(level));
      setQuestionsLocked(false);
      setQuestions([]);
      setCurrentQuestion(null);
    }
  }, [level]);

  const startTimer = useCallback(() => {
    if (!currentQuestion) return;

    clearInterval(timerRef.current as any);
    setIsPlaying(true);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current as any);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [currentQuestion]);

  useEffect(() => {
    if (loading || showExplanation || showFeedback) return;
    startTimer();
    return () => clearInterval(timerRef.current as any);
  }, [
    currentQuestionIndex,
    showExplanation,
    showFeedback,
    loading,
    startTimer,
  ]);

  useEffect(() => {
    const preloadQuestions = async () => {
      if (questionsLocked) return;

      try {
        const initialQuestions = await getRandomQuestions(currentLevel);
        if (initialQuestions.length > 0) {
          const questionsMap = {};
          initialQuestions.forEach((q: any, index: number) => {
            questionsMap[index] = q;
          });
          questionsCache.current = questionsMap;

          setQuestions(initialQuestions as any);
          setCurrentQuestion(initialQuestions[0]);
          setTimeLeft(initialQuestions[0]?.timeLimit || 30);
          setQuestionsLocked(true);
        }
      } catch (error) {
        console.error("Error loading questions:", error);
      }
    };

    preloadQuestions();
  }, [currentLevel, questionsLocked]);

  const preloadNextQuestion = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      const next = questionsCache.current[currentQuestionIndex + 1];
      setNextQuestion(next);
    }
  }, [currentQuestionIndex, questions.length]);

  useEffect(() => {
    if (!loading && questions.length > 0) {
      preloadNextQuestion();
    }
  }, [currentQuestionIndex, questions, loading, preloadNextQuestion]);

  const initializeQuiz = useCallback(async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      const userRef = ref(database, `users/${userId}`);
      const userSnapshot = await get(userRef);
      const userData = userSnapshot.val() || {};

      const userCurrentLevel = level
        ? Number(level)
        : userData.currentLevel || 1;
      setCurrentLevel(userCurrentLevel);

      const [maxLvl, initialQuestions] = await Promise.all([
        getMaxLevel(),
        getRandomQuestions(userCurrentLevel),
      ]);

      setMaxLevel(maxLvl);
      if (initialQuestions.length > 0) {
        setQuestions(initialQuestions as any);
        setCurrentQuestionIndex(0);
      } else {
        Alert.alert("No Questions", "No questions available for this level.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("Error initializing quiz:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleError = (error: string) => {
      console.error("Quiz Error:", error);
      setLoading(false);
      Alert.alert(
        "Error",
        "There was an error loading the quiz. Please try again.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    };

    initializeQuiz().catch(handleError);
  }, [initializeQuiz]);

  const getRandomQuestions = async (level: number) => {
    try {
      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);
      if (!snapshot.exists()) return [];

      const userId = auth.currentUser?.uid;
      const userRef = ref(database, `users/${userId}/completedLevels`);
      const userSnapshot = await get(userRef);
      const completedLevels = userSnapshot.val() || {};

      const levelQuizzes: any[] = [];
      snapshot.forEach((childSnapshot) => {
        const quiz = childSnapshot.val();
        if (quiz.level === level && !completedLevels[quiz.id]) {
          quiz.questions.forEach((q: any) => {
            levelQuizzes.push(q);
          });
        }
      });
      const shuffled = JSON.parse(JSON.stringify(levelQuizzes)).sort(
        () => 0.5 - Math.random()
      );
      return shuffled;
    } catch (error) {
      console.error("Error getting random questions:", error);
      return [];
    }
  };

  useEffect(() => {
    if (userAnswer.trim() === correctAnswer.trim()) {
      handleSubmitAnswer(correctAnswer);
    }
  }, [userAnswer, correctAnswer]);

  const handleInputChange = (text: string, correctAnswer: string) => {
    setUserAnswer(text);
    setCorrectAnswer(correctAnswer);
  };

  const handleCorrectAnswer = async () => {
    const currentQuestion = questionsCache.current[currentQuestionIndex];
    if (!currentQuestion) return;

    clearInterval(timerRef.current as any);
    setIsPlaying(false);
    setIsAnswerWrong(false);
    setCorrectAnswers((prev) => prev + 1);
    setQuizScore((prev) => prev + (currentQuestion.points || 10));

    setFeedbackMessage("Correct!");
    setFeedbackType("correct");
    setShowFeedback(true);

    setTimeout(async () => {
      setShowFeedback(false);
      if (currentQuestionIndex < questions.length - 1) {
        const nextIndex = currentQuestionIndex + 1;
        const nextQuestion = questionsCache.current[nextIndex];
        setCurrentQuestion(nextQuestion);
        setCurrentQuestionIndex(nextIndex);
        setTimeLeft(nextQuestion?.timeLimit || 30);
        setUserAnswer("");
        startTimer();
      } else {
        await handleLevelCompletion();
      }
    }, 3000);
  };

  const handleIncorrectAnswer = () => {
    setIsAnswerWrong(true);
    setIsPlaying(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setShowExplanation(true);
    setCurrentExplanation({
      text: questions[currentQuestionIndex]?.explanation,
      image: questions[currentQuestionIndex]?.answerImage,
    });

    setTimeout(() => {
      setShowExplanation(false);
      setCurrentExplanation(null);
      setIsAnswerWrong(false);
      if (currentQuestionIndex < questions.length - 1) {
        const nextIndex = currentQuestionIndex + 1;
        const nextQuestion = questionsCache.current[nextIndex];
        setCurrentQuestion(nextQuestion);
        setCurrentQuestionIndex(nextIndex);
        setTimeLeft(nextQuestion?.timeLimit || 30);
        setUserAnswer("");
        startTimer();
      } else {
        handleLevelCompletion();
      }
    }, 5000);
  };

  const handleSubmitAnswer = async (correctAnswer: string) => {
    if (!userAnswer) return;

    if (userAnswer.trim() === correctAnswer.trim()) {
      await SoundManager.playSound("rightAnswerSoundEffect", {
        isLooping: false,
      });
      await handleCorrectAnswer();
    } else {
      await SoundManager.playSound("wrongAnswerSoundEffect", {
        isLooping: false,
      });
      handleIncorrectAnswer();
    }
  };

  const markLevelAsCompleted = async (level: number) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const userRef = ref(database, `users/${userId}`);
      const nextLevel = level + 1 > maxLevel ? maxLevel : level + 1;

      if (
        !isSelectedLevel ||
        (isSelectedLevel && level >= highestLevelReached)
      ) {
        await update(userRef, {
          currentLevel: nextLevel,
          [`completedLevels/${level}`]: true,
        });
      }
    } catch (error) {
      console.error("Error marking level as completed:", error);
    }
  };

  const handleLevelCompletion = async () => {
    await markLevelAsCompleted(currentLevel);
    if (qizScore > 0) {
      await saveLevelLocalScore(currentLevel, qizScore);
      await updateUserPoints(qizScore);
    }
    await updateStreak();

    if (currentLevel < maxLevel) {
      const nextLevel = currentLevel + 1;
      const nextQuestions = await getRandomQuestions(nextLevel);

      if (nextQuestions.length > 0) {
        questionsCache.current = {};
        setQuestions(nextQuestions as any);
        setCurrentQuestionIndex(0);
        setCurrentQuestion(nextQuestions[0]);
        setTimeLeft(nextQuestions[0]?.timeLimit || 30);
        setUserAnswer("");
        setCurrentLevel(nextLevel);
        setQuizScore(0);
        setCorrectAnswers(0);
        setQuestionsLocked(false);

        setFeedbackMessage(`Moving to Level ${nextLevel}`);
        setFeedbackType("levelStart");
        setShowFeedback(true);
        setTimeout(() => {
          setShowFeedback(false);
          startTimer();
        }, 3000);
      } else {
        router.push({
          pathname: "/user/results",
          params: {
            highestLevelReached,
            quizScore: qizScore,
            correctAnswers,
            totalQuestions: questions.length,
            currentLevel,
            isLevelComplete: true,
            maxLevel,
            isSelectedLevel,
            level,
          },
        });
      }
    } else {
      router.push({
        pathname: "/user/results",
        params: {
          highestLevelReached,
          quizScore: qizScore,
          correctAnswers,
          totalQuestions: questions.length,
          currentLevel,
          isLevelComplete: true,
          maxLevel,
          isSelectedLevel,
          level,
        },
      });
    }
  };

  const handleTimeUp = async () => {
    await SoundManager.playSound("wrongAnswerSoundEffect", {
      isLooping: false,
    });
    setIsTimeOut(true); // Ascertain if the user loses by quitting (back button) or completes all levels, requiring manual navigation to results.

    setIsPlaying(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setShowExplanation(true);
    setCurrentExplanation({
      text: questions[currentQuestionIndex]?.explanation,
      image: questions[currentQuestionIndex]?.answerImage,
    });

    setTimeout(() => {
      setShowExplanation(false);
      setCurrentExplanation(null);
      setIsTimeOut(false);
      if (currentQuestionIndex < questions.length - 1) {
        const nextIndex = currentQuestionIndex + 1;
        const nextQuestion = questionsCache.current[nextIndex];
        setCurrentQuestion(nextQuestion);
        setCurrentQuestionIndex(nextIndex);
        setTimeLeft(nextQuestion?.timeLimit || 30);
        setUserAnswer("");
        startTimer();
      } else {
        handleLevelCompletion();
      }
    }, 5000);
  };

  const resumeTimer = useCallback(() => {
    if (!currentQuestion || timeLeft <= 0 || isAnswerWrong || isTimeOut) return;

    clearInterval(timerRef.current as any);
    setIsPlaying(true);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current as any);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [currentQuestion, timeLeft, isAnswerWrong, isTimeOut]);

  useEffect(() => {
    const backAction = async () => {
      await SoundManager.stopSound("clappingSoundEffect");
      await SoundManager.stopSound("victorySoundEffect");
      await SoundManager.stopSound("failSoundEffect");
      if (timerRef.current) {
        clearInterval(timerRef.current);
        setIsPlaying(false);
      }

      Alert.alert(
        "Are you sure you want to quit the quiz?",
        "",
        [
          {
            text: "Resume Quiz",
            style: "cancel",
            onPress: () => resumeTimer(),
          },
          {
            text: "Quit anyway!",
            onPress: async () => {
              await clearAllLevelScores();
              if (qizScore > 0) {
                await saveLevelLocalScore(currentLevel, qizScore);
                await markLevelAsCompleted(currentLevel);
              }
              router.push({
                pathname: "/dashboard",
                params: { openLevelPopup: true },
              });
            },
          },
        ],
        { cancelable: true }
      );

      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction as any
    );
    return () => backHandler.remove();
  }, [resumeTimer, qizScore, currentLevel]);

  const renderExplanation = () => {
    return (
      <View style={styles.explanationCard}>
        <Text style={styles.explanationText}>
          {currentExplanation?.text || "No explanation available"}
        </Text>
        {currentExplanation?.image && (
          <Image
            source={{ uri: currentExplanation.image }}
            style={styles.explanationImage}
            resizeMode="contain"
          />
        )}
      </View>
    );
  };

  const congratulationPage = () => {
    return (
      <View
        style={{
          padding: 25,
          borderRadius: 15,
          alignItems: "center",
          display: "flex",
          justifyContent: "center",
          height: "20%",
        }}
      >
        <Text
          style={{
            textAlign: "center",
            fontSize: 18,
            color: "#333",
            fontFamily: "Poppins-Regular",
          }}
        >
          🎉 Congratulations! You just completed Level {currentLevel}!
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading questions...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <TouchableOpacity
        style={styles.testButton}
        onPress={() => {
          markLevelAsCompleted(currentLevel);
          handleLevelChange(currentLevel + 1);
          setQuizScore(9999);
          setCorrectAnswers(questions.length);
        }}
      >
        <Text style={styles.testText}>TEST SKIP</Text>
      </TouchableOpacity>
      <View style={styles.contentContainer}>
        {showFeedback && (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackText}>{feedbackMessage}</Text>
          </View>
        )}
        {!showFeedback && (
          <>
            <View style={styles.header}>
              <View style={{ display: "flex", flexDirection: "column" }}>
                <Text style={styles.questionCounter}>
                  Level: {currentLevel}
                </Text>
                <Text style={styles.questionCounter}>
                  Question {currentQuestionIndex + 1} / {questions.length}
                </Text>
              </View>
              <View
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 20,
                }}
              >
                <CountdownCircleTimer
                  key={timeLeft}
                  isPlaying={isPlaying}
                  duration={timeLeft}
                  size={80}
                  colors={["#004777", "#F7B801", "#A30000", "#FF0000"]}
                  colorsTime={[15, 10, 5, 0]}
                  onComplete={() => ({ shouldRepeat: false })}
                >
                  {({ remainingTime }) => (
                    <Text style={styles.timer}>{remainingTime}s</Text>
                  )}
                </CountdownCircleTimer>
              </View>
            </View>

            <View style={styles.questionCard}>
              {currentQuestion?.questionText && (
                <Text style={styles.questionText}>
                  {currentQuestion.questionText ||
                    questionsCache.current[currentQuestionIndex]?.questionText}
                </Text>
              )}
              {currentQuestion?.options && (
                <ScrollView
                  style={{ maxHeight: 150 }}
                  showsVerticalScrollIndicator={true}
                >
                  {currentQuestion.options.map((option: any, index: number) => (
                    <View
                      key={index}
                      style={{ display: "flex", flexDirection: "row", gap: 20 }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          color: "#333",
                          borderRadius: 100,
                          height: 20,
                          width: 20,
                          borderWidth: 10,
                          fontFamily: "Poppins-Bold",
                          textAlign: "center",
                          marginBottom: 5,
                        }}
                      ></Text>
                      <Text
                        style={{
                          fontSize: 16,
                          color: "#333",
                          fontFamily: "Poppins-Bold",
                          textAlign: "center",
                          marginBottom: 10,
                        }}
                      >
                        {option}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              {!showExplanation && (
                <>
                  <TextInput
                    style={[
                      styles.answerInput,
                      isAnswerWrong && styles.wrongAnswer,
                    ]}
                    value={userAnswer}
                    onChangeText={(text) =>
                      handleInputChange(
                        text,
                        questionsCache.current[
                          currentQuestionIndex
                        ]?.correctAnswer.trim()
                      )
                    }
                    onSubmitEditing={() =>
                      handleSubmitAnswer(
                        questionsCache.current[
                          currentQuestionIndex
                        ]?.correctAnswer.trim()
                      )
                    }
                    placeholder={
                      userAnswer ? userAnswer : "Type your answer..."
                    }
                    keyboardType="numeric"
                    autoFocus={true}
                    maxLength={10}
                    editable={!showExplanation}
                    returnKeyType="done"
                  />
                  {userAnswer &&
                    questionsCache.current[
                      currentQuestionIndex
                    ]?.correctAnswer.trim() === userAnswer && (
                      <Image
                        source={require("../../assets/images/markCorrect.png")}
                        style={{ width: 20, height: 20 }}
                      />
                    )}
                </>
              )}

              {isAnswerWrong && (
                <Text style={styles.errorText}>Incorrect. Try again!</Text>
              )}
              {isTimeOut && (
                <Text style={styles.errorText}>Time Out! 😞 😔</Text>
              )}
            </View>

            {showExplanation && renderExplanation()}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF2CC",
  },
  contentContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  questionCounter: {
    fontSize: 24,
    color: "#333",
    fontFamily: "Poppins-Bold",
  },
  timer: {
    fontSize: 24,
    color: "#333",
    fontFamily: "Poppins-Bold",
  },
  questionCard: {
    backgroundColor: "#FFF",
    padding: 25,
    borderRadius: 15,
    alignItems: "center",
    marginVertical: windowHeight * 0.1,
  },
  questionText: {
    fontSize: 26,
    color: "#333",
    fontFamily: "Poppins-Bold",
    textAlign: "center",
    marginBottom: 30,
  },
  answerInput: {
    backgroundColor: "#F5F5F5",
    padding: 15,
    borderRadius: 10,
    fontSize: 24,
    width: "100%",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#DDD",
  },
  wrongAnswer: {
    borderColor: "#FF5A5F",
    backgroundColor: "#FFF0F0",
  },
  errorText: {
    color: "#FF5A5F",
    marginTop: 15,
    fontSize: 18,
    fontFamily: "Poppins-Regular",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF2CC",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 18,
    color: "#333",
    fontFamily: "Poppins-Regular",
  },
  explanationCard: {
    backgroundColor: "#FFF",
    padding: 25,
    borderRadius: 15,
    alignItems: "center",
    marginVertical: windowHeight * 0.1,
  },
  explanationText: {
    fontSize: 26,
    color: "#333",
    fontFamily: "Poppins-Bold",
    textAlign: "center",
    marginBottom: 30,
  },
  explanationImage: {
    width: "100%",
    height: 200,
    marginBottom: 30,
  },
  feedbackCard: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
    marginVertical: windowHeight * 0.2,
  },
  feedbackText: {
    fontSize: 24,
    color: "#333",
    fontFamily: "Poppins-Bold",
    textAlign: "center",
  },
  testButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "red",
    padding: 10,
    borderRadius: 10,
  },
  testText: {
    color: "white",
    fontWeight: "bold",
  },
});
