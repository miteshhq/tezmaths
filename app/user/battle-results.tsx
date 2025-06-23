import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Share,
  Alert,
  Modal,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import SoundManager from "../../components/soundManager";
import logo from "../../assets/branding/tezmaths-full-logo.png";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { battleManager } from "../../utils/battleManager";

const shareConfig = {
  additionalText: "Check out my battle results on TezMaths! ⚔️✨",
  playStoreLink:
    "https://play.google.com/store/apps/details?id=com.tezmathsteam.tezmaths",
  downloadText: "Join the battle on TezMaths now!",
  hashtags: "#TezMaths #MathBattle #BrainTraining",
};

const avatarImages = (avatar) => {
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

export default function BattleResultsScreen() {
  const params = useLocalSearchParams();
  const { roomId, players, totalQuestions, currentUserId } = params;

  const cardRef = useRef();
  const viewShotRef = useRef();
  const cleanupExecuted = useRef(false);
  const navigationInProgress = useRef(false);

  // State management
  const [isPopupVisible, setPopupVisible] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [userData, setUserData] = useState({ avatar: 0 });
  const [isNavigating, setIsNavigating] = useState(false);
  const [battleData, setBattleData] = useState({
    players: [],
    totalQuestions: 0,
    userRank: 0,
    userScore: 0,
    isValid: false,
  });
  const [errorMessage, setErrorMessage] = useState("");

  const performCleanup = useCallback(() => {
    if (cleanupExecuted.current || !roomId) return;
    cleanupExecuted.current = true;

    // Non-blocking cleanup
    Promise.allSettled([
      battleManager.removeRoomListener?.(roomId),
      battleManager.updatePlayerConnection?.(roomId, false),
      battleManager.disconnectFromRoom?.(roomId),
    ]).catch(() => {}); // Ignore errors
  }, [roomId]);

  // Validate and process battle data
  useEffect(() => {
    const validateBattleData = () => {
      try {
        // Check required parameters
        if (!roomId) {
          setErrorMessage("Battle room not found. Returning to menu...");
          setTimeout(() => {
            router.replace("/user/multiplayer-mode-selection");
          }, 1500);
          return;
        }

        if (!players || !currentUserId) {
          setErrorMessage("Battle data incomplete. Please try again.");
          setTimeout(() => {
            router.replace("/user/multiplayer-mode-selection");
          }, 1500);
          return;
        }

        // Parse players data - handle both array and object formats
        let parsedPlayers = [];
        try {
          const playersData = JSON.parse(players);

          // Check if it's an object (Firebase format) or array
          if (Array.isArray(playersData)) {
            parsedPlayers = playersData;
          } else if (typeof playersData === "object" && playersData !== null) {
            // Convert object to array
            parsedPlayers = Object.entries(playersData).map(
              ([userId, playerData]) => ({
                userId: userId,
                username:
                  playerData.name || playerData.username || "Unknown Player",
                avatar:
                  typeof playerData.avatar === "number"
                    ? playerData.avatar
                    : parseInt(playerData.avatar) || 0,
                score:
                  typeof playerData.score === "number"
                    ? playerData.score
                    : parseInt(playerData.score) || 0,
              })
            );
          } else {
            throw new Error("Invalid players data format");
          }
        } catch (parseError) {
          console.error("Error parsing players data:", parseError);
          console.log("Raw players data:", players); // Debug log
          setErrorMessage("Invalid battle data format. Returning to menu...");
          setTimeout(() => {
            router.replace("/user/multiplayer-mode-selection");
          }, 1500);
          return;
        }

        if (!Array.isArray(parsedPlayers) || parsedPlayers.length === 0) {
          console.log("Parsed players:", parsedPlayers); // Debug log
          setErrorMessage("No players found in battle results.");
          setTimeout(() => {
            router.replace("/user/multiplayer-mode-selection");
          }, 1500);
          return;
        }

        // Ensure all players have required fields
        const processedPlayers = parsedPlayers.map((player, index) => ({
          userId: player.userId || `player_${index}`,
          username: player.username || player.name || "Unknown Player",
          avatar:
            typeof player.avatar === "number"
              ? player.avatar
              : parseInt(player.avatar) || 0,
          score:
            typeof player.score === "number"
              ? player.score
              : parseInt(player.score) || 0,
        }));

        // Sort players by score (highest first)
        processedPlayers.sort((a, b) => b.score - a.score);

        // Find current user's rank and score
        const userIndex = processedPlayers.findIndex(
          (p) => p.userId === currentUserId
        );

        if (userIndex === -1) {
          console.log("Current user ID:", currentUserId); // Debug log
          console.log("Processed players:", processedPlayers); // Debug log
          setErrorMessage("Your results not found. Please try again.");
          setTimeout(() => {
            router.replace("/user/multiplayer-mode-selection");
          }, 1500);
          return;
        }

        const userRank = userIndex + 1;
        const userScore = processedPlayers[userIndex].score;

        console.log("Battle data validated successfully:", {
          playersCount: processedPlayers.length,
          userRank,
          userScore,
        });

        setBattleData({
          players: processedPlayers,
          totalQuestions: parseInt(totalQuestions) || 0,
          userRank,
          userScore,
          isValid: true,
        });
      } catch (error) {
        console.error("Error validating battle data:", error);
        setErrorMessage("Error loading battle results. Please try again.");
        setTimeout(() => {
          router.replace("/user/multiplayer-mode-selection");
        }, 1500);
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

  // Cleanup on unmount - non-blocking
  useEffect(() => {
    return () => {
      performCleanup();
    };
  }, [performCleanup]);

  // Play victory sound
  useFocusEffect(
    useCallback(() => {
      let soundActive = true;

      const playResultSound = async () => {
        try {
          if (battleData.isValid && battleData.userRank === 1 && soundActive) {
            await SoundManager.playSound("victorySoundEffect");
          }
        } catch (error) {
          console.error("Error playing result sound:", error);
        }
      };

      if (battleData.isValid) {
        playResultSound();
      }

      return () => {
        soundActive = false;
        if (battleData.userRank === 1) {
          SoundManager.stopSound("victorySoundEffect").catch(() => {});
        }
      };
    }, [battleData.isValid, battleData.userRank])
  );

  // Handle back button (Android) - FIXED: correct method name
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (!navigationInProgress.current) {
          handleHomeNavigation();
        }
        return true; // Prevent default back behavior
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => {
        // FIXED: Use remove() method instead of removeEventListener
        backHandler.remove();
      };
    }, [])
  );

  // Fast navigation handler - no blocking cleanup
  // REPLACE handleHomeNavigation with:
  const handleHomeNavigation = useCallback(() => {
    if (navigationInProgress.current) return;

    navigationInProgress.current = true;

    // Navigate immediately
    router.replace("/user/home");

    // Cleanup in background
    setTimeout(() => {
      performCleanup();
    }, 100);
  }, []);

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
    const downloadLinks = `📱 Android: ${shareConfig.playStoreLink}`;
    return (
      `${shareConfig.additionalText}\n\n` +
      `🏆 I ranked #${battleData.userRank} with ${battleData.userScore} points in a math battle!\n` +
      `"${getMotivationalQuote()}"\n\n` +
      `${shareConfig.downloadText}\n\n` +
      `${downloadLinks}\n\n` +
      `${shareConfig.hashtags}`
    );
  };

  const captureImage = async () => {
    try {
      const uri = await viewShotRef.current.capture({
        format: "png",
        quality: 0.9,
        result: "tmpfile",
      });

      const timestamp = Date.now();
      const newUri = `${FileSystem.documentDirectory}tezmaths_battle_result_${timestamp}.png`;

      await FileSystem.copyAsync({ from: uri, to: newUri });
      return newUri;
    } catch (error) {
      console.error("Error capturing image:", error);
      throw error;
    }
  };

  const shareImageOnly = async () => {
    setIsSharing(true);
    try {
      const newUri = await captureImage();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri);
      } else {
        await Share.share({ url: newUri });
      }
    } catch (error) {
      console.error("Error sharing image:", error);
      Alert.alert("Error", "Couldn't share image. Please try again.");
    } finally {
      setIsSharing(false);
      setPopupVisible(false);
    }
  };

  const shareTextOnly = async () => {
    setIsSharing(true);
    try {
      const shareMessage = getShareMessage();
      await Share.share({ message: shareMessage });
    } catch (error) {
      console.error("Error sharing text:", error);
      Alert.alert("Error", "Couldn't share text. Please try again.");
    } finally {
      setIsSharing(false);
      setPopupVisible(false);
    }
  };

  const handleShare = () => {
    setPopupVisible(true);
  };

  if (!battleData.isValid || battleData.players.length === 0) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text className="text-lg mt-4">Loading results...</Text>
      </View>
    );
  }

  // Show error message if battle data is invalid
  if (errorMessage) {
    return (
      <View className="flex-1 bg-white justify-center items-center p-4">
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text className="text-xl font-bold text-center mt-4 text-gray-700">
          {errorMessage}
        </Text>
      </View>
    );
  }

  // Show loading if battle data is not ready
  if (!battleData.isValid) {
    return (
      <View className="flex-1 bg-white justify-center items-center p-4">
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text className="text-xl font-bold text-center mt-4 text-gray-700">
          Loading battle results...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="bg-white"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-1 bg-white justify-center items-center p-4">
        {/* Shareable Card wrapped in ViewShot */}
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
            ref={cardRef}
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
                    player.userId === currentUserId
                      ? "border-2 border-primary"
                      : "border-transparent border-2"
                  }`}
                >
                  <Text className="text-xl font-bold">
                    {index + 1}. {player.username}
                    {player.userId === currentUserId ? " (You)" : ""}
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

        {/* Action Buttons */}
        <View className="flex-row justify-between mt-6 w-full max-w-md">
          <TouchableOpacity
            className="py-3 px-6 border border-black rounded-full flex-1 mr-1"
            onPress={handleHomeNavigation}
            disabled={isNavigating}
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
            onPress={handleShare}
            disabled={isSharing || isNavigating}
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

        {/* Footer */}
        <Text className="text-primary text-sm mt-3">
          TezMaths - Sharpen Your Speed
        </Text>
      </View>

      {/* Share Options Popup */}
      <Modal
        visible={isPopupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPopupVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Share Your Battle Results</Text>

            <TouchableOpacity
              style={styles.optionButton}
              onPress={shareImageOnly}
              disabled={isSharing}
            >
              <Text style={styles.optionText}>Share Image</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionButton}
              onPress={shareTextOnly}
              disabled={isSharing}
            >
              <Text style={styles.optionText}>Share Text</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setPopupVisible(false)}
              disabled={isSharing}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  optionButton: {
    width: "100%",
    padding: 15,
    marginVertical: 5,
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    alignItems: "center",
  },
  optionText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  cancelButton: {
    width: "100%",
    padding: 15,
    marginTop: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 10,
    alignItems: "center",
  },
  cancelText: {
    color: "#333",
    fontSize: 18,
    fontWeight: "bold",
  },
});
