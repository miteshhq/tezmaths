import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
} from "react-native";
import { database } from "../../firebase/firebaseConfig";
import { ref, onValue, update } from "firebase/database";
import { auth } from "../../firebase/firebaseConfig";
import { useLocalSearchParams, router } from "expo-router";
import Svg, { Circle } from "react-native-svg";

const DEBUG_MODE = true; // Set to false in production

const debugLog = (message, data = null) => {
  if (DEBUG_MODE) {
    console.log(`[BattleScreen] ${message}`, data);
  }
};

const CircularProgress = ({ size, progress, strokeWidth, color, text }) => {
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
  const timerAnimation = useRef(new Animated.Value(1)).current;
  const userId = auth.currentUser?.uid;

  useEffect(() => {
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

        setRoomData(data);
        debugLog("Status:", data.status);
        debugLog("Questions:", data.questions);
        debugLog("Current Question:", data.currentQuestion);

        // Better validation of room state
        if (data.status === "playing") {
          if (!data.questions || data.questions.length === 0) {
            debugLog("No questions available in playing room");
            Alert.alert("Error", "No questions available", [
              { text: "OK", onPress: () => router.push("/user/home") },
            ]);
            return;
          }

          if (
            data.currentQuestion === undefined ||
            data.currentQuestion === null
          ) {
            debugLog("Invalid current question index");
            return;
          }

          debugLog("Room is properly set up for playing");
        }
      },
      (error) => {
        console.error("BattleScreen - Database listener error:", error);
        Alert.alert("Error", "Failed to load battle data. Please try again.", [
          { text: "Retry", onPress: () => window.location.reload() },
          { text: "Go Home", onPress: () => router.push("/user/home") },
        ]);
      }
    );
    return () => unsubscribe();
  }, [roomId, router]);

  useEffect(() => {
    if (
      roomData &&
      roomData.status === "playing" &&
      roomData.questionStartedAt
    ) {
      const startTime = roomData.questionStartedAt;
      const timeLimit = roomData.questionTimeLimit || 15;
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const remaining = timeLimit - elapsed;
        setTimeLeft(remaining > 0 ? remaining : 0);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [roomData]);

  useEffect(() => {
    if (roomData?.status === "finished") {
      const playerArray = Object.entries(roomData.players || {})
        .map(([id, data]) => ({
          userId: id,
          username: data.username,
          score: data.score || 0,
        }))
        .sort((a, b) => b.score - a.score);

      router.push({
        pathname: "/user/battle-results",
        params: {
          players: JSON.stringify(playerArray),
          totalQuestions: roomData.totalQuestions.toString(),
        },
      });
    }
  }, [roomData]);

  const handleAnswerSubmit = async () => {
    if (!roomData || !roomData.questions || !userId) return;
    const currentQuestion = roomData.questions[roomData.currentQuestion];
    if (!currentQuestion) return;

    const normalizedAnswer = userAnswer.trim().toLowerCase();
    const normalizedCorrect = currentQuestion.correctAnswer.toLowerCase();

    await update(ref(database, `rooms/${roomId}/players/${userId}`), {
      answer: normalizedAnswer,
    });

    if (normalizedAnswer === normalizedCorrect) {
      setFeedback("Waiting for confirmation...");
    } else {
      setFeedback("Wrong answer");
      setUserAnswer("");
    }
  };

  const getTimerColor = () => {
    const percentage = timeLeft / 15;
    if (percentage > 0.6) return "#10B981";
    if (percentage > 0.3) return "#F59E0B";
    return "#EF4444";
  };

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

  const currentQuestion = roomData.questions[roomData.currentQuestion];
  if (!currentQuestion) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <Text className="text-white text-xl">Waiting for next question...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white p-4">
      <View className="flex-row justify-between items-center mb-6">
        <CircularProgress
          size={70}
          progress={(roomData.currentQuestion + 1) / roomData.totalQuestions}
          strokeWidth={8}
          color="#F87720"
          text={`${roomData.currentQuestion + 1}/${roomData.totalQuestions}`}
        />
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

      <View className="bg-white rounded-2xl border border-black p-4">
        <Text className="text-3xl font-black text-purple-800 text-center">
          What is {currentQuestion.question} ?
        </Text>
        <TextInput
          className="bg-gray-50 p-4 rounded-xl text-xl text-center border border-gray-100 mt-4"
          value={userAnswer}
          onChangeText={(text) => {
            setUserAnswer(text);
            handleAnswerSubmit();
          }}
          placeholder="Type Your Answer"
          keyboardType="numeric"
        />
        {feedback && (
          <Text className="text-center mt-2 text-red-500">{feedback}</Text>
        )}
      </View>

      {roomData.players[userId]?.winner && (
        <Text className="text-green-500 text-center mt-4">
          {roomData.players[userId].username} answered right!
        </Text>
      )}
      {timeLeft === 0 && (
        <Text className="text-red-500 text-center mt-4">
          Better luck next time! The right answer was{" "}
          {currentQuestion.correctAnswer}.
        </Text>
      )}
    </View>
  );
}
