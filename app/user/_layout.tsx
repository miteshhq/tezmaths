import { useFocusEffect, useRouter, useSegments } from "expo-router";
import React from "react";

import { useCallback, useEffect, useRef } from "react";
import { Alert, BackHandler, Dimensions, StyleSheet, View } from "react-native";
import { auth } from "../../firebase/firebaseConfig";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

const tabRoutes = ["home", "learn", "leaderboard", "profile"];

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: "home-outline",
  learn: "book-outline",
  leaderboard: "trophy-outline",
  profile: "person-outline",
};
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
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={styles.root}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            tabBarActiveTintColor: ACTIVE_COLOR,
            tabBarInactiveTintColor: "#aaaaaa", // Add this
            tabBarStyle: styles.tabBar, // Add this
            tabBarItemStyle: { width: "100%", height: "100%" }, // Update this
          }}
          initialRouteName="home" // Add this
        >
          {tabRoutes.map((name) => (
            <Tabs.Screen
              key={name}
              name={name}
              options={{
                tabBarIcon: ({ color, size, focused }) => (
                  <View
                    style={[
                      styles.tabIconWrapper,
                      focused && styles.tabIconFocused,
                    ]}
                  >
                    <Ionicons
                      name={iconMap[name]}
                      size={focused ? size + 2 : size}
                      color={focused ? ACTIVE_COLOR : color}
                    />
                  </View>
                ),
              }}
            />
          ))}
        </Tabs>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFF2CC" }, // Add this
  tabBar: {
    backgroundColor: "#fff",
    borderColor: "#3b3b3b",
    flexDirection: "row",
    alignItems: "center",
    height: 60, // Change from 70 to 60
    paddingTop: 10,
    // Remove the other properties that were in new version
  },
  tabBarItem: {
    width: "100%", // Change from flex: 1
    height: "100%", // Add this
    // Remove marginHorizontal: 50
    justifyContent: "center",
    alignItems: "center",
  },
  // Keep your existing tabIconWrapper and tabIconFocused styles
  tabIconWrapper: {
    padding: 10,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconFocused: {
    backgroundColor: "#FFF7ED",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});
