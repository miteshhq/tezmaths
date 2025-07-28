import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";

export default function LeaveConfirmationModal({
  visible,
  onConfirm,
  onCancel,
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error("Leave confirmation error:", error);
    }
  };

  const handleCancel = () => {
    if (isProcessing) return;
    onCancel();
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleCancel}
    >
      <View className="flex-1 bg-black/60 justify-center items-center">
        <View className="bg-white rounded-2xl w-5/6 p-6">
          <Text className="text-xl font-black text-center mb-4">
            Leave Battle?
          </Text>
          <Text className="text-center text-custom-purple mb-6">
            You'll lose current progress. Are you sure?
          </Text>

          <View className="flex-row justify-between gap-4">
            <TouchableOpacity
              className={`flex-1 py-3 rounded-xl ${
                isProcessing ? "bg-gray-300" : "bg-custom-gray"
              }`}
              onPress={handleCancel}
              disabled={isProcessing}
            >
              <Text className="text-center text-custom-purple font-bold">
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-1 py-3 rounded-xl ${
                isProcessing ? "bg-gray-400" : "bg-red-500"
              }`}
              onPress={handleConfirm}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-center text-white font-bold">
                  Yes, Leave
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
