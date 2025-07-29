import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SoundManager from '../../components/soundManager';
import { auth, database } from '../../firebase/firebaseConfig';
import { ref, get, remove, off } from 'firebase/database';
import { battleManager } from '../../utils/battleManager';

const logo = require('../../assets/branding/tezmaths-full-logo.png');

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
  const { roomId, players, totalQuestions, currentUserId } =
    useLocalSearchParams();

  // Refs for cleanup management
  const viewShotRef = useRef<ViewShot>(null);
  const soundPlayed = useRef(false);
  const cleanupDone = useRef(false);
  const unmounted = useRef(false);

  // 1️⃣ ONE-TIME DATA PROCESSING - Prevents infinite loops
  const [battleData] = useState(() => {
    console.log("=== PROCESSING BATTLE DATA ONCE ===");

    const cleanRoomId = Array.isArray(roomId) ? roomId[0] : roomId || "";
    const cleanCurrentUserId = Array.isArray(currentUserId)
      ? currentUserId[0]
      : currentUserId || "";
    const cleanTotalQuestions =
      parseInt(
        Array.isArray(totalQuestions)
          ? totalQuestions[0]
          : totalQuestions || "0"
      ) || 0;

    let processedPlayers = [];

    try {
      if (players) {
        const playersData = JSON.parse(
          Array.isArray(players) ? players[0] : players
        );

        if (Array.isArray(playersData)) {
          processedPlayers = playersData.map((player, index) => ({
            userId: player.userId || `player_${index}`,
            username: player.name || player.username || `Player ${index + 1}`,
            avatar: Number(player.avatar) || 0,
            score: Number(player.score) || 0,
          }));
        } else if (typeof playersData === "object") {
          processedPlayers = Object.entries(playersData).map(
            ([userId, playerData]) => ({
              userId,
              username: playerData.name || playerData.username || "Player",
              avatar: Number(playerData.avatar) || 0,
              score: Number(playerData.score) || 0,
            })
          );
        }
      }
    } catch (error) {
      console.error("Error parsing players:", error);
    }

    // Ensure current user exists
    if (!processedPlayers.find((p) => p.userId === cleanCurrentUserId)) {
      processedPlayers.push({
        userId: cleanCurrentUserId,
        username: "You",
        avatar: 0,
        score: 0,
      });
    }

    // Sort by score and calculate rank
    processedPlayers.sort((a, b) => b.score - a.score);
    const userIndex = processedPlayers.findIndex(
      (p) => p.userId === cleanCurrentUserId
    );
    const userRank = userIndex + 1;
    const userScore = processedPlayers[userIndex]?.score || 0;

    return {
      players: processedPlayers,
      totalQuestions: cleanTotalQuestions,
      userRank,
      userScore,
      currentUserId: cleanCurrentUserId,
      roomId: cleanRoomId,
    };
  });

  const [userData, setUserData] = useState({ avatar: 0, username: "player" });
  const [isSharing, setIsSharing] = useState(false);

  // 2️⃣ LOAD USER DATA & PLAY SOUND
  useEffect(() => {
    // Load cached user data
    AsyncStorage.getItem("userData")
      .then((cached) => {
        if (cached && !unmounted.current) {
          const data = JSON.parse(cached);
          setUserData(data);
        }
      })
      .catch(() => {});

    // Play victory sound once
    if (battleData.userRank === 1 && !soundPlayed.current) {
      soundPlayed.current = true;
      SoundManager.playSound("victorySoundEffect").catch(() => {});
    }
  }, []);

  // Replace the existing cleanup useEffect with this:
  useEffect(() => {
    if (cleanupDone.current || unmounted.current || !battleData.roomId) return;
    cleanupDone.current = true;

    // SIMPLIFIED: Single cleanup without complex async operations
    const performCleanup = () => {
      try {
        const { roomId, currentUserId } = battleData;
        const user = auth.currentUser;
        const userId = user?.uid || currentUserId;

        if (roomId && userId) {
          // Fire-and-forget cleanup operations
          battleManager.updatePlayerConnection(roomId, false).catch(() => {});

          AsyncStorage.multiRemove([
            "currentBattleId",
            "battleState",
            "battleResults",
            "lastBattleScore",
            "battleProgress",
            "roomData",
            "battleQuestions",
          ]).catch(() => {});

          // Delayed battle manager reset to prevent loops
          setTimeout(() => {
            if (!unmounted.current) {
              battleManager.resetUserBattleState().catch(() => {});
            }
          }, 1000);
        }
      } catch (error) {
        console.error("Cleanup error:", error);
      }
    };

    // Non-blocking cleanup
    setTimeout(performCleanup, 100);
  }, []); // Empty deps - runs once only

  // 4️⃣ DETACH LISTENERS ON UNMOUNT
  useEffect(() => {
    return () => {
      console.log("BattleResultsScreen unmounting");
      unmounted.current = true;

      // Detach Firebase listeners
      if (battleData.roomId) {
        off(ref(database, `rooms/${battleData.roomId}`));
      }

      // Stop sound
      if (soundPlayed.current) {
        SoundManager.stopSound("victorySoundEffect").catch(() => {});
      }
    };
  }, []);

  // Navigation handlers
  const handleHomeNavigation = useCallback(() => {
    console.log("Navigating to home...");
    router.replace("/user/home");
  }, []);

  // Back button handler
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

  // Helper functions
  const getMotivationalQuote = () => {
    const quotes = [
      "Victory is earned through sharp minds!",
      "Every battle makes you stronger!",
      "Second place is just the first step to first!",
      "Keep fighting, greatness awaits!",
      "Math battles build champions!",
    ];
    const rank = battleData.userRank;
    if (rank === 1) return quotes[0];
    if (rank === 2) return quotes[1];
    if (rank === 3) return quotes[2];
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

  // Share functionality
  const shareImageAndText = async () => {
    setIsSharing(true);
    try {
      if (!viewShotRef.current) {
        throw new Error("ViewShot ref not available");
      }

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
    } catch (error) {
      Alert.alert("Sharing failed", error.message || "Something went wrong.");
    } finally {
      setIsSharing(false);
    }
  };

  // Render UI
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

            <View className="flex-row items-center justify-center space-x-2 mb-4">
              {battleData.players.map((player, index) => (
                <React.Fragment key={player.userId}>
                  <ProfileImage
                    player={player}
                    isCurrentUser={player.userId === battleData.currentUserId}
                  />
                  {index < battleData.players.length - 1 && (
                    <View className="items-center justify-center">
                      <Image
                        source={require("../../assets/icons/swords.png")}
                        style={{ width: 12, height: 12 }}
                        tintColor="#F05A2A"
                        fadeDuration={0}
                      />
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>

            <Text className="text-2xl text-black font-bold text-center mx-auto w-full mb-2">
              Battle Score
            </Text>

            <ScrollView className="w-full mb-4">
              {battleData.players.map((player, index) => (
                <View
                  key={player.userId}
                  className={`flex-row justify-between items-center w-full p-4 py-2 rounded-lg mb-2 bg-light-orange ${
                    player.userId === battleData.currentUserId
                      ? "border-2 border-primary"
                      : "border-transparent border-2"
                  }`}
                >
                  <Text className="text-xl font-bold">
                    {index + 1}. {player.username}
                    {player.userId === battleData.currentUserId ? " (You)" : ""}
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
