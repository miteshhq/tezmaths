import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { ref, get, update } from "firebase/database";
import { database, auth } from "../../firebase/firebaseConfig";
import { router } from "expo-router";

export default function JoinRoom() {
  const [roomCode, setRoomCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    // Check if roomCode is empty or just whitespace
    if (!roomCode.trim()) {
      Alert.alert("Error", "Please enter a room code.");
      return;
    }

    setIsLoading(true);

    try {
      // Fetch multiplayer sessions from Firebase
      const snapshot = await get(ref(database, "multiplayerSessions"));
      const sessions = snapshot.val();
      const session = Object.entries(sessions || {}).find(
        ([_, data]) => data.roomCode === roomCode && data.status === "waiting"
      );

      if (session) {
        const [sessionId] = session;
        const userId = auth.currentUser?.uid;

        // Ensure user is authenticated
        if (!userId) {
          Alert.alert("Error", "You must be logged in to join a session.");
          setIsLoading(false);
          return;
        }

        // Update session participants with user's ID
        await update(
          ref(database, `multiplayerSessions/${sessionId}/participants`),
          {
            [userId]: { score: 0, answers: {} },
          }
        );

        // Navigate to SessionLobby with sessionId
        router.push(`/user/SessionLobby?sessionId=${sessionId}`);
      } else {
        Alert.alert("Error", "Invalid or closed room code.");
      }
    } catch (error) {
      console.error("Error joining session:", error);
      Alert.alert("Error", "Failed to join the session. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter Room Code</Text>
      <TextInput
        style={styles.input}
        value={roomCode}
        onChangeText={setRoomCode}
        placeholder="Room Code"
        editable={!isLoading} // Disable input while loading
      />
      <TouchableOpacity
        style={styles.button}
        onPress={handleJoin}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>
          {isLoading ? "Joining..." : "Join"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF2CC",
  },
  title: {
    fontSize: 24,
    fontFamily: "Poppins-Bold",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#F7C948",
    padding: 10,
    borderRadius: 10,
    width: "80%",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#F7C948",
    padding: 15,
    borderRadius: 10,
  },
  buttonText: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
    color: "#333",
  },
});
