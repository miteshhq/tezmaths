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
  TouchableOpacity,
  BackHandler,
  ScrollView,
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
  const { level, isSelectedLevel, useLevel } = params;

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
  const [levelComplete, setLevelComplete] = useState(false);
  const [isLevelComplete, setIsLevelComplete] = useState(false);
  const [showLottie, setShowLottie] = useState(false);
  const [isTimeOut, setIsTimeOut] = useState(false);

  const LEVEL_STORAGE_KEY = "highestLevelReached"; // Key for AsyncStorage
  const [highestLevelReached, setHighestLevelReached] = useState(1);

  // 🔹 Load highest level from AsyncStorage when the app starts
  useEffect(() => {
    const loadHighestLevel = async () => {
      try {
        const storedLevel = await AsyncStorage.getItem(LEVEL_STORAGE_KEY);
        if (storedLevel !== null) {
          setHighestLevelReached(Number(storedLevel));
          return;
        }
        // 2️⃣ If AsyncStorage is empty, fetch from Firebase
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        const userRef = ref(database, `users/${userId}`);
        const userSnapshot = await get(userRef);
        const userData = userSnapshot.val() || {};

        const userCurrentLevel = userData.currentLevel || 1;

        console.log("Fetched level from database:", userCurrentLevel);

        setHighestLevelReached(userCurrentLevel);

        // 3️⃣ Save it to AsyncStorage for future use
        await AsyncStorage.setItem(
          LEVEL_STORAGE_KEY,
          userCurrentLevel.toString()
        );
      } catch (error) {
        console.error("Error loading highest level:", error);
      }
    };

    loadHighestLevel();
  }, [maxLevel, auth.currentUser?.uid, database]);

  const updateUserPoints = async (points: number) => {
    console.log("points i get is  ------>>>>> line 55", points);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val() || {};
      console.log("line -----------64>>>>>", typeof userData.totalPoints);

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
    questionsCache.current = {};
    try {
      const key = `levelScore_${currentLevel}`; // Unique key for each level's score
      await AsyncStorage.setItem(key, points.toString()); // Save score as string
      console.log(`Saved score for Level ${currentLevel}: ${points}`);
    } catch (error) {
      console.error("Error saving level score:", error);
    }
  };
  const clearAllLevelScores = async () => {
    questionsCache.current = {};
    try {
      const keys = await AsyncStorage.getAllKeys(); // Get all stored keys
      const levelKeys = keys.filter((key) => key.startsWith("levelScore_")); // Filter only level score keys

      if (levelKeys.length > 0) {
        await AsyncStorage.multiRemove(levelKeys); // Remove all level score keys
        console.log("All level scores removed successfully!");
      } else {
        console.log("No level scores found to remove.");
      }
    } catch (error) {
      console.error("Error clearing level scores:", error);
    }
  };
  const handleLevelChange = async (newLevel: number) => {
    questionsCache.current = {};
    // 🚫 Ignore update if user selects a lower level (unless it's level 1)
    if (newLevel < highestLevelReached && newLevel !== 1) {
      console.log(`User selected a lower level (${newLevel}), ignoring...`);
      return;
    }

    console.log(`Updating level to ${newLevel}`);
    setCurrentLevel(newLevel);

    // ✅ Update highest level reached if a new highest level is reached
    if (newLevel > highestLevelReached) {
      setHighestLevelReached(newLevel);
      await AsyncStorage.setItem(LEVEL_STORAGE_KEY, newLevel.toString());
    }
  };
  useEffect(() => {
    if (level) {
      questionsCache.current = {};
      console.log("i get a params from my parent and it is --->>", level);

      console.log(
        "i get a params from my parent and it is --->>",
        isSelectedLevel
      );

      setCurrentLevel(Number(level)); // Ensure it's a number if coming as a string=
      setQuestionsLocked(false); // Unlock so preloadQuestions can run
      // Unlock so new questions can load
      setQuestions([]); // Clear old questions
      setCurrentQuestion(null);
    }
  }, [level]);

  const startTimer = useCallback(() => {
    if (!currentQuestion) return;

    clearInterval(timerRef.current as any);
    setIsPlaying(true); // Start the timer

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
    if (loading || showExplanation) return;
    startTimer();
    return () => clearInterval(timerRef.current as any);
  }, [currentQuestionIndex, showExplanation, loading, startTimer]);

  useEffect(() => {
    const preloadQuestions = async () => {
      if (questionsLocked) return;

      try {
        const initialQuestions = await getRandomQuestions(currentLevel);
        if (initialQuestions.length > 0) {
          // Cache all questions at once
          const questionsMap = {} as any;
          initialQuestions.forEach((q: any, index: number) => {
            questionsMap[index] = q;
          });
          questionsCache.current = questionsMap;
          console.log("map question ------- line 169", questionsCache);

          setQuestions(initialQuestions as any);
          setCurrentQuestion(initialQuestions[0]);
          setTimeLeft(initialQuestions[0]?.timeLimit);
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
      console.log("next question is ->>>>>> 297", next);

      setNextQuestion(next);
      console.log("next---->>>>.300", next);
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

      // Set the current level from user data
      const userCurrentLevel = level
        ? Number(level)
        : userData.currentLevel || 1;
      console.log("my level 196", userCurrentLevel);

      setCurrentLevel(userCurrentLevel);

      const [maxLvl, initialQuestions] = await Promise.all([
        getMaxLevel(),
        getRandomQuestions(userCurrentLevel),
      ]);
      console.log(maxLvl, initialQuestions);

      setMaxLevel(maxLvl as any);
      if (initialQuestions.length > 0) {
        setQuestions(initialQuestions as any);
        setCurrentQuestionIndex(0);
      }
    } catch (error) {
      console.error("Error initializing quiz:", error);
    } finally {
      setTimeout(() => {
        setLoading(false);
      }, 100);
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
  }, []);

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
            console.log("quizzes lline 237->>>>>>", 237, q);
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
    // Check if the user answer matches the correct answer
    if (userAnswer.trim() === correctAnswer.trim()) {
      handleSubmitAnswer(correctAnswer);
    }
  }, [userAnswer, correctAnswer]); // Dependency on userAnswer and correctAnswer

  const handleInputChange = (text: string, correctAnswer: string) => {
    setUserAnswer(text);
    setCorrectAnswer(correctAnswer); // Update the correct answer
  };

  const handleCorrectAnswer = async () => {
    const currentQuestion = questionsCache.current[currentQuestionIndex];

    console.log("This is points------>>> 381", currentQuestion.point);

    if (!currentQuestion) return;

    clearInterval(timerRef.current as any);
    setIsPlaying(false);
    // Update states immediately
    setIsAnswerWrong(false);
    // setUserAnswer("");
    setCorrectAnswers((prev) => prev + 1);
    setQuizScore((prev) => prev + currentQuestion.point);

    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      const nextQuestion = questionsCache.current[nextIndex];

      // Update all states together after the delay
      setCurrentQuestion(nextQuestion);
      setCurrentQuestionIndex(nextIndex);

      setTimeLeft(nextQuestion?.timeLimit);
      console.log(
        "next limite timeout ---------> 315",
        nextQuestion?.timeLimit
      );

      setUserAnswer("");
      startTimer();
    } else {
      await markLevelAsCompleted(currentLevel);
      await handleLevelChange(currentLevel);
    }
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
  };

  const handleSubmitAnswer = async (correctAnswer: string) => {
    if (!userAnswer) return;

    // Validate the entered answer
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
      const completedLevelsRef = ref(
        database,
        `users/${userId}/completedLevels`
      );
      const maxLvl = maxLevel;

      // Determine next level
      let nextLevel = level + 1;

      if (nextLevel > maxLvl) {
        nextLevel = maxLvl; // Restart from level 1 if max level is reached
      }

      // Update both current level and completed levels
      if (!isSelectedLevel) {
        await update(userRef, {
          currentLevel: nextLevel,
          [`completedLevels/${level}`]: true,
        });
      } else if (isSelectedLevel && level > highestLevelReached) {
        await update(userRef, {
          currentLevel: nextLevel,
          [`completedLevels/${level}`]: true,
        });
        // Store the updated highest level in AsyncStorage
      }

      // Fetch and log the updated value
      const snapshot = await get(completedLevelsRef);
      if (snapshot.exists()) {
        const completedLevels = snapshot.val();
        const keys = Object.keys(completedLevels);
        console.log("length is now---->>> 485", keys.length);
        console.log("maxLevel ------ 483>>>", maxLevel, maxLvl);

        console.log("keys...", keys);
        // Get all level keys
        const lastKey = keys[keys.length - 1]; // Get the last key
        const lastValue = completedLevels[lastKey]; // Get the value at the last index
        console.log("usecase 487===>>", lastValue);

        setIsLevelComplete(lastValue);
        setLevelComplete(lastValue);
      } else {
        console.log("No completedLevels data found.");
      }
      console.log("levelComplete,le", levelComplete);
    } catch (error) {
      console.error("Error marking level as completed:", error);
    }
  };

  useEffect(() => {
    if (isLevelComplete) {
      const updatePointsAndNavigate = async () => {
        try {
          if (qizScore > 0) {
            await saveLevelLocalScore(currentLevel, qizScore);
          }
          await updateUserPoints(qizScore);

          console.log("✅ isLevelComplete updated:", isLevelComplete);

          router.push({
            pathname: "/user/results",
            params: {
              highestLevelReached: highestLevelReached,
              quizScore: qizScore,
              correctAnswers: correctAnswers,
              totalQuestions: questions.length,
              currentLevel: currentLevel,
              isLevelComplete: isLevelComplete as any,
              maxLevel: maxLevel,
              isSelectedLevel: isSelectedLevel,
              level: level,
            },
          });
        } catch (error) {
          console.error("Error updating user points:", error);
        }
      };

      updatePointsAndNavigate();
    }
  }, [isLevelComplete]);

  const handleLevelCompletion = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      setShowExplanation(false);
      setCurrentExplanation(null);
      setUserAnswer("");
      setQuestionsLocked(false);

      const maxLvl = maxLevel;
      let nextLevel = currentLevel + 1;

      if (nextLevel > maxLvl) {
        nextLevel = maxLvl;
        // Stay at max level instead of resetting
      }

      const nextLevelQuestions = await getRandomQuestions(nextLevel);

      if (nextLevelQuestions.length > 0) {
        setQuestions(nextLevelQuestions as any);
        setCurrentQuestionIndex(0);
        setCurrentLevel(nextLevel);
        console.log(
          "MY NEXTLEVEL question is 422----",
          nextLevelQuestions[0]?.timeLimit
        );

        setTimeLeft(nextLevelQuestions[0]?.timeLimit);
        setQuestionsLocked(true); // Lock questions for new level

        setTimeout(async () => {
          setShowLottie(true);
          await SoundManager.playSound("clappingSoundEffect", {
            isLooping: false,
          });
        }, 500);
      } else {
        console.log("Updating isLevelComplete...");
        setIsLevelComplete(true);
      }
    } catch (error) {
      console.error("Error updating level:", error);
    }
  };

  useEffect(() => {
    if (levelComplete) {
      handleLevelCompletion();
    }
  }, [levelComplete]);
  const handleTimeUp = async () => {
    await SoundManager.playSound("wrongAnswerSoundEffect", {
      isLooping: false,
    });
    setIsTimeOut(true);
    setIsPlaying(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (!showExplanation) {
      setShowExplanation(true);
      setCurrentExplanation({
        text: questions[currentQuestionIndex]?.explanation,
        image: questions[currentQuestionIndex]?.answerImage,
      });
    }
  };

  const resumeTimer = useCallback(() => {
    if (!currentQuestion || timeLeft <= 0 || isAnswerWrong || isTimeOut) return; // Stay paused if needed

    clearInterval(timerRef.current as any); // Prevent duplicate intervals

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
        setIsPlaying(false); // Indicate that the timer is paused
      }

      Alert.alert(
        "Are you sure you want to quit the quiz?",
        ``,
        [
          {
            text: "Resume Quiz",
            style: "cancel",
            onPress: () => {
              resumeTimer(); // Resume the timer if user chooses to continue
            },
          },
          {
            text: "Quit anyway!",
            onPress: async () => {
              await clearAllLevelScores();
              if (isLevelComplete && qizScore > 0) {
                await saveLevelLocalScore(currentLevel, qizScore);
                await markLevelAsCompleted(currentLevel);
                await handleLevelCompletion();
              }
              router.push({
                pathname: "/dashboard",
                params: { openLevelPopup: true as any },
              });
            },
          },
        ],
        { cancelable: true }
      );

      return true; // Prevent default back action
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction as any
    );

    return () => backHandler.remove(); // Cleanup on unmount
  }, [resumeTimer]); // ✅ Add resumeTimer as a dependency

  const renderExplanation = () => {
    return (
      <View style={styles.explanationCard}>
        <Text style={styles.explanationText}>
          {" "}
          {currentQuestion?.explanation || "No explanation available"}
        </Text>

        {currentExplanation?.image && (
          <Image
            source={{ uri: currentQuestion?.image }}
            style={styles.explanationImage}
            resizeMode="contain"
          />
        )}
        <TouchableOpacity
          style={styles.continueButton}
          onPress={async () => {
            console.log(
              " tis i swhat i answerd corretly->>>>> 669",
              correctAnswers
            );

            if (!isLevelComplete && qizScore > 0) {
              await saveLevelLocalScore(currentLevel, qizScore);
            }
            router.push({
              pathname: "/user/results",
              params: {
                highestLevelReached: highestLevelReached,
                quizScore: qizScore,
                maxLevel: maxLevel,
                correctAnswers: correctAnswers,
                totalQuestions: questions.length,
                currentLevel,
                levelComplete: levelComplete as any,
              },
            });
          }}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
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
          {" "}
          🎉 Congratulations You just Completed this level!!!{" "}
        </Text>

        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => {
            router.push({
              pathname: "/user/results",
              params: {
                correctAnswers: correctAnswers,
                totalQuestions: questions.length,
                currentLevel,
                isLevelComplete: false as any,
              },
            });
          }}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
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
      {!showLottie && (
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <View style={{ display: "flex", flexDirection: "column" }}>
              <Text style={styles.questionCounter}>Level: {currentLevel}</Text>
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
                key={timeLeft} // Ensures re-render when time limit changes
                isPlaying={isPlaying}
                duration={timeLeft}
                size={80}
                colors={["#004777", "#F7B801", "#A30000", "#FF0000"]}
                colorsTime={[15, 10, 5, 0]}
                onComplete={() => {
                  return { shouldRepeat: false };
                }}
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
                {currentQuestion?.questionText ||
                  questionsCache.current[currentQuestionIndex]?.questionText}
              </Text>
            )}
            {currentQuestion?.options && (
              <ScrollView
                style={{ maxHeight: 150 }}
                showsVerticalScrollIndicator={true} // Hide default
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
                  placeholder={userAnswer ? userAnswer : "Type your answer..."}
                  keyboardType="numeric"
                  autoFocus={true}
                  maxLength={10}
                  editable={!showExplanation}
                  returnKeyType="done"
                  // blurOnSubmit={false}
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
            {isTimeOut && <Text style={styles.errorText}>Time Out !😞 😔</Text>}
          </View>

          {showExplanation && renderExplanation()}
        </View>
      )}

      {showLottie && (
        <View
          style={{
            width: "100%",
            height: "100%",
            justifyContent: "flex-start",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <Player
            autoPlay
            style={{
              width: "100%",
              height: "50%",
              marginTop: 50,
            }}
            source={require("./../../assets/icons/congrate.json")}
          />
          {congratulationPage()}
        </View>
      )}
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
  nextButton: {
    backgroundColor: "#FF5A5F",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  nextButtonText: {
    fontSize: 24,
    color: "#FFF",
    fontFamily: "Poppins-Bold",
  },
  explanationTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  continueButton: {
    backgroundColor: "#F7C948",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginTop: 20,
  },
  continueButtonText: {
    color: "#333",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
});
