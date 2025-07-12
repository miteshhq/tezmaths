import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { onValue, ref } from "firebase/database";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  ImageBackground,
  ScrollView,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { auth, database } from "../../firebase/firebaseConfig";
import { battleManager } from "../../utils/battleManager";
import SoundManager from "../../components/soundManager";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEBUG_MODE = false;

// Type definitions
interface Player {
  id?: string;
  username?: string;
  name?: string;
  avatar: number | string;
  score?: number;
  winner?: boolean;
  points?: number;
  consecutiveCorrect?: number;
}

interface Question {
  question: string;
  correctAnswer: string;
  points?: number;
}

interface RoomData {
  status: string;
  currentQuestion: number;
  totalQuestions: number;
  questionStartedAt: number;
  questionTimeLimit?: number;
  questionTransition?: boolean;
  nextQuestionStartTime?: number;
  hostId: string;
  currentLevel?: number;
  players?: { [key: string]: Player };
  questions?: Question[];
  currentWinner?: string;
  consecutiveWinThreshold?: number;
  maxConsecutiveTarget?: number;
}

const avatarImages = (avatar: number | string) => {
  const avatarNumber =
    typeof avatar === "number" ? avatar : parseInt(avatar as string) || 0;
  switch (avatarNumber) {
    case 0:
      return require("../../assets/avatars/avatar1.jpg");
    case 1:
      return require("../../assets/avatars/avatar2.jpg");
    case 2:
      return require("../../assets/avatars/avatar3.jpg");
    case 3:
      return require("../../assets/avatars/avatar4.jpg");
    case 4:
      return require("../../assets/avatars/avatar5.jpg");
    case 5:
      return require("../../assets/avatars/avatar6.jpg");
    default:
      return require("../../assets/avatars/avatar1.jpg");
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
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isAnswered, setIsAnswered] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const timerAnimation = useRef(new Animated.Value(1)).current;
  const userId = auth.currentUser?.uid;
  const submitTimeoutRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const timeExpiryHandled = useRef(false);
  const [userData, setUserData] = useState({ avatar: 0 });
  const [networkError, setNetworkError] = useState(false);

  const [showBetterLuckMessage, setShowBetterLuckMessage] = useState(false);
  const [betterLuckCountdown, setBetterLuckCountdown] = useState(0);

  const [showNextQuestionCountdown, setShowNextQuestionCountdown] =
    useState(false);
  const [countdownValue, setCountdownValue] = useState(0);

  const [battleStartTime, setBattleStartTime] = useState<number>(0);
  const battleStartTimeRef = useRef<number>(0);
  const isFirstQuestionRef = useRef(true);

  useEffect(() => {
    return () => {
      SoundManager.stopSound("rightAnswerSoundEffect").catch(() => {});
      SoundManager.stopSound("wrongAnswerSoundEffect").catch(() => {});
    };
  }, []);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const cachedData = await AsyncStorage.getItem("userData");
        if (cachedData) {
          const data = JSON.parse(cachedData);
          setUserData(data);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };
    loadUserData();
  }, []);

  useEffect(() => {
    if (
      timeLeft === 0 &&
      !roomData?.questionTransition &&
      !roomData?.currentWinner &&
      !showBetterLuckMessage
    ) {
      setShowBetterLuckMessage(true);
      setBetterLuckCountdown(1);
      const interval = setInterval(() => {
        setBetterLuckCountdown((prev) => {
          if (prev <= 1) {
            setShowBetterLuckMessage(false);
            clearInterval(interval);
            if (roomData?.hostId === userId) {
              battleManager.startQuestionTransition(roomId as string, 1000);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [
    timeLeft,
    roomData?.questionTransition,
    roomData?.currentWinner,
    roomData?.hostId,
    userId,
    roomId,
    showBetterLuckMessage,
  ]);

  useEffect(() => {
    if (
      timeLeft === 0 &&
      !roomData?.questionTransition &&
      !roomData?.currentWinner
    ) {
      const fallbackTimeout = setTimeout(() => {
        if (roomData?.hostId === userId) {
          battleManager.startQuestionTransition(roomId as string, 1000);
        }
      }, 5000);

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
      if (isFirstQuestionRef.current && roomData.currentQuestion === 0) {
        const startTime = Date.now();
        setBattleStartTime(startTime);
        battleStartTimeRef.current = startTime;
        isFirstQuestionRef.current = false;
      }
      setUserAnswer("");
      setFeedback("");
      setIsAnswered(false);
      setIsProcessing(false);
      setShowBetterLuckMessage(false);
      setBetterLuckCountdown(0);
      timeExpiryHandled.current = false;

      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }
    }
  }, [roomData?.currentQuestion]);

  useEffect(() => {
    let timeoutId: number;

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
            console.error("Failed to move to next question:", error);
          });
        }, transitionTimeLeft);
      } else {
        battleManager.moveToNextQuestion(roomId as string).catch((error) => {
          console.error("Failed to move to next question:", error);
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

  useEffect(() => {
    if (roomData?.questionTransition) {
      setShowBetterLuckMessage(false);
      setBetterLuckCountdown(0);
      setFeedback("");
    }
  }, [roomData?.questionTransition]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
      timeExpiryHandled.current = false;
    };
  }, []);

  useEffect(() => {
    if (!roomData?.nextQuestionStartTime) {
      setShowNextQuestionCountdown(false);
      return;
    }

    setShowNextQuestionCountdown(true);

    const interval = setInterval(() => {
      const now = Date.now();
      const timeLeft = Math.max(0, roomData.nextQuestionStartTime! - now);
      const seconds = Math.ceil(timeLeft / 1000);

      setCountdownValue(seconds);

      if (timeLeft <= 0) {
        setShowNextQuestionCountdown(false);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [roomData?.nextQuestionStartTime]);

  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(database, `rooms/${roomId}`);
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        const data = snapshot.val();

        if (!data) {
          setNetworkError(true);
          return;
        }

        setRoomData(data);
        setNetworkError(false);
      },
      (error) => {
        console.error("Database listener error:", error);
        setNetworkError(true);
      }
    );

    return () => {
      unsubscribe();
      if (roomId) {
        battleManager.updatePlayerConnection(roomId as string, false);
      }
    };
  }, [roomId]);

  const otherWinnerAnnouncedRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!roomData?.players) return;

    const winners = Object.entries(roomData.players)
      .filter(([uid, p]) => (p as Player).winner === true)
      .map(([uid]) => uid);

    if (
      winners.length > 0 &&
      winners[0] !== userId &&
      !otherWinnerAnnouncedRef.current
    ) {
      otherWinnerAnnouncedRef.current = true;
      SoundManager.playSound("wrongAnswerSoundEffect").catch(console.error);
    }
  }, [roomData?.players, userId]);

  // FIXED: Timer management with proper calculation
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
        clearTimeout(timerRef.current);
      }

      const updateTimer = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const remaining = Math.max(0, timeLimit - elapsed);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);

      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [
    roomData?.questionStartedAt,
    roomData?.questionTransition,
    roomData?.status,
  ]);

  useEffect(() => {
    if (!roomData?.questionTransition) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [roomData?.currentQuestion, roomData?.questionTransition]);

  useEffect(() => {
    return () => {
      if (roomId) {
        battleManager.removeRoomListener(roomId as string);
        battleManager.updatePlayerConnection(roomId as string, false);
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (roomData?.status === "finished") {
      const navigateToResults = async () => {
        try {
          const playerArray = await battleManager.endBattle(roomId as string);

          const battleEndTime = Date.now();
          let totalBattleTimeMs = 0;
          if (battleStartTimeRef.current > 0) {
            const rawTimeMs = battleEndTime - battleStartTimeRef.current;
            const maxReasonableTime = 2 * 60 * 60 * 1000;
            const minReasonableTime = 1000;
            if (
              rawTimeMs >= minReasonableTime &&
              rawTimeMs <= maxReasonableTime
            ) {
              totalBattleTimeMs = rawTimeMs;
            } else {
              console.warn(`Invalid battle time: ${rawTimeMs}ms`);
              totalBattleTimeMs = 0;
            }
          }

          router.replace({
            pathname: "/user/battle-results",
            params: {
              roomId: roomId,
              players: JSON.stringify(playerArray || []),
              totalQuestions: roomData.totalQuestions?.toString() || "0",
              currentUserId: userId,
              totalBattleTime: totalBattleTimeMs.toString(),
            },
          });
        } catch (error) {
          router.replace("/user/multiplayer-mode-selection");
        }
      };
      navigateToResults();
    }
  }, [roomData?.status, userId, roomId]);

  // Update handleInputChange
  const handleInputChange = async (text: string) => {
    const normalizedAnswer = text.trim().toLowerCase();
    const currentQuestion = roomData?.questions?.[roomData.currentQuestion];
    const normalizedCorrect = currentQuestion?.correctAnswer?.toLowerCase();

    if (normalizedAnswer === normalizedCorrect) {
      handleAnswerSubmit(text);
    }
    setUserAnswer(text);
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
      const isFirstCorrect = await battleManager.submitAnswer(
        roomId as string,
        roomData.currentQuestion,
        normalizedAnswer
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (isFirstCorrect) {
        await SoundManager.playSound("rightAnswerSoundEffect");
      } else {
        await SoundManager.playSound("wrongAnswerSoundEffect");
      }

      const basePoints = roomData.currentLevel || 1;
      const pointsEarned = isFirstCorrect ? basePoints * 1 : basePoints * 0;

      if (isFirstCorrect) {
        setFeedback(
          `✅ Correct! ${
            isFirstCorrect ? "You got it first! " : ""
          }+${pointsEarned} points`
        );
      } else {
        setFeedback("✅ Correct!");
      }

      setIsAnswered(true);
    } catch (error) {
      console.error("Answer submission error:", error);
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

    const players = Object.entries(roomData.players || {}).map(
      ([id, player]) => ({
        id,
        ...(player as Player),
        avatar:
          typeof (player as Player).avatar === "number"
            ? (player as Player).avatar
            : parseInt((player as Player).avatar as string) || 0,
      })
    );

    const elements = [];
    players.forEach((player, index) => {
      elements.push(
        <View key={`player-${player.id}`} className="items-center">
          <View className="rounded-full bg-gray-300 items-center justify-center border-2 border-primary">
            <Image
              source={avatarImages(player.avatar)}
              className="w-full h-full rounded-full"
              style={{ width: 48, height: 48 }}
              resizeMode="cover"
            />
          </View>
          <Text className="text-xs mt-1 text-center max-w-16" numberOfLines={1}>
            {player.username || player.name}
            {player.id === userId ? " (You)" : ""}
          </Text>
          <Text className="text-xs text-center text-primary font-bold">
            {player.score || 0} pts
          </Text>
        </View>
      );

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
          onPress={() => router.replace("/user/multiplayer-mode-selection")}
        >
          <Text className="text-primary font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

  const questionsArray = roomData.questions ? roomData.questions : [];
  const currentQuestion = questionsArray[roomData.currentQuestion];

  if (!currentQuestion) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <Text className="text-white text-xl">Loading next question...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-4">
          <View className="flex-row justify-between items-center">
            <Text className="text-white text-3xl font-black">
              Level {roomData?.currentLevel || 1}
            </Text>
            <View className="flex-row items-center gap-4">
              <View className="flex-row items-center bg-primary px-3 py-1 rounded-full">
                <Text className="text-white text-sm font-black">
                  {roomData?.players?.[userId!]?.score || 0} pts
                </Text>
              </View>
              <View className="flex-row items-center bg-blue-500 px-3 py-1 rounded-full">
                <Text className="text-white text-sm font-black">
                  Battle Mode
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ImageBackground>
      <ScrollView className="flex-1 bg-white">
        <View className="flex-1 p-2">
          <View className="flex-row justify-between items-center mb-4">
            <CircularProgress
              size={70}
              progress={
                (roomData?.currentQuestion + 1) / roomData?.totalQuestions
              }
              strokeWidth={8}
              color="#F97316"
              text={`${roomData?.currentQuestion + 1}/${
                roomData?.totalQuestions
              }`}
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
            <Text className="text-3xl font-black text-black text-center">
              What is {currentQuestion?.question} ?
            </Text>
            <TextInput
              className="bg-custom-gray p-4 rounded-xl text-xl text-center border border-gray-100 mt-4"
              ref={inputRef}
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
              <Text className="text-blue-500 text-center mt-2">
                Processing...
              </Text>
            )}
          </View>

          {Object.values(roomData?.players || {}).map((player, index) => {
            const typedPlayer = player as Player;
            if (typedPlayer.winner) {
              return (
                <Text
                  key={`winner-${index}`}
                  className="text-green-500 text-center mt-4"
                >
                  🏆 {typedPlayer.username || typedPlayer.name} got it right! (+
                  {currentQuestion?.points || 1} pts)
                </Text>
              );
            }
            return null;
          })}

          {roomData?.players?.[userId!]?.consecutiveCorrect &&
            roomData?.players?.[userId!]?.consecutiveCorrect! > 0 &&
            roomData.totalQuestions - roomData.currentQuestion >
              (roomData.consecutiveWinThreshold || 0) &&
            !roomData?.currentWinner && (
              <Text className="text-blue-500 text-center mt-2 font-bold">
                🔥 {roomData.players[userId!].consecutiveCorrect} correct in a
                row!
                {(() => {
                  const remaining = Math.max(
                    0,
                    questionsArray.length - (roomData.currentQuestion + 1)
                  );
                  const toWin = Math.min(
                    roomData.maxConsecutiveTarget || 0,
                    remaining
                  );
                  return toWin > 0 ? (
                    <Text className="text-sm"> ({toWin} more to win!)</Text>
                  ) : null;
                })()}
              </Text>
            )}

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

          {showNextQuestionCountdown && countdownValue > 0 && (
            <Text className="text-blue-500 text-center mt-4 font-bold">
              Next question in {countdownValue}s...
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
