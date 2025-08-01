import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import ViewShot from "react-native-view-shot";
import { auth, database } from "../../firebase/firebaseConfig";
import { ref, get, remove } from "firebase/database";
import Share from "react-native-share";
import * as FileSystem from "expo-file-system";
import SoundManager from "../../components/soundManager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { battleManager } from "../../utils/battleManager";

const logo = require("../../assets/branding/tezmaths-full-logo.png");

interface PlayerData {
  name?: string;
  username?: string;
  avatar?: number | string;
  score?: number | string;
  userId?: string;
  isHost?: boolean;
  ready?: boolean;
  connected?: boolean;
}

interface BattlePlayer {
  userId: string;
  username: string;
  avatar: number;
  score: number;
}

interface UserData {
  avatar: number;
  username: string;
}

interface BattleDataState {
  players: BattlePlayer[];
  totalQuestions: number;
  userRank: number;
  userScore: number;
  isValid: boolean;
}

const shareConfig = {
  additionalText:
    "🧮 Discover TezMaths - the ultimate free math-boosting app! Features multiple quizzes, proven tricks, comprehensive guides, and so much more to supercharge your mathematical skills! 🚀",
  playStoreLink:
    "https://play.google.com/store/apps/details?id=com.tezmathsteam.tezmaths",
  downloadText:
    "📲 Download TezMaths now and unlock your mathematical potential!",
  hashtags:
    "#TezMaths #MathQuiz #BrainTraining #Education #MathSkills #LearningApp #FreeApp",
};

