import { FontAwesome } from "@expo/vector-icons";
import { Tabs, useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import React, { useEffect, useState, useRef } from "react"; // Add useRef
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
  ImageBackground,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../firebase/firebaseConfig";

const { width } = Dimensions.get("window");
const ACTIVE_COLOR = "#F97316";

export default function AdminTabsLayout() {
  const router = useRouter();
  const segments = useSegments();
  const tabHistory = useRef<string[]>(["dashboard"]); // Track tab history
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  // Track tab navigation for proper back button behavior
  useEffect(() => {
    const currentRoute = segments[segments.length - 1];
    const adminTabRoutes = [
      "dashboard",
      "user-management",
      "question-management",
      "video-management",
      "referral-points",
    ];

    if (adminTabRoutes.includes(currentRoute)) {
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

  // Enhanced back button handler with tab history
  useEffect(() => {
    const backAction = () => {
      const currentRoute = segments[segments.length - 1];
      const adminTabRoutes = [
        "dashboard",
        "user-management",
        "question-management",
        "video-management",
        "referral-points",
      ];

      if (adminTabRoutes.includes(currentRoute)) {
        // On dashboard tab or no history, show exit alert
        if (currentRoute === "dashboard" || tabHistory.current.length <= 1) {
          Alert.alert(
            "Exit Admin Panel",
            "Are you sure you want to quit the admin panel?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Logout", onPress: () => handleLogout() },
              { text: "Quit", onPress: () => BackHandler.exitApp() },
            ]
          );
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
          router.push(`/admin/${previousRoute}` as any);
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // console.log("Auth state changed:", user?.email);
      setCurrentUser(user);

      if (user) {
        await checkAdminStatus(user);
      } else {
        setIsAdmin(false);
        setLoading(false);
        if (authChecked) {
          router.replace("/login");
        }
      }
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [authChecked]);

  const checkAdminStatus = async (user: User) => {
    try {
      // console.log("Checking admin status for:", user.email);
      const tokenResult = await user.getIdTokenResult();
      const isAdmin = tokenResult.claims.admin === true;
      setIsAdmin(isAdmin);

      if (!isAdmin) {
        // console.log("User is not admin, showing access denied");
        Alert.alert(
          "Access Denied",
          "Admin privileges required to access this area. Please contact administrator to grant admin access.",
          [
            {
              text: "OK",
              onPress: () => setLoading(false),
            },
          ]
        );
      } else {
        // console.log("User is admin, granting access");
      }
    } catch (error) {
      // console.error("Error checking admin status:", error);
      setIsAdmin(false);
      Alert.alert(
        "Authentication Error",
        "Failed to verify admin status. Please try logging in again.",
        [
          {
            text: "Retry",
            onPress: () => checkAdminStatus(user),
          },
          {
            text: "Logout",
            onPress: () => handleLogout(),
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      // console.error("Error signing out:", error);
      Alert.alert("Error", "Failed to logout. Please try again.");
    }
  };

  const handleLogoutConfirm = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: handleLogout,
      },
    ]);
  };

  if (loading && !authChecked) {
    return (
      <SafeAreaView className="flex-1 bg-custom-gray">
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={ACTIVE_COLOR} />
          <Text className="text-gray-600 mt-4">Checking authentication...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && currentUser) {
    return (
      <SafeAreaView className="flex-1 bg-custom-gray">
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={ACTIVE_COLOR} />
          <Text className="text-gray-600 mt-4">Verifying admin access...</Text>
          <Text className="text-gray-500 mt-2 text-sm">
            Logged in as: {currentUser.email}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaView className="flex-1 bg-custom-gray">
        <View className="flex-1 justify-center items-center p-4">
          <Text className="text-xl font-bold text-red-600 mb-4">
            Authentication Required
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            Please log in to access the admin panel.
          </Text>
          <TouchableOpacity
            className="bg-primary px-6 py-3 rounded-lg"
            onPress={() => router.replace("/login")}
          >
            <Text className="text-white font-bold">Go to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView className="flex-1 bg-custom-gray">
        <View className="flex-1 justify-center items-center p-4">
          <Text className="text-xl font-bold text-red-600 mb-4">
            Access Denied
          </Text>
          <Text className="text-gray-600 text-center mb-2">
            You need admin privileges to access this area.
          </Text>
          <Text className="text-gray-500 text-center mb-6 text-sm">
            Logged in as: {currentUser.email}
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="bg-custom-gray0 px-6 py-3 rounded-lg"
              onPress={handleLogout}
            >
              <Text className="text-white font-bold">Logout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-primary px-6 py-3 rounded-lg"
              onPress={() => checkAdminStatus(currentUser)}
            >
              <Text className="text-white font-bold">Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={styles.root}>
        <ImageBackground
          source={require("../../assets/gradient.jpg")}
          style={{ overflow: "hidden", marginTop: 20 }}
        >
          <View className="px-4 py-4">
            <View className="flex-row justify-between items-center">
              <TouchableOpacity onPress={() => router.push("/admin/dashboard")}>
                <Text className="text-white text-3xl font-black">
                  Admin Panel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogoutConfirm}>
                <View className="bg-red-600 py-1 pt-0.5 px-4 rounded-lg">
                  <Text className="text-white font-bold">Logout</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>

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
          initialRouteName="dashboard"
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: "Dashboard",
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
            name="user-management"
            options={{
              title: "Users",
              tabBarIcon: ({ color, size, focused }) => (
                <FontAwesome
                  name="user"
                  size={focused ? size + 2 : size}
                  color={focused ? ACTIVE_COLOR : color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="question-management"
            options={{
              title: "Questions",
              tabBarIcon: ({ color, size, focused }) => (
                <FontAwesome
                  name="question-circle"
                  size={focused ? size + 2 : size}
                  color={focused ? ACTIVE_COLOR : color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="video-management"
            options={{
              title: "Videos",
              tabBarIcon: ({ color, size, focused }) => (
                <FontAwesome
                  name="video-camera"
                  size={focused ? size + 2 : size}
                  color={focused ? ACTIVE_COLOR : color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="referral-points"
            options={{
              title: "Referrals",
              tabBarIcon: ({ color, size, focused }) => (
                <FontAwesome
                  name="star"
                  size={focused ? size + 2 : size}
                  color={focused ? ACTIVE_COLOR : color}
                />
              ),
            }}
          />
        </Tabs>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
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
    fontSize: 18,
    color: "#fff",
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
