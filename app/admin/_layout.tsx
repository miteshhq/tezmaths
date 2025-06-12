import { FontAwesome } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../firebase/firebaseConfig";

const { width } = Dimensions.get("window");
const ACTIVE_COLOR = "#F97316";

export default function AdminTabsLayout() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

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
      console.error("Error checking admin status:", error);
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
      console.error("Error signing out:", error);
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push("/admin/dashboard")}>
            <Text style={styles.headerText}>Tezmaths Admin Panel</Text>
          </TouchableOpacity>
          <View className="flex-row items-center">
            {/* <Text className="text-white mr-3 text-sm">
              {currentUser?.email}
            </Text> */}
            <TouchableOpacity onPress={handleLogoutConfirm}>
              <Text style={styles.headerText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

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
                android_ripple={{ color: "transparent" }}
              />
            ),
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: "Dashboard",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="home" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="user-management"
            options={{
              title: "Users",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="user" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="question-management"
            options={{
              title: "Questions",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="question-circle" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="video-management"
            options={{
              title: "Videos",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="video-camera" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="referral-points"
            options={{
              title: "Referrals",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="star" size={size} color={color} />
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
    fontSize: 18,
    color: "#000",
  },
  tabBar: {
    backgroundColor: "#fff",
    borderColor: "#3b3b3b",
    flexDirection: "row",
    alignItems: "center",
    height: 60,
    paddingTop: 10,
  },
});
