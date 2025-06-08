import {
  StyleSheet,
  Text,
  View,
  Image,
  ImageBackground,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import * as Clipboard from "expo-clipboard";
import { auth } from "../../firebase/firebaseConfig";
import { battleManager } from "../../utils/battleManager";

export default function MultiplayerModeSelection() {
  const router = useRouter();

  const [showQuizCodeInput, setShowQuizCodeInput] = useState(false);
  const [quizCode, setQuizCode] = useState("");
  const [joiningRoom, setJoiningRoom] = useState(false);

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [playersInRoom, setPlayersInRoom] = useState({});

  const [searchingRandom, setSearchingRandom] = useState(false);

  const MAX_PLAYERS = 4;

  useEffect(() => {
    return () => {
      if (roomId) {
        battleManager.removeRoomListener(roomId);
        if (!router.pathname?.includes("battle")) {
          battleManager.leaveRoom(roomId).catch(console.error);
        }
      }
    };
  }, [roomId]);

  const handleRandomMatch = async () => {
    setSearchingRandom(true);
    try {
      console.log("Starting random match search...");
      const { roomId } = await battleManager.findRandomMatch();
      console.log("Found/created room:", roomId);

      // Add longer delay to ensure room is properly set up
      setTimeout(() => {
        console.log("Navigating to room:", roomId);
        router.push(`/user/battle-room?roomId=${roomId}&isHost=true`);
      }, 500);
    } catch (error) {
      console.error("Random match error:", error);
      Alert.alert("Matchmaking Failed", error.message);
      setSearchingRandom(false);
    }
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
      console.error("Join room error:", error);
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

      battleManager.listenToRoom(newRoomId, (roomData) => {
        if (roomData) {
          setPlayersInRoom(roomData.players || {});

          if (
            Object.keys(roomData.players || {}).length >= roomData.maxPlayers
          ) {
            startBattleRoom();
          }
        }
      });
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
      console.error("Start battle error:", error);
      Alert.alert("Error", error.message || "Failed to start battle");
    }
  };

  const cancelRoomCreation = async () => {
    if (roomId) {
      await battleManager.leaveRoom(roomId);
    }
    setShowCreateRoom(false);
    setRoomName("");
    setRoomCode("");
    setRoomId("");
    setPlayersInRoom({});
  };

  const cancelRandomSearch = () => {
    setSearchingRandom(false);
  };

  return (
    <ScrollView className="flex-1 bg-white">
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

      <View className="px-4 py-4">
        <View className="flex-row justify-center items-center">
          <Text className="text-purple-800 text-2xl mt-4 font-black">
            Choose Your Battle Mode!
          </Text>
        </View>
      </View>

      <View className="px-4 py-6 flex flex-col gap-4">
        <View className="border border-black rounded-2xl overflow-hidden">
          <View className="w-full h-8 bg-primary"></View>
          <View className="w-full p-4 flex flex-col items-center gap-4">
            <View className="flex flex-col items-center gap-1">
              <Text className="text-2xl text-purple-800 font-black">
                Random Player
              </Text>
              <Text className="text-sm text-center text-purple-800">
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
                <ActivityIndicator size="large" color="#9333ea" />
                <Text className="text-purple-800 font-bold">
                  Searching for opponent...
                </Text>
                <TouchableOpacity
                  className="px-4 py-2 bg-gray-200 rounded-lg"
                  onPress={cancelRandomSearch}
                >
                  <Text className="text-purple-800 font-bold">Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View className="border border-black rounded-2xl overflow-hidden">
          <View className="w-full h-8 bg-primary"></View>
          <View className="w-full p-4 flex flex-col items-center gap-4">
            <View className="flex flex-col items-center gap-1">
              <Text className="text-2xl text-purple-800 font-black">
                Quiz Code
              </Text>
              <Text className="text-sm text-center text-purple-800">
                Join a specific battle using a quiz code from your friend!
              </Text>
            </View>

            {!showQuizCodeInput ? (
              <TouchableOpacity onPress={() => setShowQuizCodeInput(true)}>
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
                  className="border-2 border-purple-800 rounded-lg px-4 py-3 text-center text-lg font-bold text-purple-800"
                  placeholder="Enter Quiz Code"
                  placeholderTextColor="#9333ea"
                  value={quizCode}
                  onChangeText={setQuizCode}
                  maxLength={8}
                  autoCapitalize="characters"
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
                    onPress={() => {
                      setShowQuizCodeInput(false);
                      setQuizCode("");
                    }}
                  >
                    <Text className="text-purple-800 font-bold">Cancel</Text>
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
              <Text className="text-2xl text-purple-800 font-black">
                Create Room
              </Text>
              <Text className="text-sm text-center text-purple-800">
                Create your own battle room and invite friends to join!
              </Text>
            </View>

            {!showCreateRoom ? (
              <TouchableOpacity onPress={() => setShowCreateRoom(true)}>
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
                  className="border-2 border-purple-800 rounded-lg px-4 py-3 text-center text-lg text-purple-800"
                  placeholder="Enter Room Name"
                  placeholderTextColor="#9333ea"
                  value={roomName}
                  onChangeText={setRoomName}
                  maxLength={20}
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
                      onPress={() => {
                        setShowCreateRoom(false);
                        setRoomName("");
                      }}
                    >
                      <Text className="text-purple-800 font-bold">Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="flex flex-col gap-3">
                    <View className="bg-purple-100 rounded-lg p-4">
                      <Text className="text-center text-purple-800 font-bold text-sm">
                        Room Code
                      </Text>
                      <Text className="text-center text-purple-800 font-black text-2xl">
                        {roomCode}
                      </Text>
                      <Text className="text-center text-purple-800 text-xs mt-2">
                        Players: {Object.keys(playersInRoom).length}/
                        {MAX_PLAYERS}
                      </Text>
                    </View>

                    {Object.keys(playersInRoom).length > 1 && (
                      <View className="bg-gray-50 rounded-lg p-3">
                        <Text className="text-center text-purple-800 font-bold text-sm mb-2">
                          Players Joined:
                        </Text>
                        {Object.entries(playersInRoom).map(
                          ([playerId, player]) => (
                            <Text
                              key={playerId}
                              className="text-center text-purple-800 text-sm"
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
                          <Text className="text-purple-800 font-bold text-center">
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
                          style={{ borderRadius: 8, overflow: "hidden" }}
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
                      className="py-2 bg-red-100 rounded-lg"
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
  );
}
