import { FontAwesome } from "@expo/vector-icons";
import { Tabs, useRouter, useSegments } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Dimensions,
  StyleSheet,
  BackHandler,
  Alert,
  Pressable,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../firebase/firebaseConfig";

const { width } = Dimensions.get("window");
const ACTIVE_COLOR = "#F97316";

export default function TabsLayout() {
  const router = useRouter();
  const segments = useSegments();
  const tabHistory = useRef<string[]>(["home"]);

  const user = auth.currentUser;

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
        // On home tab or no history, show exit alert
        if (currentRoute === "home" || tabHistory.current.length <= 1) {
          Alert.alert("Exit App", "Are you sure you want to quit?", [
            { text: "Cancel", style: "cancel" },
            { text: "Quit", onPress: () => BackHandler.exitApp() },
          ]);
          return true;
        }

        // If we have tab history to go back to
        if (tabHistory.current.length > 1) {
          // Remove current route
          tabHistory.current.pop();
          // Get previous route
          const previousRoute =
            tabHistory.current[tabHistory.current.length - 1];
          // Navigate to previous tab
          router.push(`/user/${previousRoute}` as any);
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: ACTIVE_COLOR,
          tabBarInactiveTintColor: "#aaaaaa",
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabBarItem,
          tabBarButton: (props: any) => {
            const { onPress, children, ...rest } = props;
            return (
              <Pressable
                android_ripple={{ color: "#F97316" }}
                onPress={onPress}
                style={styles.tabButton}
                {...rest}
              >
                {children}
              </Pressable>
            );
          },
        }}
        initialRouteName="home"
      >
        {/* Hidden screens - not shown in tab bar */}
        <Tabs.Screen name="battle-results" options={{ href: null }} />
        <Tabs.Screen name="battle-room" options={{ href: null }} />
        <Tabs.Screen name="battle-screen" options={{ href: null }} />
        <Tabs.Screen
          name="multiplayer-mode-selection"
          options={{ href: null }}
        />
        <Tabs.Screen name="level-select" options={{ href: null }} />
        <Tabs.Screen name="results" options={{ href: null }} />
        <Tabs.Screen name="edit-profile" options={{ href: null }} />
        <Tabs.Screen name="achievements" options={{ href: null }} />
        <Tabs.Screen name="quiz-screen" options={{ href: null }} />

        {/* Visible tab screens */}
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size, focused }) => (
              <FontAwesome
                name="home"
                size={focused ? size + 2 : size}
                color={focused ? ACTIVE_COLOR : color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="learn"
          options={{
            title: "Learn",
            tabBarIcon: ({ color, size, focused }) => (
              <FontAwesome
                name="book"
                size={focused ? size + 2 : size}
                color={focused ? ACTIVE_COLOR : color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="leaderboard"
          options={{
            title: "Leaderboard",
            tabBarIcon: ({ color, size, focused }) => (
              <FontAwesome
                name="trophy"
                size={focused ? size + 2 : size}
                color={focused ? ACTIVE_COLOR : color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size, focused }) => (
              <FontAwesome
                name="user"
                size={focused ? size + 2 : size}
                color={focused ? ACTIVE_COLOR : color}
              />
            ),
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  tabBar: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    height: 70,
    paddingTop: 10,
    paddingBottom: 10,
  },
  tabBarItem: {
    justifyContent: "center",
    alignItems: "center",
  },
  tabButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 12,
    marginHorizontal: 4,
  },
});
