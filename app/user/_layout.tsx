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

<<<<<<< HEAD
=======


// Define tab routes as a union type for safety
type TabRoute = "home" | "learn" | "leaderboard" | "profile";

const tabRoutes: TabRoute[] = ["home", "learn", "leaderboard", "profile"];

const iconMap: Record<TabRoute, keyof typeof Ionicons.glyphMap> = {
  home: "home-outline",
  learn: "book-outline",
  leaderboard: "trophy-outline",
  profile: "person-outline",
};

>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
const { width } = Dimensions.get("window");
const ACTIVE_COLOR = "#F97316";

export default function TabsLayout() {
  const router = useRouter();
  const segments = useSegments();
<<<<<<< HEAD
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
=======
  const user = auth.currentUser;

  const tabHistory = useRef<TabRoute[]>(["home"]);
  const isFirstMount = useRef(true);

  // On initial mount, route to /user/home
  useFocusEffect(
    useCallback(() => {
      const currentRoute = segments[segments.length - 1] as TabRoute;

      if (isFirstMount.current) {
        isFirstMount.current = false;

        if (router.canGoBack?.()) {
          router.dismissAll?.();
        }
        if (currentRoute && currentRoute !== "home") {
          router.replace("/user/home");
        } else {
          tabHistory.current = ["home"];
        }
      }
    }, [segments, router])
  );
  // Track visited tabs
  useEffect(() => {
    const currentRoute = segments[segments.length - 1] as TabRoute;

    if (currentRoute && tabRoutes.includes(currentRoute)) {
      const last = tabHistory.current[tabHistory.current.length - 1];
      if (currentRoute !== last) {
        tabHistory.current.push(currentRoute);

        // Limit history to last 10
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
        if (tabHistory.current.length > 10) {
          tabHistory.current = tabHistory.current.slice(-10);
        }
      }
    }
  }, [segments]);

  // Handle back button with proper tab history
  useEffect(() => {
    const backAction = () => {
<<<<<<< HEAD
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
=======
      const currentRoute = segments[segments.length - 1] as TabRoute | undefined;

      if (currentRoute === "home" || tabHistory.current.length <= 1) {
        Alert.alert("Exit App", "Are you sure you want to quit?", [
          { text: "Cancel", style: "cancel" },
          { text: "Quit", onPress: () => BackHandler.exitApp() },
        ]);
        return true;
      }
      // Navigate back in tab history
      if (tabHistory.current.length > 1) {
        tabHistory.current.pop();
        const previousRoute = tabHistory.current[tabHistory.current.length - 1];

        // Fully resolved, statically known path — type-safe
        router.replace(`/user/${previousRoute}`);
        return true;
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
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

<<<<<<< HEAD
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
=======

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
          }}
          initialRouteName="home"
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
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
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
<<<<<<< HEAD
  tabButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 12,
    marginHorizontal: 4,
=======
  // Keep your existing tabIconWrapper and tabIconFocused styles
  tabIconWrapper: {
    // padding: 10,
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
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
  },
});
