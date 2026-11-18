import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { THEME } from './lib/theme';

export type Word = { word: string; timeline_start: number; timeline_end: number; highlight?: boolean };
type Chunk = { words: Word[]; start: number; end: number };

const ACCENT = '#00FF88';
const HOLD = 0.25; // keep a chunk on screen briefly after its last word so it doesn't flicker

// Split the word stream into on-screen caption "chunks" (what's visible at once).
export function groupWords(words: Word[], maxWords: number): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) chunks.push({ words: cur, start: cur[0].timeline_start, end: cur[cur.length - 1].timeline_end });
    cur = [];
  };
  const maxChars = maxWords * 6; // keeps long words from wrapping onto a third line
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const chars = cur.reduce((n, x) => n + x.word.length + 1, 0) + w.word.length;
      const pause = w.timeline_start - prev.timeline_end > 0.3; // natural pause or jump cut
      const sentenceEnd = /[.!?,;:]$/.test(prev.word);
      const payoff = !!w.highlight && !prev.highlight && cur.length >= 2; // let payoff words land fresh
      if (cur.length >= maxWords || chars > maxChars || pause || sentenceEnd || payoff) flush();
    }
    cur.push(w);
  }
  flush();
  return chunks;
}

// bold   = short-form genre captions (big, punchy, colour pop) — only for `fast`
// refined = film subtitles: real typeface, sentence case, words brighten as spoken, key words
//           get a thin underline sweep. What a high-end editor ships on a 16:9 film.
const STYLES = {
  natural: { maxWords: 6, size: 54, weight: 600, upper: false, look: 'refined' },
  fast: { maxWords: 3, size: 78, weight: 900, upper: true, look: 'bold' },
  educational: { maxWords: 7, size: 52, weight: 600, upper: false, look: 'refined' },
  cinematic: { maxWords: 7, size: 46, weight: 500, upper: false, look: 'refined' },
} as const;

export const Captions: React.FC<{ words: Word[]; style: string; look?: string; accent?: string; split?: number }> = ({ words, style, look, accent, split = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const base = STYLES[style as keyof typeof STYLES] ?? STYLES.natural;
  // the profile's caption choice overrides the style default
  const s = look === 'bold' ? { ...STYLES.fast, upper: false } : look === 'refined' && base.look === 'bold' ? STYLES.natural : base;
  const vertical = height > width;
  const chunks = useMemo(() => groupWords(words, s.maxWords), [words, s.maxWords]);
  const t = frame / fps;

  const chunk = chunks.find((c, i) => {
    const nextStart = chunks[i + 1]?.start ?? Infinity;
    return t >= c.start && t < Math.min(c.end + HOLD, nextStart);
  });
  if (!chunk) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        // 9:16: clear TikTok/Reels/Shorts bottom UI; 16:9: classic lower third
        paddingBottom: vertical ? 320 : s.look === 'refined' ? 70 : 110,
        paddingLeft: vertical ? 70 : 160,
        // while a side panel is open, captions centre in the free 58% so they never run onto it
        paddingRight: vertical ? 70 : 160 + split * width * 0.42,
        pointerEvents: 'none',
      }}
    >
      {/* fontSize on the container so the em-based word gap scales with the caption size */}
      {/* refined captions sit on a dark pill: white type on bright footage (walls, shirt prints) otherwise disappears */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 0.3em', textAlign: 'center', fontSize: s.size * (vertical ? 1.1 : 0.85),
        ...(s.look === 'refined' ? { background: 'rgba(10,10,12,0.74)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          padding: '0.16em 0.62em 0.22em', borderRadius: '0.5em', border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)', maxWidth: '72%' } : {}) }}>
        {s.look === 'refined' && chunk.words.map((w, i) => {
          const spoken = t >= w.timeline_start;
          const lit = Math.min(1, Math.max(0, (t - w.timeline_start) / 0.12));
          const under = w.highlight ? Math.min(1, Math.max(0, (t - w.timeline_start) / 0.35)) : 0;
          return (
            <span key={i} style={{ position: 'relative', display: 'inline-block', fontFamily: THEME.font, fontWeight: w.highlight ? 700 : s.weight,
              color: '#FFFFFF', opacity: spoken ? 0.7 + 0.3 * lit : 0.55, lineHeight: 1.22, letterSpacing: '-0.01em' }}>
              {w.word}
              {under > 0 && (
                <span style={{ position: 'absolute', left: 0, bottom: '0.02em', height: '0.07em', width: `${under * 100}%`,
                  background: accent ?? THEME.accent, borderRadius: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
              )}
            </span>
          );
        })}
        {s.look === 'bold' && chunk.words.map((w, i) => {
          const active = t >= w.timeline_start && t <= w.timeline_end + 0.05;
          const spoken = t >= w.timeline_start;
          const pop = spring({ frame: frame - Math.round(w.timeline_start * fps), fps, config: { damping: 11, mass: 0.4 } });
          const scale = active ? interpolate(pop, [0, 1], [0.85, 1.12]) : 1;
          const color = w.highlight ? (accent ?? ACCENT) : active ? '#FFE14D' : '#FFFFFF';
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                transform: `scale(${scale})`,
                opacity: spoken ? 1 : 0.55,
                fontFamily: "'Arial Black', Impact, 'Helvetica Neue', sans-serif",
                fontWeight: s.weight,
                textTransform: s.upper ? 'uppercase' : 'none',
                color,
                lineHeight: 1.15,
                WebkitTextStroke: s.upper ? '3px rgba(0,0,0,0.85)' : undefined,
                paintOrder: 'stroke fill',
                textShadow: '0 6px 24px rgba(0,0,0,0.9)',
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
