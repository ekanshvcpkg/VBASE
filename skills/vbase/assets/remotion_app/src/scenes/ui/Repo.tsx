import React from 'react';
import { EASE, beatAt, prog } from '../../lib/motion';
import { THEME } from '../../lib/theme';
import { Screen, Cursor, CamKey, CurKey } from '../Screen';
import type { SceneProps } from '../types';

// A faithful code-host repository page (GitHub's dark palette and layout), shown flat and
// crisp. The cursor travels to Star and clicks it on the spoken word while the camera pushes
// in on the button; the count ticks and the star fills.
// props: { owner, repo, description?, stars?, forks?, files?: [{name, msg, dir?, age?}], topics?: string[], commit? }
// beats: 'star'
const G = {
  bg: '#0d1117', head: '#010409', line: '#30363d', ink: '#e6edf3', sub: '#7d8590', btn: '#21262d', link: '#4493f8',
  star: '#e3b341', tab: '#f78166',
};
const CW = 1600, CH = 1000;

const Btn: React.FC<{ icon: React.ReactNode; label: string; count?: number | string; press?: number }> = ({ icon, label, count, press = 1 }) => (
  <div style={{ display: 'flex', alignItems: 'stretch', border: `1px solid ${G.line}`, borderRadius: 7, overflow: 'hidden', fontSize: 17,
    fontWeight: 600, color: G.ink, transform: `scale(${press})` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 13px', background: G.btn }}>{icon}{label}</div>
    {count !== undefined && <div style={{ padding: '7px 11px', background: '#2d333b', borderLeft: `1px solid ${G.line}`, minWidth: 30, textAlign: 'center' }}>{count}</div>}
  </div>
);

const StarIcon: React.FC<{ fill?: boolean }> = ({ fill }) => (
  <svg width="17" height="17" viewBox="0 0 16 16"><path d="M8 .9l2.2 4.5 4.9.7-3.6 3.5.9 4.9L8 12.2l-4.4 2.3.9-4.9L.9 6.1l4.9-.7z"
    fill={fill ? G.star : 'none'} stroke={fill ? G.star : G.sub} strokeWidth="1.3" strokeLinejoin="round" /></svg>
);

export const Repo: React.FC<SceneProps> = ({ t, dur, props, beats, w, h }) => {
  const files = props.files ?? [
    { name: '.claude-plugin', msg: 'Bump plugin to 2.0.0', dir: true },
    { name: 'skills/vidbase', msg: 'vidbase v2: natural cuts, contextual scenes', dir: true },
    { name: 'README.md', msg: 'Update README' },
    { name: 'install.sh', msg: 'Refresh installer hints' },
    { name: 'LICENSE', msg: 'Initial commit' },
  ];
  const starAt = beatAt(beats, 'star', 0, Math.min(dur - 0.9, 1.9));
  const starred = t >= starAt;
  const pop = prog(t, starAt, 0.35, EASE.out);
  const base = Number(props.stars ?? 128);
  const starX = 1418, starY = 212; // star button centre (content coords)
  const cam: CamKey[] = [{ t: Math.max(0.15, starAt - 1.0), x: 1240, y: 250, s: 1.75, dur: 0.85 }];
  const cur: CurKey[] = [{ t: Math.max(0.2, starAt - 1.3), x: 1250, y: 620 }, { t: starAt, x: starX - 30, y: starY + 4, click: true },
    { t: starAt + 1.2, x: starX + 10, y: starY + 70 }];
  const tabs = ['Code', 'Issues', 'Pull requests', 'Actions', 'Insights'];

  return (
    <Screen t={t} w={w} h={h} cw={CW} ch={CH} cam={cam} bg={G.bg}>
      <div style={{ position: 'absolute', inset: 0, fontFamily: THEME.font, color: G.ink }}>
        <div style={{ height: 64, background: G.head, borderBottom: `1px solid ${G.line}`, display: 'flex', alignItems: 'center', padding: '0 32px', gap: 14, fontSize: 19 }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: '#30363d' }} />
          <span>{props.owner}</span><span style={{ color: G.sub }}>/</span>
          <span style={{ fontWeight: 600 }}>{props.repo}</span>
        </div>
        <div style={{ background: G.head, borderBottom: `1px solid ${G.line}`, display: 'flex', gap: 30, padding: '0 32px', fontSize: 17 }}>
          {tabs.map((tb, i) => (
            <div key={tb} style={{ padding: '14px 2px', color: i ? G.sub : G.ink, borderBottom: i ? 'none' : `2px solid ${G.tab}`, fontWeight: i ? 400 : 600 }}>{tb}</div>
          ))}
        </div>
        <div style={{ padding: '26px 60px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 30, fontWeight: 600 }}>{props.repo}</div>
          <div style={{ fontSize: 14, color: G.sub, border: `1px solid ${G.line}`, borderRadius: 14, padding: '2px 10px' }}>Public</div>
          <div style={{ flex: 1 }} />
          <Btn icon={<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.5" fill="none" stroke={G.sub} strokeWidth="1.3" /><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke={G.sub} strokeWidth="1.3" /></svg>} label="Watch" count={props.watch ?? 4} />
          <Btn icon={<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="4" cy="3" r="1.6" fill="none" stroke={G.sub} strokeWidth="1.3" /><circle cx="12" cy="3" r="1.6" fill="none" stroke={G.sub} strokeWidth="1.3" /><circle cx="8" cy="13" r="1.6" fill="none" stroke={G.sub} strokeWidth="1.3" /><path d="M4 4.6v1.4c0 1 1 2 2 2h4c1 0 2-1 2-2V4.6M8 8v3.4" fill="none" stroke={G.sub} strokeWidth="1.3" /></svg>} label="Fork" count={props.forks ?? 12} />
          <Btn icon={<StarIcon fill={starred} />} label={starred ? 'Starred' : 'Star'} count={starred ? base + 1 : base}
            press={t > starAt - 0.04 && t < starAt + 0.1 ? 0.95 : 1 + Math.sin(pop * Math.PI) * 0.03} />
        </div>
        <div style={{ display: 'flex', gap: 32, padding: '24px 60px' }}>
          <div style={{ flex: 1, border: `1px solid ${G.line}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: '#161b22', padding: '14px 18px', fontSize: 16, color: G.sub, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: '#30363d' }} />
              <span style={{ color: G.ink, fontWeight: 600 }}>{props.owner}</span>
              <span>{props.commit ?? 'Merge vidbase v2: natural cuts, contextual scenes'}</span>
              <span style={{ flex: 1 }} /><span>now</span>
            </div>
            {files.map((f: any, i: number) => (
              <div key={f.name} style={{ display: 'flex', gap: 14, padding: '13px 18px', fontSize: 17, borderTop: `1px solid ${G.line}`, alignItems: 'center' }}>
                <svg width="17" height="17" viewBox="0 0 16 16">{f.dir
                  ? <path d="M1.5 3h4l1.5 1.5h7.5v8.5h-13z" fill="#54aeff" />
                  : <path d="M3 1.5h6.5l3.5 3.5v9.5h-10z" fill="none" stroke={G.sub} strokeWidth="1.2" />}</svg>
                <span style={{ width: 280 }}>{f.name}</span>
                <span style={{ flex: 1, color: G.sub }}>{f.msg}</span>
                <span style={{ color: G.sub }}>{f.age ?? ''}</span>
              </div>
            ))}
          </div>
          <div style={{ width: 360 }}>
            <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 12 }}>About</div>
            <div style={{ fontSize: 17, lineHeight: 1.5 }}>{props.description}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {(props.topics ?? ['claude', 'video-editing', 'remotion', 'ffmpeg']).map((tp: string) => (
                <span key={tp} style={{ fontSize: 14, color: G.link, background: 'rgba(56,139,253,0.12)', borderRadius: 14, padding: '4px 11px' }}>{tp}</span>
              ))}
            </div>
            <div style={{ marginTop: 18, fontSize: 16, color: G.sub, display: 'flex', alignItems: 'center', gap: 8 }}>
              <StarIcon fill={starred} /> <b style={{ color: G.ink }}>{starred ? base + 1 : base}</b> stars
            </div>
          </div>
        </div>
        <Cursor t={t} keys={cur} scale={1.2} />
      </div>
    </Screen>
  );
};
