import { FontAwesome } from "@expo/vector-icons";
import { Tabs, useRouter, useSegments, useFocusEffect } from "expo-router";
import React, { useEffect, useRef, useCallback } from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../firebase/firebaseConfig";

const { width } = Dimensions.get("window");
const ACTIVE_COLOR = "#F97316";

export default function TabsLayout() {
  const router = useRouter();
  const segments = useSegments();
  const tabHistory = useRef(["home"]);
  const isFirstMount = useRef(true);

  const user = auth.currentUser;
  if (!user) {
    router.replace("/login");
    return null;
  }

  // Clear navigation stack when first entering tabs
  useFocusEffect(
    useCallback(() => {
      if (isFirstMount.current) {
        isFirstMount.current = false;
        // Clear any previous navigation history to prevent going back to results
        if (router.canGoBack()) {
          router.dismissAll();
        }
        // Ensure we start at home
        router.replace("/user/home");
      }
    }, [router])
  );

  // Track tab navigation for proper back button behavior
  useEffect(() => {
    const currentRoute = segments[segments.length - 1];
    const tabRoutes = ["home", "learn", "leaderboard", "profile"];

    if (tabRoutes.includes(currentRoute)) {
      const lastRoute = tabHistory.current[tabHistory.current.length - 1];
      if (currentRoute !== lastRoute) {
        tabHistory.current.push(currentRoute);
        // Keep history manageable (max 10 entries)
        if (tabHistory.current.length > 10) {
          tabHistory.current = tabHistory.current.slice(-10);
        }
      }
    }
  }, [segments]);

  // Handle back button with proper tab history
  useEffect(() => {
    const backAction = () => {
      const currentRoute = segments[segments.length - 1];
      const tabRoutes = ["home", "learn", "leaderboard", "profile"];

      if (tabRoutes.includes(currentRoute)) {
        // If we have tab history to go back to
        if (tabHistory.current.length > 1) {
          // Remove current route
          tabHistory.current.pop();
          // Get previous route
          const previousRoute =
            tabHistory.current[tabHistory.current.length - 1];
          // Navigate to previous tab
          router.push(`/user/${previousRoute}`);
          return true;
        } else {
          // No history, exit app
          BackHandler.exitApp();
          return true;
        }
      }

      // For non-tab screens, allow default back behavior
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [segments, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={styles.root}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            tabBarActiveTintColor: ACTIVE_COLOR,
            tabBarInactiveTintColor: "#aaaaaa",
            tabBarStyle: styles.tabBar,
            tabBarItemStyle: { width: "100%", height: "100%" },
            tabBarButton: (props) => (
              <TouchableOpacity
                {...props}
                android_ripple={{ color: "#F97316" }}
                onPress={() => {
                  // Custom tab press to create navigation history
                  if (props.onPress) {
                    props.onPress();
                  }
                }}
              />
            ),
          }}
          initialRouteName="home"
        >
          <Tabs.Screen name="battle-results" options={{ href: null }} />
          <Tabs.Screen name="battle-room" options={{ href: null }} />
          <Tabs.Screen name="battle-screen" options={{ href: null }} />
          <Tabs.Screen name="matching-screen" options={{ href: null }} />
          <Tabs.Screen
            name="multiplayer-mode-selection"
            options={{ href: null }}
          />
          <Tabs.Screen name="level-select" options={{ href: null }} />
          <Tabs.Screen name="results" options={{ href: null }} />
          <Tabs.Screen name="edit-profile" options={{ href: null }} />
          <Tabs.Screen name="achievements" options={{ href: null }} />
          <Tabs.Screen name="quiz-screen" options={{ href: null }} />
          <Tabs.Screen
            name="home"
            options={{
              title: "Home",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="home" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="learn"
            options={{
              title: "Learn",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="book" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="leaderboard"
            options={{
              title: "Leaderboard",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="trophy" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="user" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </SafeAreaView>
  );
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
