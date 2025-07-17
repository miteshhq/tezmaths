import { ref, update } from "firebase/database";
import { database } from "../firebase/firebaseConfig";

/**
 * Ends the battle when the host exits by updating room status in Realtime Database.
 * @param {string} roomId - The ID of the room to mark as finished.
 */
export const endBattleDueToHostExit = async (roomId) => {
    try {
        const roomRef = ref(database, `rooms/${roomId}`);
        await update(roomRef, {
            status: "finished",
            endedBy: "host",
            endedAt: Date.now(),
        });
        // console.log("✅ Battle ended due to host exit.");
    } catch (error) {
        console.error("❌ Failed to end battle:", error);
    }
};