import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { battleManager } from './battleManager';

const useBattleStartListener = (roomId, isHost) => {
  const router = useRouter();
  const listenerRef = useRef(null);
  const navigationAttempted = useRef(false);

  useEffect(() => {
    if (!roomId) return;

    console.log(`[useBattleStartListener] Setting up listener for room: ${roomId}, isHost: ${isHost}`);

    const cleanup = () => {
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
      navigationAttempted.current = false;
    };

    const handleRoomUpdate = (roomData) => {
      if (!roomData) return;

      console.log(`[useBattleStartListener] Room update - Status: ${roomData.status}, Questions: ${roomData.questions?.length || 0}`);

      // Navigate to battle screen when status changes to "playing" and we have questions
      if (
        roomData.status === "playing" && 
        roomData.questions && 
        roomData.questions.length > 0 && 
        !navigationAttempted.current
      ) {
        navigationAttempted.current = true;
        
        console.log(`[useBattleStartListener] Navigating to battle screen for room: ${roomId}`);
        
        // Small delay to ensure state is properly set
        setTimeout(() => {
          router.replace({
            pathname: "/user/battle-screen",
            params: {
              roomId: roomId,
              isHost: isHost ? "true" : "false",
            },
          });
        }, 500);
      }

      // Handle battle end - navigate back to multiplayer selection
      if (roomData.status === "finished") {
        console.log(`[useBattleStartListener] Battle finished, cleaning up`);
        cleanup();
      }
    };

    // Set up room listener
    listenerRef.current = battleManager.listenToRoom(roomId, handleRoomUpdate);

    return cleanup;
  }, [roomId, isHost, router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, []);
};

export default useBattleStartListener;
