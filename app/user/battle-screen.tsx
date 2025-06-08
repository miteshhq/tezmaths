import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { battleManager } from "../../utils/battleManager";
import { auth } from "../../firebase/firebaseConfig";

export default function BattleScreen() {
  const router = useRouter();
  const { roomId, question: currentQ } = useLocalSearchParams();
  const [room, setRoom] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const userId = auth.currentUser?.uid;
  const questionIndex = parseInt(currentQ || 0);

  // Listen to room updates
  useEffect(() => {
    if (!roomId) return;

    const unsubscribe = battleManager.listenToRoom(roomId, (roomData) => {
      setRoom(roomData);

      // Handle game progression
      if (roomData?.currentQuestion > questionIndex) {
        router.replace(
          `/user/battle-screen?roomId=${roomId}&question=${roomData.currentQuestion}`
        );
        setSelectedAnswer(null);
      }

      // Handle game end
      if (roomData?.status === "finished") {
        router.replace(`/user/results-screen?roomId=${roomId}`);
      }
    });

    return unsubscribe;
  }, [roomId, questionIndex]);

  useEffect(() => {
    if (!room || room.status !== "playing") return;

    // Sync timer with server
    const questionStartTime = room.questionStartedAt;
    const timeLimit = room.questionTimeLimit || 15;
    const elapsed = Math.floor((Date.now() - questionStartTime) / 1000);
    const initialTimeLeft = Math.max(0, timeLimit - elapsed);

    setTimeLeft(initialTimeLeft);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [room?.currentQuestion, room?.questionStartedAt]);

  // Reset timer on new question
  useEffect(() => {
    setTimeLeft(room?.questionTimeLimit || 15);
  }, [questionIndex]);

  // Submit answer
  const submitAnswer = async (index) => {
    if (selectedAnswer !== null) return;

    setSelectedAnswer(index);
    try {
      await battleManager.submitAnswer(roomId, questionIndex, index);

      // Wait for next question or results
      const unsubscribe = battleManager.listenToRoom(roomId, (roomData) => {
        if (roomData?.currentQuestion > questionIndex) {
          unsubscribe();
          router.replace(
            `/user/battle-screen?roomId=${roomId}&question=${roomData.currentQuestion}`
          );
        } else if (roomData?.status === "finished") {
          unsubscribe();
          router.replace(`/user/results-screen?roomId=${roomId}`);
        }
      });
    } catch (error) {
      alert("Error submitting answer: " + error.message);
    }
  };

  // Handle time expiration
  const handleTimeUp = async () => {
    if (selectedAnswer === null) {
      await battleManager.submitAnswer(roomId, questionIndex, -1); // No answer
    }
  };

  if (!room) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const currentQuestion = room.questions?.[questionIndex];
  const playerAnswer = room.players[userId]?.answers?.[questionIndex];

  return (
    <View className="flex-1 bg-white p-4">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-xl font-bold">
          Question {questionIndex + 1}/{room.totalQuestions}
        </Text>
        <Text className="text-xl font-bold text-red-500">{timeLeft}s</Text>
      </View>

      {/* Question */}
      <View className="bg-purple-100 p-4 rounded-lg mb-6">
        <Text className="text-lg">{currentQuestion?.question}</Text>
      </View>

      {/* Options */}
      <View className="flex-1">
        {currentQuestion?.options.map((option, index) => {
          let bgColor = "bg-gray-100";
          if (selectedAnswer === index) {
            bgColor = playerAnswer?.isCorrect ? "bg-green-200" : "bg-red-200";
          } else if (playerAnswer?.answerIndex === index) {
            bgColor = playerAnswer.isCorrect ? "bg-green-200" : "bg-red-200";
          }

          return (
            <TouchableOpacity
              key={index}
              className={`${bgColor} p-4 rounded-lg mb-3`}
              onPress={() => submitAnswer(index)}
              disabled={playerAnswer !== undefined}
            >
              <Text className="text-lg">{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Score */}
      <Text className="text-center text-xl font-bold mt-4">
        Your Score: {room.players[userId]?.score || 0}
      </Text>
    </View>
  );
}
