import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ref, onValue, update } from "firebase/database";
import { database, auth } from "../../firebase/firebaseConfig";
import { useLocalSearchParams, router } from "expo-router";

export default function SessionLobby() {
  const { sessionId } = useLocalSearchParams();
  const [session, setSession] = useState<any>(null);
  const userId = auth.currentUser?.uid;

  useEffect(() => {
    const sessionRef = ref(database, `multiplayerSessions/${sessionId}`);
    onValue(sessionRef, (snapshot) => {
      setSession(snapshot.val());
    });
  }, [sessionId]);

  const startQuiz = async () => {
    await update(ref(database, `multiplayerSessions/${sessionId}`), {
      status: "inProgress",
      questionStartTime: Date.now(),
    });
    router.push(`/user/MultiplayerQuizScreen?sessionId=${sessionId}`);
  };

  if (!session) return <Text>Loading...</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Room Code: {session.roomCode}</Text>
      <Text style={styles.subtitle}>Participants:</Text>
      {Object.keys(session.participants).map((id) => (
        <Text key={id}>
          {id === session.hostId ? "Host" : "Player"}: {id}
        </Text>
      ))}
      {session.hostId === userId && (
        <TouchableOpacity style={styles.button} onPress={startQuiz}>
          <Text style={styles.buttonText}>Start Quiz</Text>
        </TouchableOpacity>
      )}
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
  title: { fontSize: 24, fontFamily: "Poppins-Bold", marginBottom: 20 },
  subtitle: { fontSize: 18, fontFamily: "Poppins-Regular", marginBottom: 10 },
  button: {
    backgroundColor: "#F7C948",
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  buttonText: { fontSize: 18, fontFamily: "Poppins-Bold", color: "#333" },
});
