/**
 * useHarmonyPlayback.ts
 *
 * Preview/export assembly settings for harmony — no regenerate required.
 */

import { useCallback, useState } from 'react';
import {
  DEFAULT_HARMONY_PLAYBACK,
  type HarmonyPlaybackSettings,
} from '../utils/harmonySettings';

export function useHarmonyPlayback() {
  const [settings, setSettings] = useState<HarmonyPlaybackSettings>({
    ...DEFAULT_HARMONY_PLAYBACK,
  });

  const setChordsEnabled = useCallback((chordsEnabled: boolean) => {
    setSettings((prev) => ({ ...prev, chordsEnabled }));
  }, []);

  const setHarmonyVolume = useCallback((harmonyVolume: number) => {
    setSettings((prev) => ({
      ...prev,
      harmonyVolume: Math.max(0, Math.min(1, harmonyVolume)),
    }));
  }, []);

  return {
    chordsEnabled: settings.chordsEnabled,
    harmonyVolume: settings.harmonyVolume,
    setChordsEnabled,
    setHarmonyVolume,
  };
}