const avatarImages = (avatar: number | string) => {
  const avatarNumber = Number(avatar) || 0;
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

// 🧹 COMPREHENSIVE cleanup keys
const ALL_BATTLE_KEYS = [
  "battleResults",
  "currentBattleRoom",
  "battleState",
  "lastBattleResult",
  "pendingBattle",
  "battleInProgress",
  "roomData",
  "currentBattle",
  "battleCompleted",
  "roomId",
  "currentRoom",
  "joinedRoom",
  "hostingRoom",
  "playersData",
  "gameState",
  "battleSession",
  "activeBattle",
  "battleMode",
  "multiplayerState",
  "pendingNavigation",
  "battleRoute",
  "gameRoute",
  "tempBattleData",
  "cachedBattleResult",
  "battleCache",
  "gameCache",
  "sessionData",
  "battleStarting",
  "gameStarting",
  "newBattle",
  "battleInitation",
];

// 🛡️ NAVIGATION BLOCKER
let navigationBlockerActive = false;

export default function BattleResultsScreen() {
  const params = useLocalSearchParams();
  const { roomId, players, totalQuestions, currentUserId } = params;

  // 📌 REFS for lifecycle management
  const viewShotRef = useRef<ViewShot>(null);
  const cleanupExecuted = useRef(false);
  const navigationInProgress = useRef(false);
  const soundPlayed = useRef(false);
  const dataValidated = useRef(false);
  const componentMounted = useRef(true);
  const originalRouterReplace = useRef(router.replace);
  const originalRouterPush = useRef(router.push);

  // 📊 STATE management
  const [isSharing, setIsSharing] = useState(false);
  const [userData, setUserData] = useState<UserData>({
    avatar: 0,
    username: "player",
  });
  const [battleData, setBattleData] = useState<BattleDataState>({
    players: [],
    totalQuestions: 0,
    userRank: 0,
    userScore: 0,
    isValid: false,
  });
  const [isNavigating, setIsNavigating] = useState(false);

  // 🔒 COMPONENT LIFECYCLE & NAVIGATION CONTROL
  useEffect(() => {
    componentMounted.current = true;
    cleanupExecuted.current = false;
    navigationInProgress.current = false;
    soundPlayed.current = false;
    dataValidated.current = false;
    navigationBlockerActive = true;

    console.log("🔍 BattleResults mounted - Navigation protection active");

    // 🚨 BLOCK ALL AUTOMATIC NAVIGATION
    const blockNavigation = (...args: any[]) => {
      console.log("🚫 BLOCKED automatic navigation attempt:", args);
      console.trace("Navigation blocked from:");
      return Promise.resolve();
    };

    // Override router methods to block unwanted navigation
    router.replace = blockNavigation as any;
    router.push = blockNavigation as any;

    // 🧹 IMMEDIATE cache cleanup
    AsyncStorage.multiRemove(ALL_BATTLE_KEYS).catch(console.warn);

    return () => {
      componentMounted.current = false;
      navigationBlockerActive = false;

      // Restore original router methods
      router.replace = originalRouterReplace.current;
      router.push = originalRouterPush.current;

      console.log("🔓 Navigation protection removed");
    };
  }, []);

  // 🔍 PARAMETER VALIDATION (without auto-redirect)
  useEffect(() => {
    if (dataValidated.current) return;
    dataValidated.current = true;

    const validateAndSetupData = () => {
      try {
        console.log("🔍 Validating battle parameters");
        console.log("Received params:", {
          roomId,
          players,
          currentUserId,
          totalQuestions,
        });

        // Create fallback data for missing/invalid parameters
        if (!roomId || !players || !currentUserId || !totalQuestions) {
          console.log("⚠️ Missing parameters - using fallback data");
          setBattleData({
            players: [
              {
                userId: currentUserId || "fallback_user",
                username: "You",
                avatar: 0,
                score: 0,
              },
            ],
            totalQuestions: 10,
            userRank: 1,
            userScore: 0,
            isValid: true,
          });
          return;
        }

        // Parse and validate players data
        let parsedPlayers: any;
        try {
          const playersStr = Array.isArray(players) ? players : players;
          parsedPlayers = JSON.parse(playersStr);
        } catch (parseError) {
          console.error("❌ JSON parsing failed:", parseError);
          setBattleData({
            players: [
              {
                userId: Array.isArray(currentUserId)
                  ? currentUserId
                  : currentUserId,
                username: "You",
                avatar: 0,
                score: 0,
              },
            ],
            totalQuestions: 10,
            userRank: 1,
            userScore: 0,
            isValid: true,
          });
          return;
        }

        // Process players data
        let processedPlayers: BattlePlayer[] = [];

        if (Array.isArray(parsedPlayers)) {
          processedPlayers = parsedPlayers.map(
            (player: any, index: number) => ({
              userId: player.userId || `player_${index}`,
              username: player.name || player.username || "Unknown Player",
              avatar:
                typeof player.avatar === "number"
                  ? player.avatar
                  : parseInt(String(player.avatar)) || 0,
              score:
                typeof player.score === "number"
                  ? player.score
                  : parseInt(String(player.score)) || 0,
            })
          );
        } else if (
          typeof parsedPlayers === "object" &&
          parsedPlayers !== null
        ) {
          processedPlayers = Object.entries(parsedPlayers).map(
            ([userId, playerData]) => {
              const player = playerData as PlayerData;
              return {
                userId,
                username: player.name || player.username || "Unknown Player",
                avatar:
                  typeof player.avatar === "number"
                    ? player.avatar
                    : parseInt(String(player.avatar)) || 0,
                score:
                  typeof player.score === "number"
                    ? player.score
                    : parseInt(String(player.score)) || 0,
              };
            }
          );
        }

        if (processedPlayers.length === 0) {
          processedPlayers = [
            {
              userId: Array.isArray(currentUserId)
                ? currentUserId
                : currentUserId,
              username: "You",
              avatar: 0,
              score: 0,
            },
          ];
        }

        // Calculate rankings
        processedPlayers.sort((a, b) => b.score - a.score);
        let userIndex = processedPlayers.findIndex(
          (p) =>
            p.userId ===
            (Array.isArray(currentUserId) ? currentUserId : currentUserId)
        );

        if (userIndex === -1) {
          processedPlayers.push({
            userId: Array.isArray(currentUserId)
              ? currentUserId
              : currentUserId,
            username: "You",
            avatar: 0,
            score: 0,
          });
          processedPlayers.sort((a, b) => b.score - a.score);
          userIndex = processedPlayers.findIndex(
            (p) =>
              p.userId ===
              (Array.isArray(currentUserId) ? currentUserId : currentUserId)
          );
        }

        const userRank = userIndex + 1;
        const userScore = processedPlayers[userIndex].score;
        const totalQuestionsCount =
          parseInt(
            Array.isArray(totalQuestions)
              ? totalQuestions
              : totalQuestions || "10"
          ) || 10;

        // Set valid battle data
        setBattleData({
          players: processedPlayers,
          totalQuestions: totalQuestionsCount,
          userRank,
          userScore,
          isValid: true,
        });

        console.log("✅ Battle data validated successfully");

        // Start background cleanup after delay
        setTimeout(() => {
          if (componentMounted.current && !cleanupExecuted.current) {
            performBackgroundCleanup();
          }
        }, 3000);
      } catch (error) {
        console.error("❌ Validation error:", error);
        // Set fallback data even on error
        setBattleData({
          players: [
            {
              userId: "error_user",
              username: "You",
              avatar: 0,
              score: 0,
            },
          ],
          totalQuestions: 10,
          userRank: 1,
          userScore: 0,
          isValid: true,
        });
      }
    };

    validateAndSetupData();
  }, [roomId, players, currentUserId, totalQuestions]);

  // 🧹 BACKGROUND CLEANUP (non-blocking)
  const performBackgroundCleanup = useCallback(async () => {
    if (cleanupExecuted.current || !componentMounted.current) return;
    cleanupExecuted.current = true;

    console.log("🔄 Starting background cleanup");

    try {
      const user = auth.currentUser;
      if (!user?.uid || !roomId) return;

      // Update connection status only
      if (typeof battleManager.updatePlayerConnection === "function") {
        await battleManager.updatePlayerConnection(roomId, false);
      }

      // Safe room cleanup for host
      try {
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);

        if (snapshot.exists()) {
          const roomData = snapshot.val();

          if (roomData.hostId === user.uid && roomData.status === "finished") {
            const otherPlayersConnected = Object.entries(roomData.players || {})
              .filter(([playerId]) => playerId !== user.uid)
              .some(([, player]: [string, any]) => player.connected);

            if (!otherPlayersConnected) {
              await remove(roomRef);
              console.log("🗑️ Room cleaned up by host");
            }
          }
        }
      } catch (dbError) {
        console.warn("Database cleanup warning:", dbError);
      }

      console.log("✅ Background cleanup completed");
    } catch (error) {
      console.warn("Background cleanup error:", error);
    }
  }, [roomId]);

  // 👤 LOAD USER DATA
  useEffect(() => {
    AsyncStorage.getItem("userData")
      .then((cachedData) => {
        if (cachedData && componentMounted.current) {
          setUserData(JSON.parse(cachedData));
        }
      })
      .catch(console.warn);
  }, []);

  // 🔒 BLOCK HARDWARE BACK BUTTON
  useFocusEffect(
    useCallback(() => {
      const handleBackPress = () => {
        console.log("🚫 Hardware back button blocked - use Home button");
        return true; // Block back navigation
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        handleBackPress
      );
      return () => backHandler.remove();
    }, [])
  );

  // 🎵 VICTORY SOUND MANAGEMENT
  useFocusEffect(
    useCallback(() => {
      if (
        battleData.isValid &&
        battleData.userRank === 1 &&
        !soundPlayed.current
      ) {
        soundPlayed.current = true;
        SoundManager.playSound("victorySoundEffect").catch(console.warn);
      }

      return () => {
        if (soundPlayed.current) {
          SoundManager.stopSound("victorySoundEffect").catch(console.warn);
        }
      };
    }, [battleData.isValid, battleData.userRank])
  );

  // 🏠 CONTROLLED HOME NAVIGATION
  const handleHomeNavigation = useCallback(async () => {
    if (isNavigating || navigationInProgress.current) {
      console.log("⏳ Navigation already in progress");
      return;
    }

    console.log("🏠 Starting controlled home navigation");
    setIsNavigating(true);
    navigationInProgress.current = true;

    try {
      // Restore original router methods for controlled navigation
      router.replace = originalRouterReplace.current;
      router.push = originalRouterPush.current;

      // Navigate immediately
      await router.replace("/user/home");
      console.log("✅ Navigation to home completed");

      // Background cleanup (don't block navigation)
      setTimeout(async () => {
        if (!componentMounted.current) return;

        try {
          const user = auth.currentUser;
          if (roomId && user?.uid) {
            // All battleManager cleanup functions
            const cleanupPromises = [
              battleManager.updatePlayerConnection?.(roomId, false),
              battleManager.leaveRoom?.(roomId),
              battleManager.resetUserBattleState?.(),
              battleManager.clearBattleCache?.(),
              battleManager.resetGameState?.(),
              battleManager.cleanupBattleData?.(),
              battleManager.disconnectFromRoom?.(roomId),
              battleManager.resetMultiplayerState?.(),
              battleManager.cleanup?.(),
              battleManager.reset?.(),
            ].filter((promise) => promise !== undefined);

            await Promise.allSettled(cleanupPromises);
          }

          // Complete AsyncStorage cleanup
          const allKeys = await AsyncStorage.getAllKeys();
          const battleKeys = allKeys.filter(
            (key) =>
              key.includes("battle") ||
              key.includes("room") ||
              key.includes("result") ||
              key.includes("game") ||
              key.includes("quiz") ||
              key.includes("session") ||
              key.includes("multiplayer") ||
              key.includes("cache")
          );
          const allKeysToRemove = [
            ...new Set([...battleKeys, ...ALL_BATTLE_KEYS]),
          ];
          await AsyncStorage.multiRemove(allKeysToRemove);

          // Sound cleanup
          await SoundManager.stopSound("victorySoundEffect").catch(() => {});

          console.log("✅ Post-navigation cleanup completed");
        } catch (error) {
          console.warn("Post-navigation cleanup error:", error);
        }
      }, 100);
    } catch (error) {
      console.warn("Navigation error:", error);
      // Force navigation with fallback method
      try {
        router.push("/user/home");
      } catch (fallbackError) {
        console.error("Fallback navigation failed:", fallbackError);
      }
    } finally {
      setIsNavigating(false);
      navigationInProgress.current = false;
    }
  }, [roomId, isNavigating]);

  // 🖼️ RENDER FUNCTIONS
  const renderProfileImages = () => {
    if (!battleData.isValid || !battleData.players.length) return null;

    const elements = [];
    battleData.players.forEach((player, index) => {
      elements.push(
        <View key={`player-${player.userId}-${index}`} className="items-center">
          <View className="rounded-full bg-gray-300 items-center justify-center border-2 border-primary">
            <Image
              source={avatarImages(player.avatar)}
              className="w-full h-full rounded-full"
              style={{ width: 48, height: 48 }}
              resizeMode="cover"
            />
          </View>
          <Text className="text-xs mt-1 text-center max-w-16" numberOfLines={1}>
            {player.username}
          </Text>
        </View>
      );

      if (index < battleData.players.length - 1) {
        elements.push(
          <View key={`sword-${index}`} className="items-center justify-center">
            <Image
              source={require("../../assets/icons/swords.png")}
              style={{ width: 12, height: 12 }}
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

  const getMotivationalQuote = () => {
    const quotes = [
      "Victory is earned through sharp minds!",
      "Every battle makes you stronger!",
      "Second place is just the first step to first!",
      "Keep fighting, greatness awaits!",
      "Math battles build champions!",
    ];

    // Return individual quotes based on rank
    if (battleData.userRank === 1) return quotes[0];
    if (battleData.userRank === 2) return quotes[1];
    if (battleData.userRank === 3) return quotes[2];
    if (battleData.userRank <= battleData.players.length / 2) return quotes[3];
    return quotes[4];
  };

  const getShareMessage = () => {
    return `${shareConfig.additionalText}

🏆 I ranked #${battleData.userRank} with ${
      battleData.userScore
    } points in a math battle!
"${getMotivationalQuote()}"

🎯 Use my referral code: ${userData.username.toUpperCase()}
👆 Get bonus points when you sign up!

${shareConfig.playStoreLink}

${shareConfig.downloadText}

${shareConfig.hashtags}`;
  };

  const shareImageAndText = async () => {
    if (isSharing) return;

    setIsSharing(true);
    try {
      if (!viewShotRef.current) throw new Error("ViewShot ref not available");

      const uri = await viewShotRef.current.capture();
      const timestamp = Date.now();
      const newUri = `${FileSystem.documentDirectory}tezmaths_battle_result_${timestamp}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: newUri });

        await Share.open({
          title: "Check this out!",
          message: getShareMessage(),
          url: newUri,
          type: "image/jpeg",
        });
    } catch (error: any) {
      console.error("Share error:", error);
      Alert.alert("Sharing failed", error.message || "Something went wrong.");
    } finally {
      setIsSharing(false);
    }
  };

  // 🎨 RENDER UI
  return (
    <ScrollView
      className="bg-white"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-1 bg-white justify-center items-center p-4">
        <ViewShot
          ref={viewShotRef}
          options={{
            format: "png",
            quality: 0.9,
            result: "tmpfile",
            snapshotContentContainer: false,
          }}
          style={{ backgroundColor: "white" }}
        >
          <View
            collapsable={false}
            className="bg-custom-gray border-4 border-white p-4 rounded-3xl shadow-xl w-full"
            style={{
              backgroundColor: "#f5f5f5",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 4.65,
              elevation: 8,
            }}
          >
            <Text className="text-3xl font-bold text-black text-center mb-6">
              Battle With Friends
            </Text>

            <View className="mb-6">
              <Text className="text-2xl font-bold text-center">
                {battleData.userRank === 1
                  ? "🏆 You Won!"
                  : `You Ranked #${battleData.userRank}`}
              </Text>
              <Text className="text-xl text-center">
                Your Score: {battleData.userScore} pts
              </Text>
              <Text className="text-lg text-center italic mt-2">
                "{getMotivationalQuote()}"
              </Text>
            </View>

            {renderProfileImages()}

            <Text className="text-2xl text-black font-bold text-center mx-auto w-full mb-2">
              Battle Score
            </Text>

            <ScrollView className="w-full mb-4">
              {battleData.players.map((player, index) => (
                <View
                  key={`score-${player.userId}-${index}`}
                  className={`flex-row justify-between items-center w-full p-4 py-2 rounded-lg mb-2 bg-light-orange ${
                    player.userId ===
                    (Array.isArray(currentUserId)
                      ? currentUserId
                      : currentUserId)
                      ? "border-2 border-primary"
                      : "border-transparent border-2"
                  }`}
                >
                  <Text className="text-xl font-bold">
                    {index + 1}. {player.username}
                    {player.userId ===
                    (Array.isArray(currentUserId)
                      ? currentUserId
                      : currentUserId)
                      ? " (You)"
                      : ""}
                  </Text>
                  <Text className="text-xl">{player.score} pts</Text>
                </View>
              ))}
            </ScrollView>

            <Text className="text-2xl mt-2 mb-2 font-black text-center text-white py-2 px-4 mx-auto bg-primary rounded-xl">
              Download Now
            </Text>

            <View className="items-center mb-8 mt-3">
              <Image source={logo} style={{ height: 30, width: 140 }} />
              <Text className="text-black text-center">
                Sharpen your speed, master your math!
              </Text>
            </View>
          </View>
        </ViewShot>

        <View className="flex-row justify-between mt-6 w-full max-w-md">
          <TouchableOpacity
            className="py-3 px-6 border border-black rounded-full flex-1 mr-1"
            onPress={handleHomeNavigation}
            disabled={isNavigating}
            activeOpacity={0.7}
            style={{ opacity: isNavigating ? 0.6 : 1 }}
          >
            <View className="flex-row items-center justify-center gap-2">
              {isNavigating ? (
                <ActivityIndicator color="#FF6B35" size="small" />
              ) : (
                <>
                  <Text className="font-black text-2xl">Home</Text>
                  <Image
                    source={require("../../assets/icons/home.png")}
                    style={{ width: 20, height: 20 }}
                    tintColor="#FF6B35"
                  />
                </>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            className="py-3 px-6 border border-black rounded-full flex-1 ml-1"
            onPress={shareImageAndText}
            disabled={isSharing || isNavigating}
            activeOpacity={0.7}
            style={{ opacity: isSharing || isNavigating ? 0.6 : 1 }}
          >
            {isSharing ? (
              <ActivityIndicator color="#FF6B35" />
            ) : (
              <View className="flex-row items-center justify-center gap-2">
                <Text className="font-black text-2xl">Share</Text>
                <Image
                  source={require("../../assets/icons/share.png")}
                  style={{ width: 20, height: 20 }}
                  tintColor="#FF6B35"
                />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text className="text-primary text-sm mt-3">
          TezMaths - Sharpen Your Speed
        </Text>
      </View>
    </ScrollView>
  );
}
