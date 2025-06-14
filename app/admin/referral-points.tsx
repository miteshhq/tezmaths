import { get, ref } from "firebase/database";
import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { database } from "../../firebase/firebaseConfig";

interface UserData {
  fullName: string;
  username: string;
  phoneNumber: string;
  email: string;
  referrals: number;
  totalPoints: number;
  streak: number;
  highestCompletedLevelCompleted: number;
}

interface ReferralStats {
  totalUsers: number;
  totalReferrals: number;
  totalReferralPoints: number;
  topReferrers: Array<{
    username: string;
    fullName: string;
    referrals: number;
    points: number;
  }>;
}

export default function ReferralPoints() {
  const [stats, setStats] = useState<ReferralStats>({
    totalUsers: 0,
    totalReferrals: 0,
    totalReferralPoints: 0,
    topReferrers: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReferralData = async () => {
    try {
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        let totalRefs = 0;
        let totalUsers = 0;
        const referrers: Array<{
          username: string;
          fullName: string;
          referrals: number;
          points: number;
        }> = [];

        snapshot.forEach((childSnapshot) => {
          const userData: UserData = childSnapshot.val();
          totalUsers++;
          const userReferrals = userData.referrals ?? 0;
          totalRefs += userReferrals;
          if (userReferrals > 0) {
            referrers.push({
              username: userData.username,
              fullName: userData.fullName,
              referrals: userReferrals,
              points: userData.totalPoints ?? 0,
            });
          }
        });

        const topReferrers = referrers
          .sort((a, b) => b.referrals - a.referrals)
          .slice(0, 10);

        setStats({
          totalUsers,
          totalReferrals: totalRefs,
          totalReferralPoints: totalRefs * 10,
          topReferrers,
        });
      }
    } catch (error) {
      // console.error("Failed to fetch referral data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReferralData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReferralData();
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-custom-gray">
        <Text className="text-gray-600 text-lg font-medium">
          Loading referral data...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-custom-gray"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View className="p-6">
        {/* Header */}
        <Text className="text-3xl font-bold text-black text-center mb-8">
          Referral Analytics Dashboard
        </Text>

        {/* Overview Cards */}
        <View className="mb-8">
          <Text className="text-xl font-semibold text-gray-700 mb-4">
            Overview
          </Text>
          <View className="flex-row flex-wrap justify-between">
            <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-4 w-[48%]">
              <Text className="text-2xl font-bold text-black">
                {stats.totalUsers}
              </Text>
              <Text className="text-gray-600 text-sm">Total Users</Text>
            </View>
            <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-4 w-[48%]">
              <Text className="text-2xl font-bold text-black">
                {stats.totalReferrals}
              </Text>
              <Text className="text-gray-600 text-sm">Total Referrals</Text>
            </View>
          </View>
          <View className="bg-primary-100 rounded-2xl p-6 border-2 border-primary-200">
            <Text className="text-2xl font-bold text-black text-center">
              {stats.totalReferralPoints}
            </Text>
            <Text className="text-gray-600 text-center text-sm mt-1">
              Total Referral Points Distributed
            </Text>
          </View>
        </View>

        {/* Top Referrers */}
        <View className="mb-6">
          <Text className="text-xl font-semibold text-gray-700 mb-4">
            Top Referrers
          </Text>
          {stats.topReferrers.length > 0 ? (
            <View className="bg-white rounded-2xl shadow-sm border border-gray-200">
              {stats.topReferrers.map((user, index) => (
                <View
                  key={user.username}
                  className={`p-4 flex-row justify-between items-center ${
                    index !== stats.topReferrers.length - 1
                      ? "border-b border-gray-200"
                      : ""
                  }`}
                >
                  <View className="flex-1">
                    <View className="flex-row items-center mb-1">
                      <View
                        className={`w-6 h-6 rounded-full mr-3 justify-center items-center ${
                          index === 0
                            ? "bg-yellow-400"
                            : index === 1
                            ? "bg-gray-400"
                            : index === 2
                            ? "bg-orange-400"
                            : "bg-primary-200"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            index < 3 ? "text-white" : "text-primary-600"
                          }`}
                        >
                          {index + 1}
                        </Text>
                      </View>
                      <Text className="font-semibold text-black text-base flex-1">
                        {user.fullName}
                      </Text>
                    </View>
                    <Text className="text-gray-600 text-xs ml-9">
                      @{user.username}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-bold text-black text-lg">
                      {user.referrals}
                    </Text>
                    <Text className="text-gray-600 text-xs">referrals</Text>
                    <Text className="text-gray-500 text-xs">
                      {user.points} pts
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <Text className="text-gray-600 text-center">
                No referrals yet
              </Text>
            </View>
          )}
        </View>

        {/* Additional Stats */}
        <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <Text className="text-xl font-semibold text-gray-700 mb-4">
            Additional Insights
          </Text>
          <View className="space-y-3">
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Avg. Referrals per User:</Text>
              <Text className="font-semibold text-black">
                {stats.totalUsers > 0
                  ? (stats.totalReferrals / stats.totalUsers).toFixed(2)
                  : 0}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">
                Points per Referral (to upliner):
              </Text>
              <Text className="font-semibold text-black">10 points</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">
                Points per Referral (to new user):
              </Text>
              <Text className="font-semibold text-black">5 points</Text>
            </View>
          </View>
        </View>

        {/* Refresh Note */}
        <Text className="text-gray-400 text-xs text-center mt-6">
          Pull down to refresh data
        </Text>
      </View>
    </ScrollView>
  );
}
