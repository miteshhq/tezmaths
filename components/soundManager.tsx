import { Audio } from "expo-av";

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
  soundObjects: {} as Record<SoundKey, Audio.Sound | undefined>,
  isInitialized: false,
  isInitializing: false,

  async initialize() {
    if (this.isInitialized || this.isInitializing) return;

    this.isInitializing = true;

    try {
      // Simpler audio mode configuration
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      this.isInitialized = true;
      //   console.log("SoundManager initialized successfully");
    } catch (error) {
      // console.error("Error initializing SoundManager:", error);
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
      //   console.log(`Loading sound: ${key}`);

      // Create new sound object
      const { sound } = await Audio.Sound.createAsync(this.sounds[key]);

      // Store the loaded sound
      this.soundObjects[key] = sound;

      //   console.log(`Successfully loaded sound: ${key}`);
      return true;
    } catch (error) {
      // console.error(`Error loading sound for ${key}:`, error);
      return false;
    }
  },

  async stopSound(key: SoundKey) {
    const sound = this.soundObjects[key];
    if (sound) {
      try {
        // First set looping to false to ensure it stops completely
        await sound.setIsLoopingAsync(false);
        // Then stop the sound
        await sound.stopAsync();
        // Reset position to beginning
        await sound.setPositionAsync(0);
        // console.log(`Stopped sound: ${key}`);
      } catch (error) {
        // console.error(`Error stopping sound for ${key}:`, error);
        // If normal stop fails, try to unload and reload
        try {
          await sound.unloadAsync();
          delete this.soundObjects[key];
          //   console.log(`Force unloaded sound: ${key}`);
        } catch (unloadError) {
          // console.error(`Error force unloading sound for ${key}:`, unloadError);
        }
      }
    }
  },

  async playSound(key: SoundKey, playOptions: PlayOptions = {}) {
    try {
      // First, force stop any existing instance
      await this.forceStopSound(key);

      // Ensure sound is loaded
      const isLoaded = await this.loadSound(key);
      if (!isLoaded) {
        // console.error(`Failed to load sound: ${key}`);
        return;
      }

      const sound = this.soundObjects[key];

      if (!sound) {
        // console.error(`Sound object not available for ${key}`);
        return;
      }

      //   console.log(`Playing sound: ${key}`);

      // Set volume if specified (0.0 to 1.0)
      if (typeof playOptions.volume !== "undefined") {
        await sound.setVolumeAsync(
          Math.max(0, Math.min(1, playOptions.volume))
        );
      }

      // Set looping if specified
      if (typeof playOptions.isLooping !== "undefined") {
        await sound.setIsLoopingAsync(playOptions.isLooping);
      }

      // Play the sound
      await sound.playAsync();
      //   console.log(`Successfully started playing: ${key}`);
    } catch (error) {
      // console.error(`Error playing sound for ${key}:`, error);
    }
  },

  async forceStopSound(key: SoundKey) {
    const sound = this.soundObjects[key];
    if (sound) {
      try {
        // Multiple stop attempts
        await sound.setIsLoopingAsync(false);
        await sound.stopAsync();
        await sound.unloadAsync();
        delete this.soundObjects[key];
        // console.log(`Force stopped and unloaded sound: ${key}`);
        return true;
      } catch (error) {
        // console.error(`Error force stopping sound for ${key}:`, error);
        // Even if there's an error, remove from our tracking
        delete this.soundObjects[key];
        return false;
      }
    }
    return true;
  },

  // Add this new method to stop ALL instances
  async nukeSounds() {
    try {
      //   console.log("🔥 NUKING ALL SOUNDS");

      // Stop all tracked sounds
      for (const [key, sound] of Object.entries(this.soundObjects)) {
        if (sound) {
          try {
            await sound.setIsLoopingAsync(false);
            await sound.stopAsync();
            await sound.unloadAsync();
            // console.log(`Nuked sound: ${key}`);
          } catch (error) {
            // console.error(`Error nuking sound ${key}:`, error);
          }
        }
      }

      // Clear all references
      this.soundObjects = {} as Record<SoundKey, Audio.Sound | undefined>;

      //   console.log("🔥 ALL SOUNDS NUKED");
      return true;
    } catch (error) {
      // console.error("Error nuking sounds:", error);
      return false;
    }
  },

  async stopAllSounds() {
    try {
      const stopPromises = Object.keys(this.soundObjects).map((key) =>
        this.stopSound(key as SoundKey)
      );
      await Promise.all(stopPromises);
      //   console.log("All sounds stopped");
    } catch (error) {
      // console.error("Error stopping all sounds:", error);
    }
  },

  async unloadAll() {
    try {
      // First stop all sounds
      await this.stopAllSounds();

      // Then unload all sound objects
      const unloadPromises = Object.entries(this.soundObjects).map(
        async ([key, sound]) => {
          if (sound) {
            try {
              await sound.unloadAsync();
              //   console.log(`Unloaded sound: ${key}`);
            } catch (error) {
              // console.error(`Error unloading sound ${key}:`, error);
            }
          }
        }
      );

      await Promise.all(unloadPromises);

      // Clear the soundObjects
      this.soundObjects = {} as Record<SoundKey, Audio.Sound | undefined>;
      this.isInitialized = false;
      this.isInitializing = false;

      //   console.log("All sounds unloaded and SoundManager reset");
    } catch (error) {
      // console.error("Error unloading sounds:", error);
    }
  },

  // Utility method to preload all sounds
  async preloadAllSounds() {
    try {
      //   console.log("Preloading all sounds...");
      const loadPromises = Object.keys(this.sounds).map((key) =>
        this.loadSound(key as SoundKey)
      );

      const results = await Promise.all(loadPromises);
      const successCount = results.filter(Boolean).length;

      //   console.log(
      //     `Preloaded ${successCount}/${Object.keys(this.sounds).length} sounds`
      //   );
      return successCount === Object.keys(this.sounds).length;
    } catch (error) {
      // console.error("Error preloading sounds:", error);
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
