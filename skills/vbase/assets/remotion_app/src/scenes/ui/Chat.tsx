import React from 'react';
import { EASE, beatAt, mix, prog, typed } from '../../lib/motion';
import { THEME } from '../../lib/theme';
import { Screen, Cursor, CamKey, CurKey, cursorAt } from '../Screen';
import type { SceneProps } from '../types';

// A faithful assistant-chat interface (warm ivory, serif replies, clay accent — the look of
// claude.ai, not a generic dark window). The action is performed, not just shown: a file is
// dragged in and dropped, the prompt types, the cursor clicks send, the reply streams, and a
// result card lands. The camera stays locked and pushes in on each action.
// props: { assistant?: 'Claude', prompt, reply, file?: {name, meta}, card?: {title, subtitle} }
// beats: 'drop' (file lands in the composer), 'send', 'card'
const C = {
  bg: '#FAF9F5', ink: '#1F1E1D', sub: '#73716B', line: '#E7E4DA', bubble: '#F0EEE6', clay: '#C96442', card: '#FFFFFF',
};
const CW = 1600, CH = 1000;
const COL = 380, COLW = 840; // conversation column

const Spark: React.FC<{ size?: number; spin?: number }> = ({ size = 30, spin = 0 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${spin}deg)` }}>
    {Array.from({ length: 8 }).map((_, i) => (
      <rect key={i} x="11" y="1.5" width="2" height="8.5" rx="1" fill={C.clay} transform={`rotate(${i * 45} 12 12)`} />
    ))}
  </svg>
);

const FileTile: React.FC<{ name: string; meta: string; small?: boolean }> = ({ name, meta, small }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12,
    padding: small ? '8px 14px 8px 8px' : '10px 18px 10px 10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
    <div style={{ width: small ? 44 : 64, height: small ? 44 : 64, borderRadius: 9, background: 'linear-gradient(135deg,#3b3a36,#1f1e1c)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="18" height="18" viewBox="0 0 10 10"><path d="M3 2 L8 5 L3 8 Z" fill="#fff" /></svg>
    </div>
    <div>
      <div style={{ fontSize: small ? 18 : 22, fontWeight: 600, color: C.ink }}>{name}</div>
      <div style={{ fontSize: small ? 15 : 17, color: C.sub, marginTop: 2 }}>{meta}</div>
    </div>
  </div>
);

export const Chat: React.FC<SceneProps> = ({ t, dur, props, beats, w, h }) => {
  const prompt: string = props.prompt ?? '';
  const reply: string = props.reply ?? '';
  const file = props.file;
  const drop = file ? beatAt(beats, 'drop', 0, 0.7) : -1;
  const typeAt = Math.max(0.3, drop + 0.35);
  const send = beatAt(beats, 'send', 0, Math.min(typeAt + prompt.length / 30 + 0.35, dur * 0.5));
  const replyAt = send + 0.45;
  const card = props.card;
  const cardAt = beatAt(beats, 'card', 0, Math.max(replyAt + reply.length / 55 + 0.2, dur - 1.6));
  const sent = t >= send;

  const composerY = 812, sendX = COL + COLW - 46, sendY = composerY + 92;
  // open already framed (never on an empty wide), then push to each action in turn
  const cam: CamKey[] = [
    { t: 0, x: 800, y: 560, s: 1.3, dur: 0.001 },
    ...(file ? [{ t: drop - 0.55, x: 800, y: 860, s: 1.5 }] : [{ t: typeAt - 0.3, x: 800, y: 860, s: 1.45 }]),
    { t: send + 0.15, x: 800, y: 330, s: 1.4, dur: 0.9 },
    ...(card ? [{ t: cardAt - 0.2, x: 800, y: 470, s: 1.45 }] : []),
  ];
  const cur: CurKey[] = [
    ...(file ? [{ t: drop - 0.7, x: 260, y: 980 }, { t: drop, x: COL + 140, y: composerY + 50 }] : [{ t: 0.2, x: COL + 300, y: composerY + 60 }]),
    { t: send, x: sendX, y: sendY, click: true },
    { t: send + 1.4, x: sendX + 60, y: sendY - 260 },
  ];
  // the dragged file ghost rides the cursor until the drop
  const dragging = file && t > drop - 0.7 && t < drop;
  const dragP = file ? prog(t, drop - 0.7, 0.7, EASE.inOut) : 0; // composer border lights as the file nears
  const landed = file ? prog(t, drop, 0.3, EASE.out) : 0;
  const sentP = prog(t, send, 0.4, EASE.out);
  const cardP = card ? prog(t, cardAt, 0.6, EASE.out) : 0;

  return (
    <Screen t={t} w={w} h={h} cw={CW} ch={CH} cam={cam} bg={C.bg}>
      <div style={{ position: 'absolute', inset: 0, fontFamily: THEME.font, color: C.ink }}>
        {/* top bar */}
        <div style={{ height: 70, display: 'flex', alignItems: 'center', padding: '0 34px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontFamily: THEME.serif, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em' }}>{props.assistant ?? 'Claude'}</div>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 19, color: C.sub }}>{props.title ?? 'Edit my video'}</div>
          <div style={{ width: 38, height: 38, borderRadius: 19, background: '#E8E3D6', fontSize: 15, fontWeight: 600, color: C.sub,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{props.initials ?? 'EK'}</div>
        </div>

        {/* empty state greeting before anything is sent */}
        {!sent && (
          <div style={{ position: 'absolute', left: COL, width: COLW, top: 300, textAlign: 'center', fontFamily: THEME.serif,
            fontSize: 52, color: C.ink, letterSpacing: '-0.015em', opacity: 1 - prog(t, send - 0.2, 0.3) }}>
            <span style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 16 }}><Spark size={44} /></span>
            How can I help you today?
          </div>
        )}

        {/* conversation */}
        {sent && (
          <div style={{ position: 'absolute', left: COL, width: COLW, top: 120, display: 'flex', flexDirection: 'column', gap: 30 }}>
            <div style={{ alignSelf: 'flex-end', maxWidth: 620, background: C.bubble, borderRadius: 20, padding: '18px 22px',
              opacity: sentP, transform: `translateY(${(1 - sentP) * 30}px)` }}>
              {file && <div style={{ marginBottom: 12 }}><FileTile name={file.name} meta={file.meta} small /></div>}
              <div style={{ fontSize: 24, lineHeight: 1.45 }}>{prompt}</div>
            </div>
            {t >= replyAt && (
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <div style={{ marginTop: 4 }}><Spark spin={t < cardAt ? t * 90 : 0} /></div>
                <div style={{ fontFamily: THEME.serif, fontSize: 27, lineHeight: 1.55, color: C.ink, maxWidth: 760 }}>
                  {typed(reply, t, replyAt, 55)}
                </div>
              </div>
            )}
            {card && t >= cardAt && (
              <div style={{ marginLeft: 48, width: 560, background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: '20px 22px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -12px rgba(0,0,0,0.16)', opacity: cardP,
                transform: `translateY(${(1 - cardP) * 24}px)`, display: 'flex', gap: 18, alignItems: 'center' }}>
                <div style={{ width: 96, height: 60, borderRadius: 9, background: 'linear-gradient(135deg,#4a4740,#23221f)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 10 10"><path d="M3 2 L8 5 L3 8 Z" fill="#fff" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{card.title}</div>
                  <div style={{ fontSize: 17, color: C.sub, marginTop: 3 }}>{card.subtitle}</div>
                  <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: C.line, overflow: 'hidden' }}>
                    <div style={{ width: `${prog(t, cardAt + 0.1, 1.0, EASE.inOut) * 100}%`, height: '100%', background: C.clay }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* composer */}
        <div style={{ position: 'absolute', left: COL, width: COLW, top: composerY, minHeight: 130, boxSizing: 'border-box', background: '#fff',
          border: `1px solid ${dragging && dragP > 0.6 ? C.clay : C.line}`, borderRadius: 24, padding: '16px 20px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 30px -14px rgba(0,0,0,0.14)' }}>
          {file && !sent && landed > 0 && (
            <div style={{ marginBottom: 12, display: 'inline-block', opacity: landed, transform: `scale(${mix(landed, 0.92, 1)})`, transformOrigin: 'left' }}>
              <FileTile name={file.name} meta={file.meta} small />
            </div>
          )}
          <div style={{ fontSize: 23, color: !sent && t >= typeAt ? C.ink : C.sub, minHeight: 34 }}>
            {!sent && t >= typeAt ? typed(prompt, t, typeAt, 30) : `Reply to ${props.assistant ?? 'Claude'}…`}
            {!sent && t >= typeAt && Math.floor(t * 2.2) % 2 === 0 && <span style={{ color: C.clay }}>▏</span>}
          </div>
          <div style={{ position: 'absolute', right: 18, bottom: 16, width: 44, height: 44, borderRadius: 12,
            background: !sent && t >= typeAt ? C.clay : '#E9E6DD', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${t > send - 0.05 && t < send + 0.12 ? 0.9 : 1})` }}>
            <svg width="18" height="18" viewBox="0 0 10 10"><path d="M5 8.5 V1.8 M2 4.6 L5 1.6 L8 4.6" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>
          </div>
        </div>

        {dragging && (
          <div style={{ position: 'absolute', left: cursorAt(cur, t).x + 18, top: cursorAt(cur, t).y + 22,
            transform: 'rotate(-3deg)', opacity: 0.92, boxShadow: '0 18px 36px -10px rgba(0,0,0,0.3)', borderRadius: 12 }}>
            <FileTile name={file.name} meta={file.meta} small />
          </div>
        )}
        <Cursor t={t} keys={cur} scale={1.25} />
      </div>
    </Screen>
  );
};
