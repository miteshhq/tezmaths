import { useFocusEffect, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import {
  Alert,
  BackHandler,
  Dimensions,
  StyleSheet
} from "react-native";
import { auth } from "../../firebase/firebaseConfig";

const tabRoutes = ["home", "learn", "leaderboard", "profile"];
const { width } = Dimensions.get("window");
const ACTIVE_COLOR = "#F97316";

export default function TabsLayout() {
  const router = useRouter();
  const segments = useSegments();

  const user = auth.currentUser;

  const tabHistory = useRef<string[]>(["home"]);
  const isFirstMount = useRef(true);

  // Prevent infinite loop by only navigating to home if not already there
  useFocusEffect(
    useCallback(() => {
      const currentRoute = segments[segments.length - 1];

      if (isFirstMount.current) {
        isFirstMount.current = false;

        if (router.canGoBack?.()) {
          router.dismissAll?.();
        }

        if (currentRoute !== "home") {
          router.replace("/user/home");
        }
      }
    }, [segments, router])
  );

  // Track tab navigation history
  useEffect(() => {
    const currentRoute = segments[segments.length - 1];

    if (tabRoutes.includes(currentRoute)) {
      const lastRoute = tabHistory.current[tabHistory.current.length - 1];
      if (currentRoute !== lastRoute) {
        tabHistory.current.push(currentRoute);

        // Keep history max length = 10
        if (tabHistory.current.length > 10) {
          tabHistory.current = tabHistory.current.slice(-10);
        }
      }
    }
  }, [segments]);

  // Handle Android back button behavior
  useEffect(() => {
    const backAction = () => {
      const currentRoute = segments[segments.length - 1];

      if (tabRoutes.includes(currentRoute)) {
        if (currentRoute === "home" && tabHistory.current.length <= 1) {
          Alert.alert("Exit App", "Are you sure you want to quit?", [
            { text: "Cancel", style: "cancel" },
            { text: "Quit", onPress: () => BackHandler.exitApp() },
          ]);
          return true;
        }

        if (tabHistory.current.length > 1) {
          tabHistory.current.pop();
          const previousRoute =
            tabHistory.current[tabHistory.current.length - 1];

          router.push(`/user/${previousRoute}` as any);
          return true;
        }

        return false;
      }

      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [segments, router]);

  return null; // Replace with your Tab Navigator if needed
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFF2CC" },
  header: {
    height: 60,
    backgroundColor: ACTIVE_COLOR,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  headerText: {
    fontFamily: "Poppins-Bold",
    fontSize: 20,
    color: "#000",
  },
  notificationIcon: { width: 24, height: 24, resizeMode: "contain" },
  tabBar: {
    backgroundColor: "#fff",
    borderColor: "#3b3b3b",
    flexDirection: "row",
    alignItems: "center",
    height: 60,
    paddingTop: 10,
  },
});
