import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { onValue, ref } from "firebase/database";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { auth, database } from "../../firebase/firebaseConfig";
import { battleManager } from "../../utils/battleManager";
import SoundManager from "../../components/soundManager";

const DEBUG_MODE = false;
const AUTO_SUBMIT_DELAY = 200;

const debugLog = (message, data = null) => {
  if (DEBUG_MODE) {
    // console.log(`[BattleScreen] ${message}`, data);
  }
};

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

export default function BattleScreen() {
  const { roomId } = useLocalSearchParams();
  const [roomData, setRoomData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isAnswered, setIsAnswered] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const timerAnimation = useRef(new Animated.Value(1)).current;
  const userId = auth.currentUser?.uid;
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timeExpiryHandled = useRef(false);

  const [showNextQuestionCountdown, setShowNextQuestionCountdown] =
    useState(false);
  const [countdownValue, setCountdownValue] = useState(0);

  useEffect(() => {
    return () => {
      // stop both effects just in case
      SoundManager.stopSound("rightAnswerSoundEffect").catch(() => {});
      SoundManager.stopSound("wrongAnswerSoundEffect").catch(() => {});
    };
  }, []);

  // Handle time expiry (only one instance)
  useEffect(() => {
    if (
      timeLeft === 0 &&
      !roomData?.questionTransition &&
      roomData?.hostId === userId &&
      !timeExpiryHandled.current
    ) {
      timeExpiryHandled.current = true;
      battleManager.handleTimeExpiry(roomId as string).catch((error) => {
        // console.error("Time expiry handling failed:", error);
      });
    }
  }, [
    timeLeft,
    roomData?.questionTransition,
    roomData?.hostId,
    userId,
    roomId,
  ]);

  // Handle transition to next question (only one instance)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    if (
      roomData?.questionTransition &&
      roomData?.nextQuestionStartTime &&
      roomData?.hostId === userId
    ) {
      const now = Date.now();
      const transitionTimeLeft = roomData.nextQuestionStartTime - now;

      if (transitionTimeLeft > 0) {
        timeoutId = setTimeout(() => {
          battleManager.moveToNextQuestion(roomId as string).catch((error) => {
            // console.error("Failed to move to next question:", error);
          });
        }, transitionTimeLeft);
      } else {
        battleManager.moveToNextQuestion(roomId as string).catch((error) => {
        //   console.error("Failed to move to next question:", error);
        });
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    roomData?.questionTransition,
    roomData?.nextQuestionStartTime,
    roomData?.hostId,
    userId,
    roomId,
  ]);

  // Add cleanup for question transitions
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
      timeExpiryHandled.current = false;
    };
  }, []);

  // Handle countdown for next question
  useEffect(() => {
    if (!roomData?.nextQuestionStartTime) {
      setShowNextQuestionCountdown(false);
      return;
    }

    setShowNextQuestionCountdown(true);

    const interval = setInterval(() => {
      const now = Date.now();
      const timeLeft = Math.max(0, roomData.nextQuestionStartTime - now);
      const seconds = Math.ceil(timeLeft / 1000);

      setCountdownValue(seconds);

      if (timeLeft <= 0) {
        setShowNextQuestionCountdown(false);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [roomData?.nextQuestionStartTime]);

  // Room data listener
  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(database, `rooms/${roomId}`);
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        const data = snapshot.val();
        debugLog("Room data received:", data);

        if (!data) {
          debugLog("Room not found for roomId:", roomId);
          Alert.alert("Room Error", "Room not found", [
            { text: "OK", onPress: () => router.push("/user/home") },
          ]);
          return;
        }

        // Reset states when question changes
        if (data.currentQuestion !== roomData?.currentQuestion) {
          debugLog("Question changed, resetting states");
          setUserAnswer("");
          setFeedback("");
          setIsAnswered(false);
          setIsProcessing(false);
          timeExpiryHandled.current = false; // Reset time expiry handler
        }

        setRoomData(data);
      },
      (error) => {
        // console.error("BattleScreen - Database listener error:", error);
        Alert.alert("Error", "Failed to load battle data. Please try again.", [
          { text: "Retry", onPress: () => window.location.reload() },
          { text: "Go Home", onPress: () => router.push("/user/home") },
        ]);
      }
    );
    return () => unsubscribe();
  }, [roomId, router]);

  // Keep track of who’s already been announced
  const otherWinnerAnnouncedRef = useRef(false);

  useEffect(() => {
    if (!roomData?.players) return;

    // find the first winner
    const winners = Object.entries(roomData.players)
      .filter(([uid, p]) => p.winner === true)
      .map(([uid]) => uid);

    // if someone won, and it wasn’t you, and we haven’t played the buzzer yet:
    if (
      winners.length > 0 &&
      winners[0] !== userId &&
      !otherWinnerAnnouncedRef.current
    ) {
      otherWinnerAnnouncedRef.current = true;
      SoundManager.playSound("wrongAnswerSoundEffect").catch(console.error);
    }
  }, [roomData?.players]);

  // Timer management
  useEffect(() => {
    if (
      roomData &&
      roomData.status === "playing" &&
      roomData.questionStartedAt &&
      !roomData.questionTransition
    ) {
      const startTime = roomData.questionStartedAt;
      const timeLimit = roomData.questionTimeLimit || 15;

      // Clear existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      const updateTimer = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const remaining = Math.max(0, timeLimit - elapsed);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      // Initial update
      updateTimer();

      // Set up interval
      timerRef.current = setInterval(updateTimer, 100);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      // Clear timer if not in playing state or in transition
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [
    roomData?.questionStartedAt,
    roomData?.questionTransition,
    roomData?.status,
  ]);

  // Navigate to results when battle finishes
  useEffect(() => {
    if (roomData?.status === "finished") {
      const playerArray = Object.entries(roomData.players || {})
        .map(([id, data]) => ({
          userId: id,
          username: data.username || data.name,
          score: data.score || 0,
        }))
        .sort((a, b) => b.score - a.score);

      router.push({
        pathname: "/user/battle-results",
        params: {
          players: JSON.stringify(playerArray),
          totalQuestions: roomData.totalQuestions?.toString() || "0",
        },
      });
    }
  }, [roomData?.status]);

  const handleInputChange = (text: string) => {
    if (
      isAnswered ||
      timeLeft <= 0 ||
      roomData?.questionTransition ||
      isProcessing
    )
      return;

    setUserAnswer(text);

    // Clear any existing timeout
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }

    // Set new timeout for auto-submit
    if (text.trim() !== "") {
      submitTimeoutRef.current = setTimeout(() => {
        handleAnswerSubmit(text);
      }, AUTO_SUBMIT_DELAY);
    }
  };

  const handleAnswerSubmit = async (answer: string) => {
    if (
      !roomData ||
      !roomData.questions ||
      !userId ||
      isAnswered ||
      isProcessing
    )
      return;

    const currentQuestion = roomData.questions[roomData.currentQuestion];
    if (!currentQuestion) return;

    const normalizedAnswer = answer.trim().toLowerCase();
    const normalizedCorrect = currentQuestion.correctAnswer.toLowerCase();

    if (normalizedAnswer !== normalizedCorrect) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback("❌ Wrong answer, try again");
      setUserAnswer("");
      return;
    }

    setIsProcessing(true);

    try {
      debugLog("Submitting correct answer...");
      const isFirstCorrect = await battleManager.submitAnswer(
        roomId as string,
        roomData.currentQuestion,
        normalizedAnswer
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // ◀ New code starts
      if (isFirstCorrect) {
        await SoundManager.playSound("rightAnswerSoundEffect");
      } else {
        await SoundManager.playSound("wrongAnswerSoundEffect");
      }
      // New code ends ▶

      if (isFirstCorrect) {
        setFeedback("✅ Correct! You got it first! +100 points");
      } else {
        setFeedback("✅ Correct! Well done!");
      }

      setIsAnswered(true);
      debugLog(
        "Answer submitted successfully, isFirstCorrect:",
        isFirstCorrect
      );
    } catch (error) {
    //   console.error("Answer submission error:", error);
      setFeedback("Error submitting answer");
    } finally {
      setIsProcessing(false);
    }
  };

  const getTimerColor = () => {
    const percentage = timeLeft / 15;
    if (percentage > 0.6) return "#10B981";
    if (percentage > 0.3) return "#F59E0B";
    return "#EF4444";
  };

  // Loading states
  if (!roomData) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">Connecting to battle...</Text>
      </View>
    );
  }

  if (roomData.status !== "playing") {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">Waiting for battle to start...</Text>
        <Text className="text-white mt-2 text-sm">
          Status: {roomData.status}
        </Text>
      </View>
    );
  }

  if (!roomData.questions || roomData.questions.length === 0) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">Loading questions...</Text>
        <TouchableOpacity
          className="mt-4 bg-white px-4 py-2 rounded"
          onPress={() => router.push("/user/home")}
        >
          <Text className="text-primary">Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (
    roomData.currentQuestion === undefined ||
    roomData.currentQuestion === null
  ) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">Preparing questions...</Text>
      </View>
    );
  }

  // In the component render:
  const questionsArray = roomData.questions
    ? Object.values(roomData.questions)
    : [];

  const currentQuestion = questionsArray[roomData.currentQuestion];

  if (!currentQuestion) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <Text className="text-white text-xl">Loading next question...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white p-4">
      <View className="flex-row justify-between items-center mb-6">
        <CircularProgress
          size={70}
          progress={(roomData?.currentQuestion + 1) / roomData?.totalQuestions}
          strokeWidth={8}
          color="#F97316"
          text={`${roomData?.currentQuestion + 1}/${roomData?.totalQuestions}`}
        />
        <View className="flex-1 ml-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-primary">Time Remaining:</Text>
            <Text className="text-primary font-bold">{timeLeft}s</Text>
          </View>
          <View className="bg-gray-300 h-4 rounded-full overflow-hidden">
            <View
              className="h-full rounded-full transition-all duration-1000"
              style={{
                backgroundColor: getTimerColor(),
                width: `${(timeLeft / 15) * 100}%`,
              }}
            />
          </View>
        </View>
      </View>

      <View className="bg-white rounded-2xl border border-black p-4">
        <Text className="text-3xl font-black text-custom-purple text-center">
          What is {currentQuestion?.question} ?
        </Text>
        <TextInput
          className="bg-custom-gray p-4 rounded-xl text-xl text-center border border-gray-100 mt-4"
          value={userAnswer}
          onChangeText={handleInputChange}
          placeholder="Type Your Answer"
          keyboardType="numeric"
          editable={
            !isAnswered &&
            timeLeft > 0 &&
            !roomData.questionTransition &&
            !isProcessing
          }
        />
        {feedback && (
          <Text
            className={`text-center mt-2 ${
              feedback.includes("✅") ? "text-green-500" : "text-red-500"
            }`}
          >
            {feedback}
          </Text>
        )}
        {isProcessing && (
          <Text className="text-blue-500 text-center mt-2">Processing...</Text>
        )}
      </View>

      {/* Show players who got it right */}
      {Object.values(roomData?.players || {}).map((player, index) => {
        if (player.winner) {
          return (
            <Text
              key={`winner-${index}`}
              className="text-green-500 text-center mt-4"
            >
              🏆 {player.username || player.name} got it right!
            </Text>
          );
        }
        return null;
      })}

      {/* Question transition countdown */}
      {showNextQuestionCountdown && (
        <View className="absolute inset-0 bg-black bg-opacity-70 justify-center items-center">
          <Text className="text-white text-6xl font-bold">
            {countdownValue}
          </Text>
          <Text className="text-white text-xl mt-4">
            Next question starting...
          </Text>
        </View>
      )}

      {/* Time's up message */}
      {timeLeft === 0 && !roomData.questionTransition && (
        <Text className="text-red-500 text-center mt-4">
          ⏰ Time's up! The correct answer was {currentQuestion?.correctAnswer}.
        </Text>
      )}
    </View>
  );
}
