import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
const logo = require('../../assets/branding/tezmaths-full-logo.png');



export const generateShareUrl = React.forwardRef((props, ref) => {
  const {
    username,
    fullname,
    avatar,
    quizScore,
    totalGameTimeMs,
    formatTime,
    getMotivationalQuote,
  } = props;
  const avatarImages = (avatar) => {
    switch (avatar) {
      case "0":
        return require("../../assets/avatars/avatar1.jpg");
      case "1":
        return require("../../assets/avatars/avatar2.jpg");
      case "2":
        return require("../../assets/avatars/avatar3.jpg");
      case "3":
        return require("../../assets/avatars/avatar4.jpg");
      case "4":
        return require("../../assets/avatars/avatar5.jpg");
      case "5":
        return require("../../assets/avatars/avatar6.jpg");
      default:
        return require("../../assets/avatars/avatar1.jpg");
    }
  };

  return (
    <ViewShot
      ref={ref}
      options={{
        format: 'jpg',
        quality: 0.9,
        result: 'tmpfile',
      }}
      style={styles.viewShot}
    >
      <View style={styles.card}>
        <Text style={styles.username}>@{username}</Text>

        <View style={styles.avatarContainer}>
          <Image
            source={avatarImages(avatar)}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        </View>

        <Text style={styles.fullname}>{fullname}</Text>

        <Text style={styles.quote}>{getMotivationalQuote()}</Text>

        <Text style={styles.score}>Score: {quizScore}</Text>

        <Text style={styles.time}>Time Spent: {formatTime(totalGameTimeMs)}</Text>

        <Text style={styles.downloadButton}>Download Now</Text>

        <View style={styles.footer}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>Sharpen your speed, master your math!</Text>
        </View>
      </View>
    </ViewShot>
  );
});

const styles = StyleSheet.create({
  viewShot: {
    backgroundColor: 'white',
    padding: 20,
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderWidth: 4,
    borderColor: 'white',
    padding: 16,
    borderRadius: 24,
    alignItems: 'center',
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 10,
  },
  avatarContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    borderColor: '#3b82f6', // primary color
    backgroundColor: 'white',
    overflow: 'hidden',
    marginBottom: 16,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  fullname: {
    fontSize: 26,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: '#3b82f6',
    marginBottom: 10,
    textAlign: 'center',
  },
  quote: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  score: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000',
    textAlign: 'center',
    marginBottom: 6,
  },
  time: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  downloadButton: {
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: '#3b82f6',
    color: 'white',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    marginTop: 12,
  },
  logo: {
    height: 30,
    width: 140,
    marginBottom: 4,
  },
  tagline: {
    color: '#000',
    textAlign: 'center',
  },
});
