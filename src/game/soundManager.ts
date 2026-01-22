/**
 * Sound Manager for game audio effects
 */

type SoundEffect = 'hit-air' | 'hit-enemy' | 'hit-me' | 'hit-chest';

class SoundManager {
  private sounds: Map<SoundEffect, HTMLAudioElement[]> = new Map();
  private poolSize = 3; // Number of audio instances per sound for overlapping
  private volume = 0.3; // Default volume (0.0 to 1.0)

  constructor() {
    this.preloadSounds();
  }

  private preloadSounds() {
    const soundEffects: SoundEffect[] = ['hit-air', 'hit-enemy', 'hit-me', 'hit-chest'];
    
    soundEffects.forEach(effect => {
      const pool: HTMLAudioElement[] = [];
      for (let i = 0; i < this.poolSize; i++) {
        const audio = new Audio(`/sound_effects/${effect}.mp3`);
        audio.volume = this.volume;
        audio.preload = 'auto';
        pool.push(audio);
      }
      this.sounds.set(effect, pool);
    });
  }

  play(effect: SoundEffect) {
    const pool = this.sounds.get(effect);
    if (!pool) return;

    // Find an available audio instance (not playing)
    let audio = pool.find(a => a.paused || a.ended);
    
    // If all are playing, use the first one (will restart it)
    if (!audio) {
      audio = pool[0];
    }

    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => {
        // Ignore errors (e.g., user hasn't interacted with page yet)
        console.debug('Audio play failed:', err);
      });
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach(pool => {
      pool.forEach(audio => {
        audio.volume = this.volume;
      });
    });
  }
}

// Export singleton instance
export const soundManager = new SoundManager();
