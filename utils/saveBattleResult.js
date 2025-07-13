import { ref, get } from "firebase/database";
import { database } from "../firebase/firebaseConfig";

/**
 * Fetches the last 5 battle results for a given roomId.
 * @param {string} roomId 
 * @returns {Promise<Array<{userId: string, score: number, timestamp: number}>>}
 */
export const fetchLast5BattleResults = async (roomId) => {
  const battleRef = ref(database, `/battleResults/${roomId}`);
  try {
    const snapshot = await get(battleRef);
    if (!snapshot.exists()) return [];

    const allResults = Object.values(snapshot.val());

    const sorted = allResults.sort((a, b) => b.timestamp - a.timestamp);
    return sorted.slice(0, 5);
  } catch (err) {
    console.error("Failed to fetch battle history", err);
    return [];
  }
};
