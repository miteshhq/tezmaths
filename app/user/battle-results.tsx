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
const logo = require("../../assets/branding/tezmaths-full-logo.png");
import AsyncStorage from "@react-native-async-storage/async-storage";
import { battleManager } from "../../utils/battleManager";

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

const SafeNavigationWrapper = ({ children, onError }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (error) => {
      console.error("Navigation error caught:", error);
      setHasError(true);
      onError?.(error);
    };

    // Add error listener
    const originalConsoleError = console.error;
    console.error = (...args) => {
      if (args[0]?.includes?.("navigation") || args[0]?.includes?.("router")) {
        errorHandler(args[0]);
      }
      originalConsoleError(...args);
    };

    return () => {
      console.error = originalConsoleError;
    };
  }, [onError]);

  if (hasError) {
    return (
      <View className="flex-1 justify-center items-center p-4">
        <Text className="text-lg mb-4">Navigation Error</Text>
        <TouchableOpacity
          className="bg-primary px-6 py-3 rounded-xl"
          onPress={() => {
            setHasError(false);
            router.replace("/user/home");
          }}
        >
          <Text className="text-white font-bold">Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return children;
};

export default function BattleResultsScreen() {
  const params = useLocalSearchParams();
  const { roomId, players, totalQuestions, currentUserId } = params;

  const viewShotRef = useRef<ViewShot>(null);
  const cleanupExecuted = useRef(false);
  const navigationInProgress = useRef(false);
  const soundPlayed = useRef(false);
  const navigationLock = useRef(false);
  const cleanupCompleted = useRef(false);

  // State management
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
  const [errorMessage, setErrorMessage] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);

  const handleNavigationError = useCallback((error: any) => {
    console.error("Battle results navigation error:", error);
    // Force navigation as fallback
    setTimeout(() => {
      router.replace("/user/home");
    }, 2000);
  }, []);

  // ENHANCED CLEANUP: Complete battle state reset
  const performCleanup = useCallback(async () => {
    console.log("Battle results cleanup starting");

    try {
      const user = auth.currentUser;
      const userId = user?.uid;

      if (roomId && userId) {
        // Update player connection status
        await battleManager.updatePlayerConnection(roomId, false);

        // Check if we should clean up the room
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);

        if (snapshot.exists()) {
          const roomData = snapshot.val();

          // If we're the host and room is finished, clean it up
          if (roomData.hostId === userId && roomData.status === "finished") {
            const playersStillConnected = Object.values(
              roomData.players || {}
            ).some((player: any) => player.connected);

            if (!playersStillConnected) {
              await remove(roomRef);
              console.log("Room cleaned up by host");
            }
          } else {
            // Just leave the room
            await battleManager.leaveRoom(roomId);
          }
        }
      }

      // CRITICAL: Reset all battle manager state
      await battleManager.resetUserBattleState();

      console.log("Battle results cleanup completed");
    } catch (error) {
      console.error("Battle results cleanup error:", error);
    }
  }, [roomId]);

  useEffect(() => {
    const validateBattleData = () => {
      try {
        // Check required parameters
        if (!roomId || !players || !currentUserId) {
          setErrorMessage("Battle data incomplete. Returning to menu...");
          setTimeout(() => {
            router.replace("/user/multiplayer-mode-selection");
          }, 1000);
          return;
        }

        // Parse players data with better error handling
        let parsedPlayers: any[] = [];
        try {
          const playersData = JSON.parse(
            Array.isArray(players) ? players[0] : players
          );

          if (Array.isArray(playersData)) {
            parsedPlayers = playersData;
          } else if (typeof playersData === "object" && playersData !== null) {
            parsedPlayers = Object.entries(playersData).map(
              ([userId, playerData]) => {
                const player = playerData as PlayerData;
                return {
                  userId: userId,
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
          } else {
            throw new Error("Invalid players data format");
          }
        } catch (parseError) {
          console.error("Error parsing players data:", parseError);

          parsedPlayers = [
            {
              userId: currentUserId,
              username: "You",
              avatar: 0,
              score: 0,
            },
          ];
        }

        if (!Array.isArray(parsedPlayers) || parsedPlayers.length === 0) {
          parsedPlayers = [
            {
              userId: currentUserId,
              username: "You",
              avatar: 0,
              score: 0,
            },
          ];
        }

        const processedPlayers: BattlePlayer[] = parsedPlayers.map(
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

        // Sort players by score (highest first)
        processedPlayers.sort((a, b) => b.score - a.score);

        // Find current user's rank and score
        let userIndex = processedPlayers.findIndex(
          (p) =>
            p.userId ===
            (Array.isArray(currentUserId) ? currentUserId[0] : currentUserId)
        );

        if (userIndex === -1) {
          processedPlayers.push({
            userId: Array.isArray(currentUserId)
              ? currentUserId[0]
              : currentUserId,
            username: "You",
            avatar: 0,
            score: 0,
          });
          processedPlayers.sort((a, b) => b.score - a.score);
          userIndex = processedPlayers.findIndex(
            (p) =>
              p.userId ===
              (Array.isArray(currentUserId) ? currentUserId[0] : currentUserId)
          );
        }

        const userRank = userIndex + 1;
        const userScore = processedPlayers[userIndex].score;

        setBattleData({
          players: processedPlayers,
          totalQuestions:
            parseInt(
              Array.isArray(totalQuestions)
                ? totalQuestions[0]
                : totalQuestions || "0"
            ) || 0,
          userRank,
          userScore,
          isValid: true,
        });
      } catch (error) {
        console.error("Error validating battle data:", error);

        setBattleData({
          players: [
            {
              userId: Array.isArray(currentUserId)
                ? currentUserId[0]
                : currentUserId,
              username: "You",
              avatar: 0,
              score: 0,
            },
          ],
          totalQuestions:
            parseInt(
              Array.isArray(totalQuestions)
                ? totalQuestions[0]
                : totalQuestions || "0"
            ) || 0,
          userRank: 1,
          userScore: 0,
          isValid: true,
        });
      }
    };

    validateBattleData();
  }, [roomId, players, currentUserId, totalQuestions]);

  // Load user data
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

  useFocusEffect(
    useCallback(() => {
      if (
        battleData.isValid &&
        battleData.userRank === 1 &&
        !soundPlayed.current
      ) {
        soundPlayed.current = true;
        SoundManager.playSound("victorySoundEffect").catch(() => {});
      }

      return () => {
        if (soundPlayed.current) {
          SoundManager.stopSound("victorySoundEffect").catch(() => {});
        }
      };
    }, [battleData.isValid, battleData.userRank])
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (!navigationInProgress.current) {
          handleHomeNavigation();
        }
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => backHandler.remove();
    }, [])
  );

  const handleHomeNavigation = useCallback(async () => {
    if (navigationLock.current) {
      console.log("Navigation already in progress, ignoring");
      return;
    }

    navigationLock.current = true;
    setIsNavigating(true);

    try {
      console.log("Starting home navigation with cleanup");

      // ENHANCED: Check if user is still in an active battle
      if (roomId) {
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);

        if (snapshot.exists()) {
          const roomData = snapshot.val();
          const userId = auth.currentUser?.uid;

          // If battle is still active and user is still connected, just disconnect them
          if (
            roomData.status === "playing" &&
            roomData.players?.[userId]?.connected
          ) {
            console.log("User still in active battle, disconnecting cleanly");
            await battleManager.updatePlayerConnection(roomId, false);

            // Small delay to ensure disconnection is processed
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      // Perform comprehensive cleanup
      if (!cleanupCompleted.current) {
        await performCleanup();
        cleanupCompleted.current = true;
      }

      // Additional cleanup: Clear any remaining battle state
      await AsyncStorage.multiRemove([
        "currentBattleId",
        "battleState",
        "battleResults",
        "lastBattleScore",
        "battleProgress",
        "roomData",
        "battleQuestions",
      ]);

      // Small delay to ensure all cleanup completes
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Navigate with replace to prevent back navigation
      router.replace("/user/home");
    } catch (error) {
      console.warn("Navigation cleanup error:", error);
      // Always navigate even if cleanup fails
      router.replace("/user/home");
    } finally {
      // Reset locks after navigation
      setTimeout(() => {
        navigationLock.current = false;
        setIsNavigating(false);
      }, 1000);
    }
  }, [performCleanup, roomId]);

  useEffect(() => {
    return () => {
      if (!cleanupCompleted.current) {
        performCleanup().catch(console.error);
      }
    };
  }, [performCleanup]);

  // Render profile images
  const renderProfileImages = () => {
    if (!battleData.isValid || battleData.players.length === 0) return null;

    const elements = [];
    battleData.players.forEach((player, index) => {
      elements.push(
        <View key={`player-${player.userId}`} className="items-center">
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
    if (battleData.userRank === 1) return quotes[0];
    if (battleData.userRank === 2) return quotes[1];
    if (battleData.userRank === 3) return quotes[2];
    if (battleData.userRank <= battleData.players.length / 2) return quotes[3];
    return quotes[4];
  };

  const getShareMessage = () => {
    const shareMessage = `${shareConfig.additionalText}
  
  🏆 I ranked #${battleData.userRank} with ${
      battleData.userScore
    } points in a math battle!
  "${getMotivationalQuote()}"
  
  🎯 Use my referral code: ${userData.username.toUpperCase()}
  👆 Get bonus points when you sign up!
  
  ${shareConfig.playStoreLink}
  
  ${shareConfig.downloadText}
  
  ${shareConfig.hashtags}`;

    return shareMessage;
  };

  const shareImageAndText = async () => {
    setIsSharing(true);
    try {
      // Capture the image from ViewShot
      if (!viewShotRef.current) throw new Error("ViewShot ref not available");
      const uri = await viewShotRef.current.capture();

      // Save image to file system
      const timestamp = Date.now();
      const newUri = `${FileSystem.documentDirectory}tezmaths_battle_result_${timestamp}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: newUri });

      // Use react-native-share for proper image + text sharing
      const shareOptions = {
        title: "Check this out!",
        message: getShareMessage(),
        url: newUri, // Share the captured image URI
        type: "image/jpeg",
      };

      await Share.open(shareOptions);
    } catch (error: any) {
      Alert.alert("Sharing failed", error.message || "Something went wrong.");
      console.error("Share error:", error);
    } finally {
      setIsSharing(false);
    }
  };

  if (!battleData.isValid) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text className="text-lg mt-4">Loading results...</Text>
      </View>
    );
  }

  return (
    <SafeNavigationWrapper onError={handleNavigationError}>
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
                    key={player.userId}
                    className={`flex-row justify-between items-center w-full p-4 py-2 rounded-lg mb-2 bg-light-orange ${
                      player.userId ===
                      (Array.isArray(currentUserId)
                        ? currentUserId[0]
                        : currentUserId)
                        ? "border-2 border-primary"
                        : "border-transparent border-2"
                    }`}
                  >
                    <Text className="text-xl font-bold">
                      {index + 1}. {player.username}
                      {player.userId ===
                      (Array.isArray(currentUserId)
                        ? currentUserId[0]
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
              className={`py-3 px-6 border-2 rounded-full flex-1 mr-1 ${
                isNavigating
                  ? "border-gray-400 bg-gray-100"
                  : "border-primary bg-white hover:bg-primary hover:border-white"
              }`}
              onPress={handleHomeNavigation}
              disabled={isNavigating || navigationLock.current}
              activeOpacity={0.7}
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              {isNavigating ? (
                <View className="flex-row items-center justify-center gap-2">
                  <ActivityIndicator color="#FF6B35" size="small" />
                  <Text className="font-black text-lg text-primary">
                    Loading...
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center justify-center gap-2">
                  <Text className="font-black text-2xl text-primary">Home</Text>
                  <Image
                    source={require("../../assets/icons/home.png")}
                    style={{ width: 20, height: 20 }}
                    tintColor="#FF6B35"
                  />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 px-6 border border-black rounded-full flex-1 ml-1"
              onPress={shareImageAndText}
              disabled={isSharing}
              activeOpacity={0.7}
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
    </SafeNavigationWrapper>
  );
}
