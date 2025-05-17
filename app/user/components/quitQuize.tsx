// app/user/learn.tsx
import React, { useState, useEffect } from 'react';
import { View, Text,Image, TouchableOpacity, Alert } from 'react-native';
import { router, useLocalSearchParams } from "expo-router";


export default function QuiteQuiz() {


const handleQuite=()=>{
  Alert.alert(
    'Are you sure you want to quit the quiz?',
    'This will not affect your progress as your quiz level progress is being saved.',
    [
      {
        text: "",
        style: "cancel", // Ensures it looks like a cancel button
      },
      {
        text: 'Quite any way!',
        onPress: () => {
          router.replace("/dashboard");
        },
      },
    ],
    { cancelable: true }
  );
  return;

}


    return (
<View>
<TouchableOpacity style={{  flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7C948",
  height:40,
  width:130,
    borderRadius: 20,
    display:'flex',justifyContent:'center',}}
    onPress={()=>handleQuite()}>
      <Image source={require('../../../assets/images/quiteQuize.png')} style={{width:20,height:20}} />
<Text style={{ fontSize: 17,
    color: "#333",
    fontFamily: "Poppins-Bold",}}>
      Exit Quiz
    </Text>

</TouchableOpacity>

</View>
    );
}

