import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";

export default function MultiplayerSelection() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Multiplayer Mode</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push("/user/CreateSession?mode=friends")}
      >
        <Text style={styles.buttonText}>Play with Friends</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push("/user/CreateSession?mode=random")}
      >
        <Text style={styles.buttonText}>Play with Random Players</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push("/user/JoinRoom")}
      >
        <Text style={styles.buttonText}>Join via Room Code</Text>
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
  title: { fontSize: 24, fontFamily: "Poppins-Bold", marginBottom: 30 },
  button: {
    backgroundColor: "#F7C948",
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    width: "80%",
    alignItems: "center",
  },
  buttonText: { fontSize: 18, fontFamily: "Poppins-Bold", color: "#333" },
});
