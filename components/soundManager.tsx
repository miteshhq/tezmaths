import { Audio } from "expo-av";
// Define a type for the play options
interface PlayOptions {
  isLooping?: boolean;
}
// Define a type for the sound keys
type SoundKey =
  | "levelSoundEffect"
  | "rightAnswerSoundEffect"
  | "wrongAnswerSoundEffect"
  | "clappingSoundEffect"
  | "victorySoundEffect"
  | "failSoundEffect";

const SoundManager = {
  sounds: {
    levelSoundEffect: require("../assets/audio/level.mp3"),
    rightAnswerSoundEffect: require("../assets/audio/rightAnswer.mp3"),
    wrongAnswerSoundEffect: require("../assets/audio/wrongAnswer.mp3"),
    clappingSoundEffect: require("../assets/audio/clapping.mp3"),
    victorySoundEffect: require("../assets/audio/victory.mp3"),
    failSoundEffect: require("../assets/audio/failure.mp3"),
  },
  soundObjects: {} as Record<SoundKey, Audio.Sound | undefined>,

  async loadSound(key: SoundKey) {
    if (!this.soundObjects[key]) {
      try {
        console.log(`Loading sound: ${key}`); // Debug log
        const { sound } = await Audio.Sound.createAsync(this.sounds[key]);
        this.soundObjects[key] = sound;
      } catch (error) {
        console.error(`Error loading sound for ${key}:`, error);
      }
    }
  },

  async playSound(key: SoundKey, playOptions: PlayOptions = {}) {
    await this.loadSound(key);
    const sound = this.soundObjects[key];
    if (sound) {
      try {
        console.log(`Playing sound: ${key}`); // Debug log
        await sound.stopAsync(); // Stop any currently playing sound
        // Apply options like looping
        // Set the looping status based on the playOptions
        if (typeof playOptions.isLooping !== "undefined") {
          await sound.setIsLoopingAsync(playOptions.isLooping);
        }

        await sound.playAsync();
      } catch (error) {
        console.error(`Error playing sound for ${key}:`, error);
      }
    } else {
      console.error(`Sound object not available for ${key}`);
    }
  },

  async stopSound(key: SoundKey) {
    const sound = this.soundObjects[key];
    if (sound) {
      try {
        await sound.stopAsync();
      } catch (error) {
        console.error(`Error stopping sound for ${key}:`, error);
      }
    }
  },
};

export default SoundManager;
