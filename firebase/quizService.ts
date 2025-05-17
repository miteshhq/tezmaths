import { ref, get } from "firebase/database";
import { database } from "./firebaseConfig";

export const getRandomQuestions = async (level: number = 1) => {
  const quizzesRef = ref(database, "quizzes");
  const snapshot = await get(quizzesRef);

  if (!snapshot.exists()) {
    return [];
  }

  const allQuestions: any = [];
  const quizzes = snapshot.val();

  Object.values(quizzes).forEach((quiz: any) => {
    if (quiz.questions && Number(quiz.level) === Number(level)) {
      allQuestions.push(...quiz.questions);
    }
    console.log(allQuestions);
    
  });

  console.log(`Found ${allQuestions.length} questions for level ${level}`);

  // Shuffle questions
  for (let i = allQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
  }

  // Return first 25 questions for the level
  return allQuestions.slice(0, 25);
};
