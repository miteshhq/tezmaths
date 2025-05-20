import { ref, set, get } from "firebase/database";
import { database, auth } from "../../firebase/firebaseConfig";

async function createSession(level: number, isOpen: boolean) {
  const userId = auth.currentUser?.uid;
  const sessionId = ref(database, "multiplayerSessions").push().key;
  const roomCode = generateRoomCode();
  const questions = await getRandomQuestions(level); // Reuse from QuizScreen.tsx

  const sessionData = {
    hostId: userId,
    roomCode,
    level,
    questions: questions.map((q, i) => ({
      quizId: q.quizId,
      questionIndex: i,
    })),
    participants: { [userId]: { score: 0, answers: {} } },
    status: "waiting",
    currentQuestionIndex: 0,
    questionStartTime: 0,
    timeLimit: 30,
    isOpen,
  };

  await set(ref(database, `multiplayerSessions/${sessionId}`), sessionData);
  router.push(`/user/SessionLobby?sessionId=${sessionId}`);
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
