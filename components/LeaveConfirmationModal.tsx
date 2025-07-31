import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";

interface LeaveConfirmationModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

const LeaveConfirmationModal: React.FC<LeaveConfirmationModalProps> = ({
  visible,
  onCancel,
  onConfirm,
  title = "Leave Battle?",
  message = "Are you sure you want to leave this battle? Your progress will be lost.",
  confirmText = "Leave",
  cancelText = "Stay",
  isLoading = false,
}) => {
  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch (error) {
      console.error("Confirm action error:", error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="bg-white rounded-2xl p-6 mx-6 w-80">
          <Text className="text-xl font-bold text-center mb-4">{title}</Text>

          <Text className="text-gray-600 text-center mb-6 leading-5">
            {message}
          </Text>

          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 bg-gray-200 py-3 px-4 rounded-xl"
              onPress={onCancel}
              disabled={isLoading}
            >
              <Text className="text-gray-700 font-bold text-center">
                {cancelText}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-1 py-3 px-4 rounded-xl ${
                isLoading ? "bg-red-300" : "bg-red-500"
              }`}
              onPress={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-bold text-center">
                  {confirmText}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default LeaveConfirmationModal;
