import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { ref, onValue, off } from "firebase/database";
import { database } from "../firebase/firebaseConfig";

const useBattleStartListener = (roomId: string, isHost: boolean) => {
  const router = useRouter();
  const listenerRef = useRef(null);
  const navigationInProgress = useRef(false);

  useEffect(() => {
    if (!roomId) return;

    // CRITICAL FIX: Enhanced battle start listener
    const roomRef = ref(database, `rooms/${roomId}`);
    
    const handleSnapshot = (snapshot) => {
      const roomData = snapshot.val();
      
      if (!roomData) {
        console.log("Room data not found, navigating to home");
        if (!navigationInProgress.current) {
          navigationInProgress.current = true;
          router.replace("/user/home");
        }
        return;
      }

      // Navigate when battle starts
      if (roomData.status === "playing" && !navigationInProgress.current) {
        navigationInProgress.current = true;
        console.log("Battle started, navigating to battle screen");
        
        router.replace({
          pathname: "/user/battle-screen",
          params: { 
            roomId,
            isHost: isHost.toString()
          },
        });
      }
    };

    const handleError = (error) => {
      console.error("Battle start listener error:", error);
      if (!navigationInProgress.current) {
        navigationInProgress.current = true;
        router.replace("/user/home");
      }
    };

    listenerRef.current = onValue(roomRef, handleSnapshot, handleError);

    return () => {
      if (listenerRef.current) {
        off(roomRef, "value", listenerRef.current);
        listenerRef.current = null;
      }
      navigationInProgress.current = false;
    };
  }, [roomId, isHost, router]);

  return null;
};

export default useBattleStartListener;
