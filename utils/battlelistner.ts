// hooks/useBattleStartListener.ts
import { useEffect } from "react";
import { onValue, ref } from "firebase/database";
import { useRouter } from "expo-router";
import { database } from "../firebase/firebaseConfig";

const useBattleStartListener = (roomId: string, isHost: boolean) => {
  const router = useRouter();

  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(database, `rooms/${roomId}`);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data?.battleStarted) {
        router.replace(`/user/battle-screen?roomId=${roomId}&isHost=${isHost}`);
      }
    });

    return () => unsubscribe();
  }, [roomId, isHost]);
};

export default useBattleStartListener;
