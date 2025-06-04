import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { ref, get } from "firebase/database";
import { database } from "../../firebase/firebaseConfig";
import { useRouter } from "expo-router";

interface DashboardStats {
  totalUsers: number;
  totalReferrals: number;
  totalReferralPoints: number;
  totalQuizzes: number;
  totalVideos: number;
  totalPointsDistributed: number;
}

interface UserData {
  fullName: string;
  username: string;
  referrals: number;
  totalPoints: number;
  isnewuser: boolean;
  streak: number;
  highestCompletedLevelCompleted: number;
  lastCompletionDate: string | null;
}

const Dashboard = () => {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalReferrals: 0,
    totalReferralPoints: 0,
    totalQuizzes: 0,
    totalVideos: 0,
    totalPointsDistributed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        let totalUsers = 0;
        let totalRefs = 0;
        let totalPoints = 0;

        snapshot.forEach((childSnapshot) => {
          const userData: UserData = childSnapshot.val();
          totalUsers++;
          totalRefs += userData.referrals ?? 0;
          totalPoints += userData.totalPoints ?? 0;
        });

        const quizzesRef = ref(database, "quizzes");
        const videosRef = ref(database, "videos");
        const [quizzesSnapshot, videosSnapshot] = await Promise.all([
          get(quizzesRef),
          get(videosRef),
        ]);

        const totalQuizzes = quizzesSnapshot.exists()
          ? Object.keys(quizzesSnapshot.val()).length
          : 0;
        const totalVideos = videosSnapshot.exists()
          ? Object.keys(videosSnapshot.val()).length
          : 0;

        setStats({
          totalUsers,
          totalReferrals: totalRefs,
          totalReferralPoints: totalRefs * 10,
          totalQuizzes,
          totalVideos,
          totalPointsDistributed: totalPoints,
        });
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const navigationButtons = [
    {
      title: "Manage Users",
      subtitle: "View and manage user accounts",
      icon: "👥",
      route: "/admin/user-management",
      color: "bg-blue-500",
    },
    {
      title: "Manage Quizzes",
      subtitle: "Create and edit quiz content",
      icon: "📝",
      route: "/admin/question-management",
      color: "bg-green-500",
    },
    {
      title: "Manage Videos",
      subtitle: "Upload and organize video content",
      icon: "🎥",
      route: "/admin/video-management",
      color: "bg-purple-500",
    },
    {
      title: "Referral Analytics",
      subtitle: "View detailed referral insights",
      icon: "📊",
      route: "/admin/referral-points",
      color: "bg-orange-500",
    },
  ];

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600 text-lg font-medium">
          Loading dashboard...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View className="p-6">
        {/* Header */}
        <View className="mb-8">
          <Text className="text-3xl font-bold text-gray-800 mb-2">
            Admin Dashboard
          </Text>
          <Text className="text-gray-600">
            Monitor your app's performance and manage content
          </Text>
        </View>

        {/* Key Metrics */}
        <View className="mb-8">
          <Text className="text-xl font-semibold text-gray-700 mb-4">
            Key Metrics
          </Text>
          <View className="flex-row flex-wrap justify-between">
            <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-4 w-[48%]">
              <Text className="text-2xl font-bold text-gray-800">
                {stats.totalUsers}
              </Text>
              <Text className="text-gray-600 text-sm">Total Users</Text>
            </View>
            <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-4 w-[48%]">
              <Text className="text-2xl font-bold text-gray-800">
                {stats.totalReferrals}
              </Text>
              <Text className="text-gray-600 text-sm">Total Referrals</Text>
              <Text className="text-gray-500 text-xs mt-1">
                {stats.totalReferralPoints} points distributed
              </Text>
            </View>
          </View>
        </View>

        {/* Content Stats */}
        <View className="mb-8">
          <Text className="text-xl font-semibold text-gray-700 mb-4">
            Content Statistics
          </Text>
          <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-row items-center">
                <Text className="text-2xl mr-3">📝</Text>
                <View>
                  <Text className="font-semibold text-gray-800">Quizzes</Text>
                  <Text className="text-gray-600 text-sm">Total available</Text>
                </View>
              </View>
              <Text className="text-2xl font-bold text-gray-800">
                {stats.totalQuizzes}
              </Text>
            </View>
            <View className="h-px bg-gray-100 mb-4" />
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Text className="text-2xl mr-3">🎥</Text>
                <View>
                  <Text className="font-semibold text-gray-800">Videos</Text>
                  <Text className="text-gray-600 text-sm">Total available</Text>
                </View>
              </View>
              <Text className="text-2xl font-bold text-gray-800">
                {stats.totalVideos}
              </Text>
            </View>
          </View>
        </View>

        {/* Points Summary */}
        <View className="mb-8">
          <View className="bg-primary-100 rounded-2xl p-6 border-2 border-primary-200">
            <Text className="text-2xl font-bold text-gray-800 text-center">
              {stats.totalPointsDistributed.toLocaleString()}
            </Text>
            <Text className="text-gray-600 text-center text-sm mt-1">
              Total Points in Circulation
            </Text>
          </View>
        </View>

        {/* Management Buttons */}
        <View className="mb-6">
          <Text className="text-xl font-semibold text-gray-700 mb-4">
            Quick Actions
          </Text>
          <View className="flex flex-col gap-4">
            {navigationButtons.map((button, index) => (
              <TouchableOpacity
                key={index}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex-row items-center"
                onPress={() => router.push(button.route)}
                activeOpacity={0.7}
              >
                <View
                  className={`w-12 h-12 rounded-xl ${button.color} justify-center items-center mr-4`}
                >
                  <Text className="text-2xl">{button.icon}</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-gray-800 text-lg">
                    {button.title}
                  </Text>
                  <Text className="text-gray-600 text-sm">
                    {button.subtitle}
                  </Text>
                </View>
                <Text className="text-gray-400 text-xl">›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* System Health */}
        <View className="mb-6">
          <Text className="text-xl font-semibold text-gray-700 mb-4">
            System Health
          </Text>
          <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-gray-600">User Engagement</Text>
              <View className="flex-row items-center">
                <View className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                <Text className="font-semibold text-green-600">Healthy</Text>
              </View>
            </View>
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-gray-600">Content Coverage</Text>
              <View className="flex-row items-center">
                <View className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
                <Text className="font-semibold text-blue-600">Good</Text>
              </View>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-gray-600">Referral Program</Text>
              <View className="flex-row items-center">
                <View className="w-2 h-2 bg-orange-500 rounded-full mr-2" />
                <Text className="font-semibold text-orange-600">Active</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Last Updated */}
        <Text className="text-gray-400 text-xs text-center">
          Last updated: {new Date().toLocaleString()}
        </Text>
        <Text className="text-gray-400 text-xs text-center mt-1">
          Pull down to refresh
        </Text>
      </View>
    </ScrollView>
  );
};

export default Dashboard;
