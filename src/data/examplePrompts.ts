export interface ExamplePrompt {
  label: string;
  text: string;
}

export interface ExampleCategory {
  id: string;
  label: string;
  prompts: ExamplePrompt[];
}

// ── Categorized prompt library ────────────────────────────────────────────────

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    id: 'house',
    label: 'House',
    prompts: [
      { label: 'Deep House Chords', text: '4 bars, A minor, 124 BPM, deep house piano chords, loopable' },
      { label: 'Uplifting House', text: '8 bars, F major, 128 BPM, uplifting house melody, synth lead' },
      { label: 'House Bassline', text: '4 bars, C minor, 126 BPM, punchy house bass, electric bass' },
    ],
  },
  {
    id: 'dubstep',
    label: 'Dubstep',
    prompts: [
      { label: 'Heavy Wobble Bass', text: '8 bars, D minor, 140 BPM, heavy dubstep wobble bass, dark synth' },
      { label: 'Half-Time Drop', text: '4 bars, G minor, 70 BPM, half-time dubstep, aggressive, sparse' },
      { label: 'Robotic Lead', text: '8 bars, B minor, 140 BPM, robotic dubstep synth lead, energetic' },
    ],
  },
  {
    id: 'garage',
    label: 'UK Garage',
    prompts: [
      { label: 'Garage Skip Beat', text: '4 bars, F# minor, 130 BPM, UK garage skippy groove, piano' },
      { label: 'Garage Hook', text: '8 bars, A major, 132 BPM, bouncy UK garage vocal chop melody, synth' },
    ],
  },
  {
    id: 'techno',
    label: 'Techno',
    prompts: [
      { label: 'Industrial Techno', text: '4 bars, C minor, 138 BPM, industrial techno, minimal and driving' },
      { label: 'Acid Bassline', text: '8 bars, E minor, 132 BPM, Berlin techno, acid bassline, relentless' },
      { label: 'Dark Techno', text: '4 bars, A minor, 145 BPM, dark techno, hypnotic pulse, loopable' },
    ],
  },
  {
    id: 'dnb',
    label: 'Drum & Bass',
    prompts: [
      { label: 'Neurofunk Bass', text: '4 bars, D minor, 174 BPM, neurofunk bass, distorted and choppy' },
      { label: 'Liquid DnB', text: '8 bars, F minor, 170 BPM, liquid drum and bass, smooth melody, piano' },
      { label: 'Reese Bass Roll', text: '4 bars, A minor, 172 BPM, rolling drum and bass, Reese bass, dark' },
    ],
  },
  {
    id: 'trap',
    label: 'Trap',
    prompts: [
      { label: 'Trap Melody', text: '4 bars, G minor, 140 BPM, atmospheric trap melody, sparse and dark' },
      { label: 'Dark Trap', text: '8 bars, C minor, 73 BPM, dark trap, minor key, string ensemble' },
      { label: 'Hard Trap Lead', text: '4 bars, E minor, 150 BPM, hard trap, punchy synth lead, staccato' },
    ],
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    prompts: [
      { label: '80s Arpeggio', text: '8 bars, A minor, 100 BPM, 80s synthwave, arpeggiated synth, retro' },
      { label: 'Neon Drive', text: '4 bars, D minor, 110 BPM, neon synthwave melody, nostalgic, punchy' },
      { label: 'Dark Synthwave', text: '8 bars, F minor, 85 BPM, dark synthwave, driving pulse, cinematic' },
    ],
  },
  {
    id: 'lofi',
    label: 'Lo-fi',
    prompts: [
      { label: 'Lo-fi Piano', text: '4 bars, C major, 80 BPM, lo-fi hip hop piano, mellow and warm' },
      { label: 'Jazzy Lo-fi', text: '8 bars, G major, 75 BPM, jazzy lo-fi chord melody, laid-back' },
      { label: 'Lo-fi Guitar', text: '4 bars, D minor, 85 BPM, lo-fi guitar chords, nostalgic, loopable' },
    ],
  },
  {
    id: 'ambient',
    label: 'Ambient',
    prompts: [
      { label: 'Ambient Pad', text: '8 bars, E major, 60 BPM, slow ambient pad, ethereal, soft strings' },
      { label: 'Drone Texture', text: '4 bars, A major, 70 BPM, drone ambient, calm and spacious, sustained' },
      { label: 'Meditative Piano', text: '8 bars, D major, 55 BPM, meditative ambient melody, sparse piano' },
    ],
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    prompts: [
      { label: 'Dark Theme', text: '8 bars, D minor, 72 BPM, dark cinematic piano motif, brooding' },
      { label: 'Uplifting Motif', text: '4 bars, C major, 80 BPM, uplifting cinematic motif, piano and strings' },
      { label: 'Epic Orchestral', text: '8 bars, B minor, 90 BPM, epic orchestral build, strings and brass' },
    ],
  },
  {
    id: 'jazz',
    label: 'Jazz',
    prompts: [
      { label: 'Walking Bass', text: '4 bars, F major, 90 BPM, walking jazz bassline, acoustic bass' },
      { label: 'Bebop Piano', text: '8 bars, Bb major, 120 BPM, bebop piano melody, bright and swinging' },
      { label: 'Slow Jazz Chords', text: '4 bars, A minor, 80 BPM, slow jazz piano chords, expressive, sparse' },
    ],
  },
  {
    id: 'funk',
    label: 'Funk / Disco',
    prompts: [
      { label: 'Funky Bass', text: '4 bars, C minor, 108 BPM, funky slap bass groove, electric bass' },
      { label: 'Disco Strings', text: '8 bars, G major, 115 BPM, disco strings and piano, bright, loopable' },
      { label: 'Nu-Disco Loop', text: 'loopable funky melody, 100 BPM, summer nu-disco' },
    ],
  },
  {
    id: 'game',
    label: 'Game / Retro',
    prompts: [
      { label: '8-bit Chiptune', text: '8 bars, C major, 140 BPM, chiptune melody, 8-bit, bright and energetic' },
      { label: 'RPG Dungeon', text: '4 bars, A minor, 120 BPM, retro RPG dungeon theme, ominous, minor key' },
      { label: 'Arcade Rush', text: '8 bars, G major, 160 BPM, fast arcade melody, loopable, synth lead' },
    ],
  },
];

export const DEFAULT_EXAMPLE_CATEGORY_ID = EXAMPLE_CATEGORIES[0]?.id ?? '';

export const EXAMPLE_PROMPT_COUNT = EXAMPLE_CATEGORIES.reduce(
  (sum, category) => sum + category.prompts.length,
  0,
);

export function getCategoryById(categoryId: string): ExampleCategory | undefined {
  return EXAMPLE_CATEGORIES.find((category) => category.id === categoryId);
}

export function getPromptsForCategory(categoryId: string | null): ExamplePrompt[] {
  if (!categoryId) return [];
  return getCategoryById(categoryId)?.prompts ?? [];
}

export function pickRandomPromptFromCategory(
  categoryId: string,
  random: () => number = Math.random,
): ExamplePrompt | null {
  const prompts = getPromptsForCategory(categoryId);
  if (prompts.length === 0) return null;
  const index = Math.floor(random() * prompts.length);
  return prompts[index] ?? null;
}
