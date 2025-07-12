import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
  BackHandler,
} from "react-native";
import { battleManager } from "../../utils/battleManager";

type Player = {
  name: string;
  // add other properties if needed
};

export default function MultiplayerModeSelection() {
  const router = useRouter();

  const [clearingRooms, setClearingRooms] = useState(false);

  const [showQuizCodeInput, setShowQuizCodeInput] = useState(false);
  const [quizCode, setQuizCode] = useState("");
  const [joiningRoom, setJoiningRoom] = useState(false);

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [playersInRoom, setPlayersInRoom] = useState<Record<string, Player>>(
    {}
  );

  const [searchingRandom, setSearchingRandom] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const MAX_PLAYERS = 4;

  const cleanupRef = useRef(false);
  const roomListenerRef = useRef(null);

  // Complete state reset function
  const resetAllStates = useCallback(() => {
    setShowQuizCodeInput(false);
    setQuizCode("");
    setJoiningRoom(false);
    setShowCreateRoom(false);
    setRoomCode("");
    setRoomName("");
    setRoomId("");
    setCreatingRoom(false);
    setPlayersInRoom({});
    setSearchingRandom(false);
    setClearingRooms(false);
  }, []);

  // Enhanced cleanup function
  const performCleanup = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;

    try {
      // Remove room listener
      if (roomListenerRef.current) {
        roomListenerRef.current();
        roomListenerRef.current = null;
      }

      // Leave room if in one
      if (roomId) {
        await battleManager.leaveRoom(roomId);
      }

      // Cancel matchmaking
      await battleManager.cancelMatchmaking();
    } catch (error) {
      console.error("Cleanup error:", error);
    }

    // Reset cleanup flag for next use
    cleanupRef.current = false;
  }, [roomId]);

  // MAIN RESET EFFECT - This runs every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log("MultiplayerModeSelection screen focused - resetting states");

      // Reset all states immediately when screen comes into focus
      resetAllStates();

      // Perform cleanup of any ongoing operations
      const cleanup = async () => {
        try {
          // Cancel any ongoing matchmaking
          await battleManager.cancelMatchmaking();

          // If there's any room listener, remove it
          if (roomListenerRef.current) {
            roomListenerRef.current();
            roomListenerRef.current = null;
          }
        } catch (error) {
          console.error("Initial cleanup error:", error);
        }
      };

      cleanup();

      // Dismiss keyboard if open
      Keyboard.dismiss();

      // Return cleanup function for when screen loses focus
      return () => {
        console.log("MultiplayerModeSelection screen unfocused - cleaning up");
        performCleanup();
      };
    }, [resetAllStates, performCleanup])
  );

  // Handle hardware back button
  useEffect(() => {
    const backAction = () => {
      router.push("/user/home");
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      performCleanup();
    };
  }, [performCleanup]);

  // Keyboard listeners
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardHideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShowListener?.remove();
      keyboardHideListener?.remove();
    };
  }, []);

  // Room listener cleanup
  useEffect(() => {
    return () => {
      if (roomId) {
        battleManager.removeRoomListener(roomId);
        if (!roomId) return;
      }
    };
  }, [roomId]);

  // For Quiz Code section
  const handleShowQuizCodeInput = () => {
    setShowQuizCodeInput(true);
    setShowCreateRoom(false); // Close create room section
    // Reset create room states
    setRoomCode("");
    setRoomName("");
    setRoomId("");
    setPlayersInRoom({});
    setCreatingRoom(false);
    // Reset random search
    setSearchingRandom(false);
  };

  // For Create Room section
  const handleShowCreateRoom = () => {
    setShowCreateRoom(true);
    setShowQuizCodeInput(false); // Close quiz code section
    // Reset quiz code states
    setQuizCode("");
    setJoiningRoom(false);
    // Reset random search
    setSearchingRandom(false);
  };

  const handleJoinQuizCode = async () => {
    if (quizCode.length < 4) {
      Alert.alert("Invalid Code", "Please enter a valid quiz code");
      return;
    }

    setJoiningRoom(true);

    try {
      const { roomId: foundRoomId } = await battleManager.joinRoom(quizCode);
      setJoiningRoom(false);
      router.push(`/user/battle-room?roomId=${foundRoomId}&isHost=false`);
    } catch (error) {
      Alert.alert("Error", error.message);
      setJoiningRoom(false);
    }
  };

  const handleCreateRoom = async () => {
    setCreatingRoom(true);
    try {
      const { roomId: newRoomId, roomCode: newRoomCode } =
        await battleManager.createRoom(roomName.trim(), MAX_PLAYERS);

      setRoomCode(newRoomCode);
      setRoomId(newRoomId);

      // Set the creator as ready by default for regular rooms
      await battleManager.toggleReady(newRoomId);

      roomListenerRef.current = battleManager.listenToRoom(
        newRoomId,
        (roomData) => {
          if (roomData && roomData.status !== "finished") {
            setPlayersInRoom(roomData.players || {});
            if (
              Object.keys(roomData.players || {}).length >= roomData.maxPlayers
            ) {
              startBattleRoom();
            }
          }
        }
      );
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const copyRoomCode = async () => {
    await Clipboard.setStringAsync(roomCode);
    Alert.alert("Copied!", "Room code copied to clipboard");
  };

  const startBattleRoom = async () => {
    if (Object.keys(playersInRoom).length < 2) {
      Alert.alert("Need More Players", "Wait for at least 2 players to join");
      return;
    }

    try {
      await battleManager.startBattle(roomId);
      router.push(`/user/battle-room?roomId=${roomId}&isHost=true`);
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to start battle");
    }
  };

  const cancelRoomCreation = useCallback(async () => {
    try {
      if (roomId) {
        await battleManager.leaveRoom(roomId);
      }

      // Remove listener
      if (roomListenerRef.current) {
        roomListenerRef.current();
        roomListenerRef.current = null;
      }

      // Reset all create room states
      setShowCreateRoom(false);
      setRoomName("");
      setRoomCode("");
      setRoomId("");
      setPlayersInRoom({});
      setCreatingRoom(false);
    } catch (error) {
      console.error("Cancel room error:", error);
      // Reset states anyway
      setShowCreateRoom(false);
      setRoomName("");
      setRoomCode("");
      setRoomId("");
      setPlayersInRoom({});
      setCreatingRoom(false);
    }
  }, [roomId]);

  const handleRandomMatch = async () => {
    setSearchingRandom(true);
    try {
      const { roomId, isHost } = await battleManager.findRandomMatch();
      router.push(
        `/user/battle-room?roomId=${roomId}&isHost=${isHost ? "true" : "false"}`
      );
    } catch (error) {
      console.error("Random match error:", error);
      setSearchingRandom(false);
      Alert.alert("Matchmaking Failed", error.message);
    }
  };

  const cancelRandomSearch = useCallback(async () => {
    setSearchingRandom(false);
    try {
      await battleManager.cancelMatchmaking();
    } catch (error) {
      console.error("Cancel matchmaking error:", error);
    }

    // Reset any room states
    if (roomId) {
      try {
        await battleManager.leaveRoom(roomId);
      } catch (error) {
        console.error("Leave room error:", error);
      }
      setRoomId("");
    }
  }, [roomId]);

  // Enhanced cancel functions for UI buttons
  const handleCancelQuizCode = () => {
    setShowQuizCodeInput(false);
    setQuizCode("");
    setJoiningRoom(false);
    Keyboard.dismiss();
  };

  const handleCancelCreateRoom = () => {
    setShowCreateRoom(false);
    setRoomName("");
    setCreatingRoom(false);
    Keyboard.dismiss();
  };

  return (
    <View className="flex-1 bg-white">
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-4">
          <View className="flex-row justify-center items-center gap-2">
            <Image
              source={require("../../assets/icons/swords.png")}
              style={{ width: 28, height: 28 }}
              tintColor="#FF6B35"
            />
            <Text className="text-white text-3xl font-black">Battle Mode</Text>
          </View>
        </View>
      </ImageBackground>
      <ScrollView
        className="bg-white"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: keyboardHeight > 0 ? keyboardHeight - 30 : 30,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 py-4">
          <View className="flex-col justify-center items-center">
            <Text className="text-custom-purple text-2xl mt-4 font-black">
              Choose Your Battle Mode!
            </Text>
            <Text className="text-custom-purple text-center text-base mt-2 italic">
              (Try properly closing and reopening the app if you face any issue
              while any battle mode.)
            </Text>
          </View>
        </View>

        <View className="px-4 py-6 flex flex-col gap-4">
          <View className="border border-black rounded-2xl overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="w-full p-4 flex flex-col items-center gap-4">
              <View className="flex flex-col items-center gap-1">
                <Text className="text-2xl text-custom-purple font-black">
                  Random Player
                </Text>
                <Text className="text-sm text-center text-custom-purple">
                  Get matched with a random opponent for an exciting battle!
                </Text>
              </View>

              {!searchingRandom ? (
                <TouchableOpacity onPress={handleRandomMatch}>
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{ borderRadius: 8, overflow: "hidden" }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-3">
                      <Text className="text-white font-bold text-xl w-56 text-center">
                        Find Random Battle
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ) : (
                <View className="flex flex-col items-center gap-3">
                  <ActivityIndicator size="large" color="#76184F" />
                  <Text className="text-custom-purple font-bold">
                    Searching for opponent...
                  </Text>
                  <TouchableOpacity
                    className="px-4 py-2 bg-gray-200 rounded-lg"
                    onPress={cancelRandomSearch}
                  >
                    <Text className="text-custom-purple font-bold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View className="border border-black rounded-2xl overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="w-full p-4 flex flex-col items-center gap-4">
              <View className="flex flex-col items-center gap-1">
                <Text className="text-2xl text-custom-purple font-black">
                  Quiz Code
                </Text>
                <Text className="text-sm text-center text-custom-purple">
                  Join a specific battle using a quiz code from your friend!
                </Text>
              </View>

              {!showQuizCodeInput ? (
                <TouchableOpacity onPress={handleShowQuizCodeInput}>
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{ borderRadius: 8, overflow: "hidden" }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-3">
                      <Text className="text-white font-bold text-xl w-56 text-center">
                        Enter Quiz Code
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ) : (
                <View className="w-full flex flex-col gap-3">
                  <TextInput
                    className="border-2 border-custom-purple rounded-lg px-4 py-3 text-center text-lg font-bold text-custom-purple"
                    placeholder="Enter Quiz Code"
                    placeholderTextColor="#76184F"
                    value={quizCode}
                    onChangeText={setQuizCode}
                    maxLength={8}
                    autoCapitalize="characters"
                    autoFocus={true}
                    returnKeyType="done"
                    onSubmitEditing={handleJoinQuizCode}
                    blurOnSubmit={true}
                  />
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      className="flex-1"
                      onPress={handleJoinQuizCode}
                      disabled={joiningRoom}
                    >
                      <ImageBackground
                        source={require("../../assets/gradient.jpg")}
                        style={{
                          borderRadius: 8,
                          overflow: "hidden",
                          opacity: joiningRoom ? 0.7 : 1,
                        }}
                        imageStyle={{ borderRadius: 12 }}
                      >
                        <View className="py-3 flex-row justify-center items-center gap-2">
                          {joiningRoom && (
                            <ActivityIndicator size="small" color="white" />
                          )}
                          <Text className="text-white font-bold text-lg">
                            {joiningRoom ? "Joining..." : "Join Battle"}
                          </Text>
                        </View>
                      </ImageBackground>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="px-4 py-3 bg-gray-200 rounded-lg"
                      onPress={handleCancelQuizCode}
                    >
                      <Text className="text-custom-purple font-bold">
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View className="border border-black rounded-2xl overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="w-full p-4 flex flex-col items-center gap-4">
              <View className="flex flex-col items-center gap-1">
                <Text className="text-2xl text-custom-purple font-black">
                  Create Room
                </Text>
                <Text className="text-sm text-center text-custom-purple">
                  Create your own battle room and invite friends to join!
                </Text>
              </View>

              {!showCreateRoom ? (
                <TouchableOpacity onPress={handleShowCreateRoom}>
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{ borderRadius: 8, overflow: "hidden" }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-3">
                      <Text className="text-white font-bold text-xl w-56 text-center">
                        Create New Room
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ) : (
                <View className="w-full flex flex-col gap-3">
                  <TextInput
                    className="border-2 border-custom-purple rounded-lg px-4 py-3 text-center text-lg text-custom-purple"
                    placeholder="Enter Room Name"
                    placeholderTextColor="#76184F"
                    value={roomName}
                    onChangeText={setRoomName}
                    maxLength={20}
                    returnKeyType="done"
                    onSubmitEditing={handleCreateRoom}
                    blurOnSubmit={true}
                  />

                  {!roomCode ? (
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        className="flex-1"
                        onPress={handleCreateRoom}
                        disabled={creatingRoom}
                      >
                        <ImageBackground
                          source={require("../../assets/gradient.jpg")}
                          style={{
                            borderRadius: 8,
                            overflow: "hidden",
                            opacity: creatingRoom ? 0.7 : 1,
                          }}
                          imageStyle={{ borderRadius: 12 }}
                        >
                          <View className="py-3 flex-row justify-center items-center gap-2">
                            {creatingRoom && (
                              <ActivityIndicator size="small" color="white" />
                            )}
                            <Text className="text-white font-bold text-lg">
                              {creatingRoom ? "Creating..." : "Generate Code"}
                            </Text>
                          </View>
                        </ImageBackground>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="px-4 py-3 bg-gray-200 rounded-lg"
                        onPress={handleCancelCreateRoom}
                      >
                        <Text className="text-custom-purple font-bold">
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className="flex flex-col gap-3">
                      <View className="bg-light-orange rounded-lg p-4">
                        <Text className="text-center text-custom-purple font-bold text-sm">
                          Room Code
                        </Text>
                        <Text className="text-center text-custom-purple font-black text-2xl">
                          {roomCode}
                        </Text>
                        <Text className="text-center text-custom-purple text-xs mt-2">
                          Players: {Object.keys(playersInRoom).length}/
                          {MAX_PLAYERS}
                        </Text>
                      </View>

                      {Object.keys(playersInRoom).length > 1 && (
                        <View className="bg-custom-gray rounded-lg p-3">
                          <Text className="text-center text-custom-purple font-bold text-sm mb-2">
                            Players Joined:
                          </Text>
                          {Object.entries(playersInRoom).map(
                            ([playerId, player]) => (
                              <Text
                                key={playerId}
                                className="text-center text-custom-purple text-sm"
                              >
                                • {player.name}
                              </Text>
                            )
                          )}
                        </View>
                      )}

                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          className="flex-1"
                          onPress={copyRoomCode}
                        >
                          <View className="py-3 bg-purple-200 rounded-lg">
                            <Text className="text-custom-purple font-bold text-center">
                              Copy Code
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className="flex-1"
                          onPress={startBattleRoom}
                        >
                          <ImageBackground
                            source={require("../../assets/gradient.jpg")}
                            style={{
                              borderRadius: 8,
                              overflow: "hidden",
                            }}
                            imageStyle={{ borderRadius: 12 }}
                          >
                            <View className="py-3">
                              <Text className="text-white font-bold text-center">
                                Start Battle
                              </Text>
                            </View>
                          </ImageBackground>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        className="py-2 bg-light-orange rounded-lg"
                        onPress={cancelRoomCreation}
                      >
                        <Text className="text-red-600 font-bold text-center">
                          Cancel Room
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
