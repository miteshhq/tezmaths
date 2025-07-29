import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
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

// Memoized ProfileImage component to prevent unnecessary re-renders
const ProfileImage = React.memo(({ player, isCurrentUser }) => {
  return (
    <View className="items-center">
      <View className="rounded-full bg-gray-300 items-center justify-center border-2 border-primary">
        <Image
          source={avatarImages(player.avatar)}
          className="w-full h-full rounded-full"
          style={{ width: 48, height: 48 }}
          resizeMode="cover"
          fadeDuration={0}
        />
      </View>
      <Text className="text-xs mt-1 text-center max-w-16" numberOfLines={1}>
        {player.username}
      </Text>
    </View>
  );
});

export default function BattleResultsScreen() {
  const params = useLocalSearchParams();
  const { roomId, players, totalQuestions, currentUserId } = params;

  const viewShotRef = useRef<ViewShot>(null);
  const soundPlayed = useRef(false);
  const cleanupScheduled = useRef(false);
  const componentMounted = useRef(true);

  // Store all data locally immediately
  const [localBattleData, setLocalBattleData] = useState<BattleDataState>({
    players: [],
    totalQuestions: 0,
    userRank: 0,
    userScore: 0,
    isValid: false,
  });

  const [localUserData, setLocalUserData] = useState<UserData>({
    avatar: 0,
    username: "player",
  });

  const [isSharing, setIsSharing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Store cleanup data for background processing
  const cleanupData = useRef({
    roomId: Array.isArray(roomId) ? roomId[0] : roomId,
    currentUserId: Array.isArray(currentUserId)
      ? currentUserId[0]
      : currentUserId,
  });

  // Immediate data processing and local storage
  useEffect(() => {
    const processAndStoreData = async () => {
      try {
        // 1. Load user data from cache immediately
        try {
          const cachedUserData = await AsyncStorage.getItem("userData");
          if (cachedUserData) {
            const userData = JSON.parse(cachedUserData);
            setLocalUserData(userData);
          }
        } catch (error) {
          console.error("Error loading user data:", error);
        }

        // 2. Process battle data immediately
        if (!roomId || !players || !currentUserId) {
          setErrorMessage("Battle data incomplete");
          return;
        }

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
          }
        } catch (parseError) {
          console.error("Error parsing players data:", parseError);
          parsedPlayers = [
            {
              userId: cleanupData.current.currentUserId,
              username: "You",
              avatar: 0,
              score: 0,
            },
          ];
        }

        if (!Array.isArray(parsedPlayers) || parsedPlayers.length === 0) {
          parsedPlayers = [
            {
              userId: cleanupData.current.currentUserId,
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

        // Sort players by score
        processedPlayers.sort((a, b) => b.score - a.score);

        // Find user rank
        let userIndex = processedPlayers.findIndex(
          (p) => p.userId === cleanupData.current.currentUserId
        );

        if (userIndex === -1) {
          processedPlayers.push({
            userId: cleanupData.current.currentUserId,
            username: "You",
            avatar: 0,
            score: 0,
          });
          processedPlayers.sort((a, b) => b.score - a.score);
          userIndex = processedPlayers.findIndex(
            (p) => p.userId === cleanupData.current.currentUserId
          );
        }

        const userRank = userIndex + 1;
        const userScore = processedPlayers[userIndex].score;

        // Set all data locally
        setLocalBattleData({
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

        setIsReady(true);

        // Schedule cleanup for later (non-blocking)
        if (!cleanupScheduled.current) {
          cleanupScheduled.current = true;
          scheduleBackgroundCleanup();
        }
      } catch (error) {
        console.error("Error processing battle data:", error);
        setErrorMessage("Error loading battle results");
      }
    };

    processAndStoreData();
  }, [roomId, players, currentUserId, totalQuestions]);

  // Background cleanup (non-blocking)
  const scheduleBackgroundCleanup = useCallback(() => {
    // Use setTimeout to make it non-blocking
    setTimeout(async () => {
      try {
        const { roomId, currentUserId } = cleanupData.current;
        const user = auth.currentUser;
        const userId = user?.uid || currentUserId;

        if (roomId && userId) {
          // All cleanup operations in background
          const cleanupPromises = [
            battleManager
              .updatePlayerConnection(roomId, false)
              .catch(console.error),
            battleManager.resetUserBattleState().catch(console.error),
            AsyncStorage.multiRemove([
              "currentBattleId",
              "battleState",
              "battleResults",
              "lastBattleScore",
              "battleProgress",
              "roomData",
              "battleQuestions",
            ]).catch(console.error),
          ];

          // Handle room cleanup
          const roomCleanup = async () => {
            try {
              const roomRef = ref(database, `rooms/${roomId}`);
              const snapshot = await get(roomRef);

              if (snapshot.exists()) {
                const roomData = snapshot.val();
                if (
                  roomData.hostId === userId &&
                  roomData.status === "finished"
                ) {
                  const playersStillConnected = Object.values(
                    roomData.players || {}
                  ).some((player: any) => player.connected);

                  if (!playersStillConnected) {
                    await remove(roomRef);
                  }
                } else {
                  await battleManager.leaveRoom(roomId);
                }
              }
            } catch (error) {
              console.error("Room cleanup error:", error);
            }
          };

          cleanupPromises.push(roomCleanup());

          // Execute all cleanup operations
          await Promise.allSettled(cleanupPromises);
          console.log("Background cleanup completed");
        }
      } catch (error) {
        console.error("Background cleanup error:", error);
      }
    }, 100); // Small delay to ensure UI is ready
  }, []);

  // Simple, direct home navigation
  const handleHomeNavigation = useCallback(() => {
    try {
      // Direct navigation without any cleanup or waiting
      router.replace("/user/home");
    } catch (error) {
      console.error("Navigation error:", error);
      // Fallback navigation
      setTimeout(() => {
        router.push("/user/home");
      }, 100);
    }
  }, []);

  // Play victory sound when ready
  useEffect(() => {
    if (isReady && localBattleData.userRank === 1 && !soundPlayed.current) {
      soundPlayed.current = true;
      SoundManager.playSound("victorySoundEffect").catch(() => {});
    }
  }, [isReady, localBattleData.userRank]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      componentMounted.current = false;
      if (soundPlayed.current) {
        SoundManager.stopSound("victorySoundEffect").catch(() => {});
      }
    };
  }, []);

  // Handle back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleHomeNavigation();
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => backHandler.remove();
    }, [handleHomeNavigation])
  );

  // Memoized values using local data
  const processedPlayers = useMemo(() => {
    if (!localBattleData.isValid || localBattleData.players.length === 0)
      return [];
    return localBattleData.players.sort((a, b) => b.score - a.score);
  }, [localBattleData.players, localBattleData.isValid]);

  const motivationalQuote = useMemo(() => {
    const quotes = [
      "Victory is earned through sharp minds!",
      "Every battle makes you stronger!",
      "Second place is just the first step to first!",
      "Keep fighting, greatness awaits!",
      "Math battles build champions!",
    ];
    if (localBattleData.userRank === 1) return quotes[0];
    if (localBattleData.userRank === 2) return quotes[1];
    if (localBattleData.userRank === 3) return quotes[2];
    if (localBattleData.userRank <= localBattleData.players.length / 2)
      return quotes[3];
    return quotes[4];
  }, [localBattleData.userRank, localBattleData.players.length]);

  // Memoized profile images
  const renderProfileImages = useMemo(() => {
    if (!localBattleData.isValid || localBattleData.players.length === 0)
      return null;

    const elements = [];
    localBattleData.players.forEach((player, index) => {
      const isCurrentUser = player.userId === cleanupData.current.currentUserId;

      elements.push(
        <ProfileImage
          key={`player-${player.userId}`}
          player={player}
          isCurrentUser={isCurrentUser}
        />
      );

      if (index < localBattleData.players.length - 1) {
        elements.push(
          <View key={`sword-${index}`} className="items-center justify-center">
            <Image
              source={require("../../assets/icons/swords.png")}
              style={{ width: 12, height: 12 }}
              tintColor="#F05A2A"
              fadeDuration={0}
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
  }, [localBattleData.isValid, localBattleData.players]);

  const getShareMessage = useCallback(() => {
    const shareMessage = `${shareConfig.additionalText}
  
🏆 I ranked #${localBattleData.userRank} with ${
      localBattleData.userScore
    } points in a math battle!
"${motivationalQuote}"

🎯 Use my referral code: ${localUserData.username.toUpperCase()}
👆 Get bonus points when you sign up!

${shareConfig.playStoreLink}

${shareConfig.downloadText}

${shareConfig.hashtags}`;

    return shareMessage;
  }, [
    localBattleData.userRank,
    localBattleData.userScore,
    motivationalQuote,
    localUserData.username,
  ]);

  const shareImageAndText = async () => {
    setIsSharing(true);
    try {
      if (!viewShotRef.current) throw new Error("ViewShot ref not available");
      const uri = await viewShotRef.current.capture();

      const timestamp = Date.now();
      const newUri = `${FileSystem.documentDirectory}tezmaths_battle_result_${timestamp}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: newUri });

      const shareOptions = {
        title: "Check this out!",
        message: getShareMessage(),
        url: newUri,
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

  // Show loading while processing data
  if (!isReady) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text className="text-lg mt-4">Preparing results...</Text>
      </View>
    );
  }

  // Show error if data couldn't be processed
  if (errorMessage) {
    return (
      <View className="flex-1 bg-white justify-center items-center p-4">
        <Text className="text-lg mb-4 text-center">{errorMessage}</Text>
        <TouchableOpacity
          className="bg-primary px-6 py-3 rounded-xl"
          onPress={handleHomeNavigation}
        >
          <Text className="text-white font-bold">Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
                {localBattleData.userRank === 1
                  ? "🏆 You Won!"
                  : `You Ranked #${localBattleData.userRank}`}
              </Text>
              <Text className="text-xl text-center">
                Your Score: {localBattleData.userScore} pts
              </Text>
              <Text className="text-lg text-center italic mt-2">
                "{motivationalQuote}"
              </Text>
            </View>

            {renderProfileImages}

            <Text className="text-2xl text-black font-bold text-center mx-auto w-full mb-2">
              Battle Score
            </Text>

            <ScrollView className="w-full mb-4">
              {processedPlayers.map((player, index) => (
                <View
                  key={player.userId}
                  className={`flex-row justify-between items-center w-full p-4 py-2 rounded-lg mb-2 bg-light-orange ${
                    player.userId === cleanupData.current.currentUserId
                      ? "border-2 border-primary"
                      : "border-transparent border-2"
                  }`}
                >
                  <Text className="text-xl font-bold">
                    {index + 1}. {player.username}
                    {player.userId === cleanupData.current.currentUserId
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
            className="py-3 px-6 border-2 rounded-full flex-1 mr-1 border-primary bg-white"
            onPress={handleHomeNavigation}
            activeOpacity={0.7}
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <View className="flex-row items-center justify-center gap-2">
              <Text className="font-black text-2xl text-primary">Home</Text>
              <Image
                source={require("../../assets/icons/home.png")}
                style={{ width: 20, height: 20 }}
                tintColor="#FF6B35"
                fadeDuration={0}
              />
            </View>
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
                  fadeDuration={0}
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
