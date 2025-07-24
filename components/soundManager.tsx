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
  | "failSoundEffect"
  | "levelTransitionSound";

const FADE_INTERVAL_MS = 50;

// Helper fade function outside the object
async function fadeVolume(
  sound: Audio.Sound,
  from: number,
  to: number,
  duration: number
) {
  const steps = duration / FADE_INTERVAL_MS;
  const volumeStep = (to - from) / steps;
  let currentVolume = from;

  for (let i = 0; i < steps; i++) {
    currentVolume += volumeStep;
    currentVolume = Math.min(1, Math.max(0, currentVolume)); // Clamp
    await sound.setVolumeAsync(currentVolume);
    await new Promise((r) => setTimeout(r, FADE_INTERVAL_MS));
  }
  await sound.setVolumeAsync(to);
}

const SoundManager = {
  sounds: {
    levelSoundEffect: require("../assets/audio/level.mp3"),
    levelTransitionSound: require("../assets/audio/next-level.mp3"),
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      this.isInitialized = true;
    } catch {
      // handle error if needed
    } finally {
      this.isInitializing = false;
    }
  },

  async loadSound(key: SoundKey): Promise<boolean> {
    if (this.soundObjects[key]) {
      return true;
    }
    try {
      await this.initialize();
      const { sound } = await Audio.Sound.createAsync(this.sounds[key]);
      this.soundObjects[key] = sound;
      return true;
    } catch {
      return false;
    }
  },

  async stopSound(key: SoundKey) {
    const sound = this.soundObjects[key];
    if (sound) {
      try {
        await sound.setIsLoopingAsync(false);
        await sound.stopAsync();
        await sound.setPositionAsync(0);
      } catch {
        try {
          await sound.unloadAsync();
          delete this.soundObjects[key];
        } catch {}
      }
    }
  },

  async forceStopSound(key: SoundKey) {
    const sound = this.soundObjects[key];
    if (sound) {
      try {
        await sound.setIsLoopingAsync(false);
        await sound.stopAsync();
        await sound.unloadAsync();
        delete this.soundObjects[key];
        return true;
      } catch {
        delete this.soundObjects[key];
        return false;
      }
    }
    return true;
  },

  async playSound(key: SoundKey, playOptions: PlayOptions = {}) {
    try {
      await this.forceStopSound(key);
      const isLoaded = await this.loadSound(key);
      if (!isLoaded) return;

      const sound = this.soundObjects[key];
      if (!sound) return;

      if (typeof playOptions.volume !== "undefined") {
        await sound.setVolumeAsync(
          Math.max(0, Math.min(1, playOptions.volume))
        );
      }

      if (typeof playOptions.isLooping !== "undefined") {
        await sound.setIsLoopingAsync(playOptions.isLooping);
      }

      await sound.playAsync();
    } catch {}
  },

  // Your new fade-in play method
  async playSoundWithFade(
    key: SoundKey,
    playOptions: PlayOptions = {},
    fadeDuration = 1000
  ) {
    try {
      await this.forceStopSound(key);
      const isLoaded = await this.loadSound(key);
      if (!isLoaded) return;

      const sound = this.soundObjects[key];
      if (!sound) return;

      await sound.setVolumeAsync(0);

      if (typeof playOptions.isLooping !== "undefined") {
        await sound.setIsLoopingAsync(playOptions.isLooping);
      }

      await sound.playAsync();

      const targetVolume = playOptions.volume ?? 1;
      await fadeVolume(sound, 0, targetVolume, fadeDuration);
    } catch {}
  },

  // Your new fade-out stop method
  async stopSoundWithFade(key: SoundKey, fadeDuration = 1000) {
    const sound = this.soundObjects[key] as Audio.Sound;
    if (sound) {
      try {
        const status = await sound.getStatusAsync();
        const currentVolume = status.isLoaded ? status.volume ?? 1 : 1;
        await fadeVolume(sound, currentVolume, 0, fadeDuration);
        await sound.stopAsync();
        await sound.setPositionAsync(0);
        await (sound as Audio.Sound).setIsLoopingAsync(false);
      } catch {
        await this.forceStopSound(key);
      }
    }
  },

  async nukeSounds() {
    try {
      for (const key of Object.keys(this.soundObjects) as SoundKey[]) {
        const sound = this.soundObjects[key];
        if (sound) {
          const s = sound as Audio.Sound;
          try {
            await s.setIsLoopingAsync(false);
            await s.stopAsync();
            await s.unloadAsync();
          } catch (error) {
            // Optional: log error
          }
        }
      }

      this.soundObjects = {} as Record<SoundKey, Audio.Sound | undefined>;
      return true;
    } catch (error) {
      return false;
    }
  },

  async stopAllSounds() {
    try {
      const stopPromises = Object.keys(this.soundObjects).map((key) =>
        this.stopSound(key as SoundKey)
      );
      await Promise.all(stopPromises);
    } catch {}
  },

  async unloadAll() {
    try {
      await this.stopAllSounds();

      const unloadPromises = Object.entries(this.soundObjects).map(
        async ([key, sound]) => {
          if (sound) {
            try {
              await (sound as Audio.Sound).unloadAsync();
            } catch {}
          }
        }
      );

      await Promise.all(unloadPromises);

      this.soundObjects = {} as Record<SoundKey, Audio.Sound | undefined>;
      this.isInitialized = false;
      this.isInitializing = false;
    } catch {}
  },

  async preloadAllSounds() {
    try {
      const loadPromises = Object.keys(this.sounds).map((key) =>
        this.loadSound(key as SoundKey)
      );
      const results = await Promise.all(loadPromises);
      return results.filter(Boolean).length === Object.keys(this.sounds).length;
    } catch {
      return false;
    }
  },

  isSoundLoaded(key: SoundKey): boolean {
    return !!this.soundObjects[key];
  },

  getSoundStatus() {
    const status: Record<SoundKey, boolean> = {} as Record<SoundKey, boolean>;
    Object.keys(this.sounds).forEach((key) => {
      status[key as SoundKey] = this.isSoundLoaded(key as SoundKey);
    });
    return status;
  },
};

export default SoundManager;
