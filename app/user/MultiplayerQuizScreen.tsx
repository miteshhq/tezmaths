import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { ref, onValue, update } from "firebase/database";
import { database, auth } from "../../firebase/firebaseConfig";
import { useLocalSearchParams } from "expo-router";
import { CountdownCircleTimer } from "react-native-countdown-circle-timer";

export default function MultiplayerQuizScreen() {
  const { sessionId } = useLocalSearchParams();
  const [session, setSession] = useState<any>(null);
  const [question, setQuestion] = useState<any>(null);
  const [answer, setAnswer] = useState("");
  const userId = auth.currentUser?.uid;

  useEffect(() => {
    const sessionRef = ref(database, `multiplayerSessions/${sessionId}`);
    onValue(sessionRef, async (snapshot) => {
      const data = snapshot.val();
      setSession(data);
      if (data.status === "inProgress") {
        const qRef = ref(
          database,
          `quizzes/${
            data.questions[data.currentQuestionIndex].quizId
          }/questions/${
            data.questions[data.currentQuestionIndex].questionIndex
          }`
        );
        const qSnapshot = await get(qRef);
        setQuestion(qSnapshot.val());
      }
    });
  }, [sessionId]);

  const timeRemaining = session
    ? Math.max(
        0,
        Math.floor(
          (session.questionStartTime + session.timeLimit * 1000 - Date.now()) /
            1000
        )
      )
    : 0;

  const submitAnswer = async () => {
    await update(
      ref(database, `multiplayerSessions/${sessionId}/participants/${userId}`),
      {
        answers: { [session.currentQuestionIndex]: answer },
      }
    );
    setAnswer("");
  };

  if (!session || !question) return <Text>Loading...</Text>;
  if (session.status === "completed") return <Text>Quiz Completed!</Text>;

  return (
    <View style={styles.container}>
      <Text>Level: {session.level}</Text>
      <Text>Question {session.currentQuestionIndex + 1}</Text>
      <CountdownCircleTimer
        isPlaying={session.status === "inProgress"}
        duration={session.timeLimit}
        initialRemainingTime={timeRemaining}
        colors={["#004777", "#F7B801", "#A30000"]}
        colorsTime={[15, 10, 0]}
      >
        {({ remainingTime }) => <Text>{remainingTime}s</Text>}
      </CountdownCircleTimer>
      <Text style={styles.questionText}>{question.question}</Text>
      <TextInput
        style={styles.input}
        value={answer}
        onChangeText={setAnswer}
        onSubmitEditing={submitAnswer}
        placeholder="Your answer"
      />
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
  questionText: {
    fontSize: 26,
    fontFamily: "Poppins-Bold",
    marginVertical: 20,
  },
  input: {
    backgroundColor: "#F7C948",
    padding: 10,
    borderRadius: 10,
    width: "80%",
  },
});
