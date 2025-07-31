import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { onValue, ref, off } from "firebase/database";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  ImageBackground,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import SoundManager from "../../components/soundManager";
import { auth, database } from "../../firebase/firebaseConfig";
import { battleManager } from "../../utils/battleManager";
import LeaveConfirmationModal from "@/components/LeaveConfirmationModal";

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
  connected?: boolean;
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
  gameEndReason?: string;
  results?: any[]; // Added this missing property
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
  const timeExpiryHandled = useRef(false);
  const [userData, setUserData] = useState({ avatar: 0 });
  const [networkError, setNetworkError] = useState(false);

  const [showBetterLuckMessage, setShowBetterLuckMessage] = useState(false);
  const [betterLuckCountdown, setBetterLuckCountdown] = useState(0);

  const [showNextQuestionCountdown, setShowNextQuestionCountdown] =
    useState(false);
  const [countdownValue, setCountdownValue] = useState(0);

  const timerRef = useRef(null);
  const [backHandlerActive, setBackHandlerActive] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const [serverOffset, setServerOffset] = useState(0);

  // Track if this is a fresh battle start
  const battleInitialized = useRef(false);
  const currentRoomId = useRef(roomId);

  // Simplified timer management
  const timerManager = useRef({
    mainTimer: null,
    transitionTimer: null,
    questionTimer: null,
  });

  useEffect(() => {
    const offsetRef = ref(database, ".info/serverTimeOffset");
    const unsubscribe = onValue(offsetRef, (snapshot) => {
      setServerOffset(snapshot.val() || 0);
    });

    return () => {
      off(offsetRef, "value", unsubscribe);
    };
  }, []);

  const cleanupTimers = useCallback(() => {
    Object.values(timerManager.current).forEach((timer) => {
      if (timer) {
        clearInterval(timer);
        clearTimeout(timer);
      }
    });
    timerManager.current = {
      mainTimer: null,
      transitionTimer: null,
      questionTimer: null,
    };

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }
  }, []);

  const clearBattleState = useCallback(async () => {
    console.log("Clearing all battle state for new battle");

    navigationInProgress.current = false;

    // Clear all timers first
    cleanupTimers();

    // Reset all state variables
    setRoomData(null);
    setTimeLeft(15);
    setUserAnswer("");
    setFeedback("");
    setIsAnswered(false);
    setIsProcessing(false);
    setNetworkError(false);
    setShowBetterLuckMessage(false);
    setBetterLuckCountdown(0);
    setShowNextQuestionCountdown(false);
    setCountdownValue(0);
    setBackHandlerActive(false);
    setIsLeaving(false);
    setShowLeaveModal(false);

    // Reset refs
    timeExpiryHandled.current = false;
    battleInitialized.current = false;
    otherWinnerAnnouncedRef.current = false;

    // Clear cached data
    try {
      await AsyncStorage.multiRemove([
        "currentBattleId",
        "battleState",
        "battleResults",
        "lastBattleScore",
        "battleProgress",
      ]);
    } catch (error) {
      console.error("Error clearing battle cache:", error);
    }

    // Remove room listener
    if (currentRoomId.current && battleManager) {
      try {
        battleManager.removeRoomListener(currentRoomId.current as string);
      } catch (error) {
        console.error("Error removing room listener:", error);
      }
    }
  }, [cleanupTimers]);

  const handleTimeExpiry = useCallback(() => {
    if (roomData?.hostId === userId && !roomData.questionTransition) {
      // Show "better luck" message first
      setShowBetterLuckMessage(true);
      setBetterLuckCountdown(1);

      const countdownInterval = setInterval(() => {
        setBetterLuckCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            setShowBetterLuckMessage(false);

            // Start question transition
            if (roomData?.hostId === userId) {
              battleManager
                .startQuestionTransition(roomId as string, 1000)
                .catch(console.error);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Cleanup interval reference
      timerManager.current.transitionTimer = countdownInterval;
    }
  }, [roomData?.hostId, roomData?.questionTransition, userId, roomId]);

  // DETECT ROOM CHANGE AND CLEAR STATE
  useEffect(() => {
    if (roomId !== currentRoomId.current) {
      console.log(`Room changed from ${currentRoomId.current} to ${roomId}`);
      currentRoomId.current = roomId;
      // Make this non-blocking
      clearBattleState().catch(console.error);
    }
  }, [roomId, clearBattleState]);

  // INITIALIZE BATTLE STATE ON MOUNT (SIMPLIFIED)
  useEffect(() => {
    const initializeBattle = () => {
      if (!battleInitialized.current && roomId) {
        console.log("Initializing new battle for room:", roomId);

        // Clear everything first (NON-BLOCKING)
        clearBattleState().catch(console.error);

        // Reset navigation and state flags
        setIsLeaving(false);
        setBackHandlerActive(false);
        setShowLeaveModal(false);

        // Mark as initialized IMMEDIATELY
        battleInitialized.current = true;
      }
    };

    initializeBattle();
  }, [roomId, clearBattleState]);

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
    if (roomData?.currentQuestion !== undefined) {
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
    if (!roomData?.nextQuestionStartTime) {
      setShowNextQuestionCountdown(false);
      return;
    }

    setShowNextQuestionCountdown(true);

    const interval = setInterval(() => {
      const now = Date.now();
      const timeLeft = Math.max(0, roomData.nextQuestionStartTime! - now);
      const seconds = Math.floor(timeLeft / 3000);

      setCountdownValue(seconds);

      if (timeLeft <= 0) {
        setShowNextQuestionCountdown(false);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [roomData?.nextQuestionStartTime]);

  // FIREBASE LISTENER - FIXED VERSION with navigation guard

  useEffect(() => {
    if (!roomId || isLeaving) return;

    const roomRef = ref(database, `rooms/${roomId}`);
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        const data = snapshot.val();

        // FIRST: Check for battle completion and navigate immediately
        if (data?.status === "finished" && data?.results) {
          if (!navigationInProgress.current && !isLeaving) {
            navigationInProgress.current = true;
            setIsLeaving(true);

            console.log("Battle finished, navigating to results");

            clearBattleState().finally(() => {
              router.replace({
                pathname: "/user/battle-results",
                params: {
                  roomId: roomId,
                  players: JSON.stringify(data.results),
                  totalQuestions: data.totalQuestions?.toString() || "25",
                  currentUserId: userId,
                  endReason: data.gameEndReason || "game_completed",
                },
              });
            });
          }
          return; // Stop processing further updates
        }

        if (data) {
          // Check if current player is connected OR exists in room
          if (!data.players?.[userId]?.connected) {
            if (!navigationInProgress.current && !isLeaving) {
              navigationInProgress.current = true;
              setIsLeaving(true);

              console.log(
                "You were disconnected/removed from the battle, exiting..."
              );
              clearBattleState().finally(() => {
                router.replace("/user/multiplayer-mode-selection");
              });
              return;
            }
          }
        }

        if (!data) {
          // FIXED: Single navigation with proper cleanup
          if (!navigationInProgress.current && !isLeaving) {
            navigationInProgress.current = true;
            console.log("Room no longer exists, navigating away");

            clearBattleState().finally(() => {
              router.replace("/user/multiplayer-mode-selection");
            });
          }
          setNetworkError(true);
          return;
        }

        setRoomData(data);
        setNetworkError(false);
      },
      (error) => {
        console.error("Database listener error:", error);
        setNetworkError(true);

        if (!navigationInProgress.current && !isLeaving) {
          navigationInProgress.current = true;
          setTimeout(() => {
            clearBattleState().finally(() => {
              router.replace("/user/multiplayer-mode-selection");
            });
          }, 2000);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [roomId, isLeaving, userId, clearBattleState]);

  useEffect(() => {
    if (
      roomData?.status === "finished" &&
      !isLeaving &&
      !navigationInProgress.current
    ) {
      navigationInProgress.current = true;
      setIsLeaving(true);

      const navigateToResults = async () => {
        try {
          const playerArray = await battleManager.endBattle(roomId as string);

          // FIXED: Clear battle state synchronously
          await clearBattleState();

          router.replace({
            pathname: "/user/battle-results",
            params: {
              roomId: roomId,
              players: JSON.stringify(playerArray || []),
              totalQuestions: roomData.totalQuestions?.toString() || "0",
              currentUserId: userId,
            },
          });
        } catch (error) {
          console.error("Navigate to results error:", error);
          await clearBattleState();
          router.replace("/user/multiplayer-mode-selection");
        }
      };

      navigateToResults();
    }
  }, [roomData?.status, userId, roomId, clearBattleState, isLeaving]);

  const otherWinnerAnnouncedRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const navigationInProgress = useRef(false);

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
    }
  }, [roomData?.players, userId]);

  useEffect(() => {
    if (serverOffset === 0) return;

    if (
      roomData &&
      roomData.status === "playing" &&
      roomData.questionStartedAt &&
      !roomData.questionTransition
    ) {
      // Clear any existing timer
      cleanupTimers();

      const startTime = roomData.questionStartedAt;
      const timeLimit = roomData.questionTimeLimit || 15;

      const updateTimer = () => {
        // Use server time instead of local device time
        const serverNow = Date.now() + serverOffset;
        const elapsed = Math.floor((serverNow - startTime) / 1000);
        const remaining = Math.max(0, timeLimit - elapsed);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          cleanupTimers();
          if (!timeExpiryHandled.current) {
            timeExpiryHandled.current = true;
            handleTimeExpiry();
          }
        }
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
    } else {
      cleanupTimers();
    }

    return cleanupTimers;
  }, [
    roomData?.questionStartedAt,
    roomData?.questionTransition,
    roomData?.status,
    cleanupTimers,
    handleTimeExpiry,
  ]);

  useEffect(() => {
    if (!roomData?.questionTransition) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [roomData?.currentQuestion, roomData?.questionTransition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      navigationInProgress.current = true; // Prevent any new navigation
      cleanupTimers();

      if (roomId && !isLeaving) {
        try {
          battleManager.removeRoomListener(roomId as string);
          battleManager
            .updatePlayerConnection(roomId as string, false)
            .catch(() => {});
        } catch (error) {
          console.error("Cleanup error:", error);
        }
      }

      // FIXED: Non-blocking cleanup
      clearBattleState().catch(console.error);
    };
  }, [roomId, cleanupTimers, clearBattleState, isLeaving]);

  // Replace confirmLeave function in battle-screen.tsx:
  const confirmLeave = useCallback(async () => {
    if (isLeaving || navigationInProgress.current) {
      console.log("Leave already in progress, ignoring");
      return;
    }

    console.log("Starting leave process");
    navigationInProgress.current = true;
    setIsLeaving(true);
    setShowLeaveModal(false);

    // Clear all timers immediately
    cleanupTimers();

    try {
      // FIXED: Remove listener first to prevent conflicts
      if (roomId) {
        battleManager.removeRoomListener(roomId as string);
      }

      const results =
        roomData?.status === "playing"
          ? await battleManager.leaveDuringBattle(roomId as string)
          : await battleManager.leaveRoom(roomId as string);

      // FIXED: Clear state synchronously
      await clearBattleState();

      // FIXED: Single navigation call
      const targetPath =
        roomData?.status === "playing"
          ? "/user/battle-results"
          : "/user/multiplayer-mode-selection";

      const params =
        roomData?.status === "playing"
          ? {
              roomId,
              players: JSON.stringify(results ?? []),
              totalQuestions: (roomData?.totalQuestions ?? 0).toString(),
              currentUserId: userId,
              endReason:
                roomData?.hostId === userId ? "host_left" : "player_left",
            }
          : {};

      router.replace({ pathname: targetPath, params });
    } catch (error) {
      console.error("[confirmLeave] error", error);
      await clearBattleState();
      router.replace("/user/multiplayer-mode-selection");
    }
  }, [isLeaving, roomId, roomData, userId, cleanupTimers, clearBattleState]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // FIXED: Only show modal if not already leaving or showing modal
        if (!isLeaving && !showLeaveModal && !navigationInProgress.current) {
          setShowLeaveModal(true);
        }
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => subscription.remove();
    }, [isLeaving, showLeaveModal])
  );

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
    if (!roomData?.questions || !userId || isAnswered || isProcessing) {
      return;
    }

    const currentQuestion = roomData.questions[roomData.currentQuestion];
    if (!currentQuestion) return;

    const normalizedAnswer = answer.trim().toLowerCase();
    const normalizedCorrect = currentQuestion.correctAnswer.toLowerCase();

    // Immediate feedback for wrong answers
    if (normalizedAnswer !== normalizedCorrect) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback("❌ Wrong answer, try again");
      setUserAnswer("");

      // Clear feedback after 2 seconds
      setTimeout(() => setFeedback(""), 2000);
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

      // Play appropriate sound
      if (isFirstCorrect) {
        await SoundManager.playSound("rightAnswerSoundEffect");
      }

      const pointsEarned = isFirstCorrect ? 1 : 0;

      // Set appropriate feedback
      if (isFirstCorrect) {
        setFeedback(`✅ Correct! You got it first! +${pointsEarned} point`);
      } else {
        setFeedback("✅ Correct! Someone else got it first.");
      }

      setIsAnswered(true);

      // Clear feedback after showing for a while
      setTimeout(() => setFeedback(""), 3000);
    } catch (error) {
      console.error("Answer submission error:", error);
      setFeedback("❌ Error submitting answer. Please try again.");
      setTimeout(() => setFeedback(""), 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const calculatePlayerScores = (players: { [key: string]: Player }) => {
    return Object.keys(players)
      .map((id) => ({
        userId: id,
        username: players[id].username || players[id].name || "Unknown Player",
        score: players[id].score || 0,
        avatar: players[id].avatar || 0,
        finalScore: players[id].score || 0,
      }))
      .sort((a, b) => b.score - a.score);
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

  // IMPROVED LOADING CONDITION
  if (!roomData && !networkError) {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">Loading battle...</Text>
      </View>
    );
  }

  if (roomData && roomData.status !== "playing") {
    return (
      <View className="flex-1 bg-primary justify-center items-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-2 text-sm">
          Status: {roomData.status}
        </Text>
      </View>
    );
  }

  if (!roomData?.questions || roomData.questions.length === 0) {
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
            <View className="flex-row items-center gap-2">
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
              <TouchableOpacity onPress={() => setShowLeaveModal(true)}>
                <View className="flex-row items-center bg-red-500 px-3 py-1 rounded-full">
                  <Text className="text-white text-sm font-black">Leave</Text>
                </View>
              </TouchableOpacity>
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
              placeholderTextColor="#555"
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
                  🏆 {typedPlayer.username || typedPlayer.name} got it right!
                  (+4 pt)
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

          {showNextQuestionCountdown && countdownValue > 0 && (
            <Text className="text-blue-500 text-center mt-4 font-bold">
              Next question in {countdownValue}s...
            </Text>
          )}
        </View>
      </ScrollView>
      <LeaveConfirmationModal
        visible={showLeaveModal}
        onCancel={() => setShowLeaveModal(false)}
        onConfirm={confirmLeave}
      />
    </View>
  );
}
