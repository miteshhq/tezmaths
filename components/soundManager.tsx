import { Audio } from "expo-audio";

// Define a type for the play options
interface PlayOptions {
  isLooping?: boolean;
  volume?: number;
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
  soundObjects: {} as Record<SoundKey, Audio.AudioPlayer | undefined>,
  isInitialized: false,
  isInitializing: false,

  async initialize() {
    if (this.isInitialized || this.isInitializing) return;

    this.isInitializing = true;

    try {
      // Configure audio mode for better performance
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        interruptionModeIOS: Audio.InterruptionModeIOS.DoNotMix,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: Audio.InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
      });

      this.isInitialized = true;
      console.log("SoundManager initialized successfully");
    } catch (error) {
      console.error("Error initializing SoundManager:", error);
    } finally {
      this.isInitializing = false;
    }
  },

  async loadSound(key: SoundKey): Promise<boolean> {
    if (this.soundObjects[key]) {
      return true; // Already loaded
    }

    try {
      await this.initialize();
      console.log(`Loading sound: ${key}`);

      // Create new audio player instance
      const player = new Audio.AudioPlayer(this.sounds[key]);

      // Wait for the sound to load completely
      await player.load();

      // Store the loaded player
      this.soundObjects[key] = player;

      console.log(`Successfully loaded sound: ${key}`);
      return true;
    } catch (error) {
      console.error(`Error loading sound for ${key}:`, error);
      return false;
    }
  },

  async playSound(key: SoundKey, playOptions: PlayOptions = {}) {
    try {
      // Ensure sound is loaded before playing
      const isLoaded = await this.loadSound(key);
      if (!isLoaded) {
        console.error(`Failed to load sound: ${key}`);
        return;
      }

      const player = this.soundObjects[key];

      if (!player) {
        console.error(`Sound player not available for ${key}`);
        return;
      }

      console.log(`Playing sound: ${key}`);

      // Reset position and stop if playing
      try {
        if (player.isPlaying) {
          await player.stop();
        }

        // Reset to beginning
        await player.seekTo(0);
      } catch (resetError) {
        console.warn(`Warning: Could not reset player for ${key}:`, resetError);
      }

      // Set volume if specified (0.0 to 1.0)
      if (typeof playOptions.volume !== "undefined") {
        player.volume = Math.max(0, Math.min(1, playOptions.volume));
      }

      // Set looping if specified
      if (typeof playOptions.isLooping !== "undefined") {
        player.loop = playOptions.isLooping;
      }

      // Play the sound
      await player.play();
      console.log(`Successfully started playing: ${key}`);
    } catch (error) {
      console.error(`Error playing sound for ${key}:`, error);

      // Try to reload the sound if playing failed
      try {
        delete this.soundObjects[key];
        console.log(`Attempting to reload sound: ${key}`);
        await this.loadSound(key);
      } catch (reloadError) {
        console.error(`Failed to reload sound ${key}:`, reloadError);
      }
    }
  },

  async stopSound(key: SoundKey) {
    const player = this.soundObjects[key];
    if (player) {
      try {
        if (player.isPlaying) {
          await player.stop();
          console.log(`Stopped sound: ${key}`);
        }
      } catch (error) {
        console.error(`Error stopping sound for ${key}:`, error);
      }
    }
  },

  async stopAllSounds() {
    try {
      const stopPromises = Object.keys(this.soundObjects).map((key) =>
        this.stopSound(key as SoundKey)
      );
      await Promise.all(stopPromises);
      console.log("All sounds stopped");
    } catch (error) {
      console.error("Error stopping all sounds:", error);
    }
  },

  async unloadAll() {
    try {
      // First stop all sounds
      await this.stopAllSounds();

      // Then unload all sound objects
      const unloadPromises = Object.entries(this.soundObjects).map(
        async ([key, player]) => {
          if (player) {
            try {
              await player.unload();
              console.log(`Unloaded sound: ${key}`);
            } catch (error) {
              console.error(`Error unloading sound ${key}:`, error);
            }
          }
        }
      );

      await Promise.all(unloadPromises);

      // Clear the soundObjects
      this.soundObjects = {} as Record<SoundKey, Audio.AudioPlayer | undefined>;
      this.isInitialized = false;
      this.isInitializing = false;

      console.log("All sounds unloaded and SoundManager reset");
    } catch (error) {
      console.error("Error unloading sounds:", error);
    }
  },

  // Utility method to preload all sounds
  async preloadAllSounds() {
    try {
      console.log("Preloading all sounds...");
      const loadPromises = Object.keys(this.sounds).map((key) =>
        this.loadSound(key as SoundKey)
      );

      const results = await Promise.all(loadPromises);
      const successCount = results.filter(Boolean).length;

      console.log(
        `Preloaded ${successCount}/${Object.keys(this.sounds).length} sounds`
      );
      return successCount === Object.keys(this.sounds).length;
    } catch (error) {
      console.error("Error preloading sounds:", error);
      return false;
    }
  },

  // Check if a specific sound is loaded
  isSoundLoaded(key: SoundKey): boolean {
    return !!this.soundObjects[key];
  },

  // Get the status of all sounds
  getSoundStatus() {
    const status: Record<SoundKey, boolean> = {} as Record<SoundKey, boolean>;
    Object.keys(this.sounds).forEach((key) => {
      status[key as SoundKey] = this.isSoundLoaded(key as SoundKey);
    });
    return status;
  },
};

export default SoundManager;
