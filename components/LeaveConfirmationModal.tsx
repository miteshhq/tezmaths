import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";

interface Props {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function LeaveConfirmationModal({
  visible,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View className="flex-1 bg-black/60 justify-center items-center">
        <View className="bg-white rounded-2xl w-5/6 p-6">
          <Text className="text-xl font-black text-center mb-4">
            Leave Battle?
          </Text>
          <Text className="text-center text-custom-purple mb-6">
            You’ll lose current progress. Are you sure?
          </Text>

          <View className="flex-row justify-between gap-4">
            <TouchableOpacity
              className="flex-1 bg-custom-gray py-3 rounded-xl"
              onPress={onCancel}
            >
              <Text className="text-center text-custom-purple font-bold">
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 bg-red-500 py-3 rounded-xl"
              onPress={onConfirm}
            >
              <Text className="text-center text-white font-bold">
                Yes, Leave
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
