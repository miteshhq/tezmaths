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
  Image,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { auth, database } from "../../firebase/firebaseConfig";
import { battleManager } from "../../utils/battleManager";
import SoundManager from "../../components/soundManager";

const DEBUG_MODE = false;
const AUTO_SUBMIT_DELAY = 400;

const avatarImages = (avatar) => {
  switch (avatar) {
    case "0":
      return require("../../assets/avatars/avatar1.jpg");
    case "1":
      return require("../../assets/avatars/avatar2.jpg");
    case "2":
      return require("../../assets/avatars/avatar3.jpg");
    case "3":
      return require("../../assets/avatars/avatar4.jpg");
    case "4":
      return require("../../assets/avatars/avatar5.jpg");
    case "5":
      return require("../../assets/avatars/avatar6.jpg");
    default:
      return require("../../assets/avatars/avatar1.jpg");
  }
};

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

  const [showBetterLuckMessage, setShowBetterLuckMessage] = useState(false);
  const [betterLuckCountdown, setBetterLuckCountdown] = useState(0);

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

  useEffect(() => {
    if (
      timeLeft === 0 && // Only trigger when time is exactly 0
      !roomData?.questionTransition &&
      !roomData?.currentWinner &&
      !showBetterLuckMessage
    ) {
      setShowBetterLuckMessage(true);
      setBetterLuckCountdown(2);

      const interval = setInterval(() => {
        setBetterLuckCountdown((prev) => {
          if (prev <= 1) {
            setShowBetterLuckMessage(false);
            clearInterval(interval);
            if (roomData?.hostId === userId) {
              battleManager.startQuestionTransition(roomId as string, 2000);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [
    timeLeft, // This should only trigger when timeLeft changes to 0
    roomData?.questionTransition,
    roomData?.currentWinner,
    roomData?.hostId,
    userId,
    roomId,
    showBetterLuckMessage,
  ]);

  // Add this new useEffect for handling stuck states
  useEffect(() => {
    if (
      timeLeft === 0 &&
      !roomData?.questionTransition &&
      !roomData?.currentWinner
    ) {
      // Fallback handler if the host isn't moving to next question
      const fallbackTimeout = setTimeout(() => {
        if (roomData?.hostId === userId) {
          console.log("Fallback: Moving to next question");
          battleManager.startQuestionTransition(roomId as string, 1000);
        }
      }, 5000); // 5 second fallback

      return () => clearTimeout(fallbackTimeout);
    }
  }, [
    timeLeft,
    roomData?.questionTransition,
    roomData?.currentWinner,
    roomData?.hostId,
    userId,
    roomId,
  ]);

  useEffect(() => {
    if (roomData?.currentQuestion !== undefined) {
      // Reset states for new question
      setUserAnswer("");
      setFeedback("");
      setIsAnswered(false);
      setIsProcessing(false);
      setShowBetterLuckMessage(false);
      setBetterLuckCountdown(0);
      timeExpiryHandled.current = false;

      // Clear any pending timeouts
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }
    }
  }, [roomData?.currentQuestion]);

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

  // Add this useEffect to ensure host always handles progression
  //   useEffect(() => {
  //     if (
  //       roomData?.hostId === userId &&
  //       timeLeft === 0 &&
  //       !roomData?.questionTransition &&
  //       !roomData?.currentWinner
  //     ) {
  //       const progressTimeout = setTimeout(() => {
  //         battleManager.handleTimeExpiry(roomId as string);
  //       }, 1000);

  //       return () => clearTimeout(progressTimeout);
  //     }
  //   }, [
  //     timeLeft,
  //     roomData?.hostId,
  //     roomData?.questionTransition,
  //     roomData?.currentWinner,
  //     userId,
  //     roomId,
  //   ]);

  // Clear messages when transition starts
  useEffect(() => {
    if (roomData?.questionTransition) {
      setShowBetterLuckMessage(false);
      setBetterLuckCountdown(0);
      setFeedback("");
    }
  }, [roomData?.questionTransition]);

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

  // In the timer management useEffect, change the interval from 100ms to 1000ms for more precision
  useEffect(() => {
    if (
      roomData &&
      roomData.status === "playing" &&
      roomData.questionStartedAt &&
      !roomData.questionTransition
    ) {
      const startTime = roomData.questionStartedAt;
      const timeLimit = roomData.questionTimeLimit || 15;

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

      updateTimer();

      // Change from 100ms to 1000ms for more accurate timing
      timerRef.current = setInterval(updateTimer, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
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
      // Add a small delay for smooth transition
      const timeout = setTimeout(() => {
        const playerArray = Object.entries(roomData.players || {})
          .map(([id, data]) => ({
            userId: id,
            username: data.username || data.name,
            score: data.score || 0,
            avatar: data.avatar || null,
          }))
          .sort((a, b) => b.score - a.score);

        router.push({
          pathname: "/user/battle-results",
          params: {
            players: JSON.stringify(playerArray),
            totalQuestions: roomData.totalQuestions?.toString() || "0",
            currentUserId: userId,
          },
        });
      }, 500); // 500ms delay instead of 3-4 seconds

      return () => clearTimeout(timeout);
    }
  }, [roomData?.status, roomData?.players, roomData?.totalQuestions, userId]);

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

  const renderProfileImages = () => {
    if (!roomData?.players) return null;

    const players = Object.entries(roomData.players).map(([id, player]) => ({
      id,
      ...player,
    }));

    const elements = [];
    players.forEach((player, index) => {
      // Add player profile
      elements.push(
        <View key={`player-${player.id}`} className="items-center">
          <View className="rounded-full bg-gray-300 items-center justify-center border-2 border-primary">
            {player ? (
              <Image
                source={avatarImages(player.avatar)}
                className="w-full h-full rounded-full"
                style={{ width: 48, height: 48 }}
                resizeMode="cover"
              />
            ) : (
              <Text className="text-primary font-bold">
                {(player.username || player.name || "P")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            )}
          </View>
          <Text className="text-xs mt-1 text-center max-w-16" numberOfLines={1}>
            {player.username || player.name}
          </Text>
        </View>
      );

      // Add sword between players (except after last player)
      if (index < players.length - 1) {
        elements.push(
          <View key={`sword-${index}`} className="items-center justify-center">
            <Image
              source={require("../../assets/icons/swords.png")}
              style={{ width: 20, height: 20 }}
              tintColor="#F05A2A"
            />
          </View>
        );
      }
    });

    return (
      <View className="flex-row items-center justify-center space-x-2 mb-4">
        {elements}
      </View>
    );
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
      {renderProfileImages()}
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
      {timeLeft === 0 && !roomData.questionTransition && (
        <View className="mt-4">
          {showBetterLuckMessage ? (
            <Text className="text-red-500 text-sm text-center font-semibold">
              Better luck next time! Next question in {betterLuckCountdown}s
            </Text>
          ) : (
            <Text className="text-red-500 text-center">
              ⏰ Time's up! The correct answer was{" "}
              {currentQuestion?.correctAnswer}.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
