import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect } from "react";

export const useBattleRoomCleanup = (
  resetRoomStates: () => void,
  roomListenerRef?: React.MutableRefObject<(() => void) | null>
) => {
  // Reset when the screen is focused again
  useFocusEffect(
    useCallback(() => {
      resetRoomStates();
    }, [resetRoomStates])
  );

  // Optional: cleanup on unmount too
  useEffect(() => {
    return () => {
      if (roomListenerRef?.current) {
        roomListenerRef.current();
        roomListenerRef.current = null;
      }
      resetRoomStates();
    };
  }, [resetRoomStates, roomListenerRef]);
};
