import './_group.css';
import { useEffect, useRef, useState } from 'react';

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function CharReveal({ text, delay = 0, style = {} }: { text: string; delay?: number; style?: React.CSSProperties }) {
  const { ref, inView } = useInView(0.1);
  return (
    <span ref={ref} style={{ display: 'inline-block', ...style }}>
      {text.split('').map((ch, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            transition: `opacity 0.04s ${delay + i * 22}ms, transform 0.4s cubic-bezier(0.22,1,0.36,1) ${delay + i * 22}ms`,
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0)' : 'translateY(30px)',
          }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  );
}

function SlideIn({ children, dir = 'up', delay = 0, style = {} }: { children: React.ReactNode; dir?: 'up' | 'left' | 'right'; delay?: number; style?: React.CSSProperties }) {
  const { ref, inView } = useInView(0.1);
  const tx = dir === 'left' ? '-40px' : dir === 'right' ? '40px' : '0';
  const ty = dir === 'up' ? '36px' : '0';
  return (
    <div ref={ref} style={{
      transition: `opacity 0.65s ${delay}ms ease, transform 0.65s ${delay}ms cubic-bezier(0.22,1,0.36,1)`,
      opacity: inView ? 1 : 0,
      transform: inView ? 'none' : `translate(${tx}, ${ty})`,
      ...style,
    }}>
      {children}
    </div>
  );
}

interface GalleryItem { color: string; label: string; emoji: string; }
const ITEMS: GalleryItem[] = [
  { color: 'linear-gradient(135deg,#f5ddd8,#e8c4bc)', label: 'Bridal', emoji: '💒' },
  { color: 'linear-gradient(135deg,#f7e9d0,#e8d5a3)', label: 'Editorial', emoji: '📸' },
  { color: 'linear-gradient(135deg,#fdf0ee,#f5ddd8)', label: 'Glam', emoji: '✨' },
  { color: 'linear-gradient(135deg,#e8c4bc,#d4a898)', label: 'Smokey', emoji: '🖤' },
];

function GalleryCard({ item, i }: { item: GalleryItem; i: number }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
        height: 200,
        transform: hov ? 'scale(1.04) perspective(600px) rotateY(-4deg) rotateX(2deg)' : 'scale(1)',
        transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.4s',
        boxShadow: hov
          ? '0 24px 60px rgba(44,24,16,0.28), 0 0 0 1.5px rgba(201,169,110,0.5)'
          : '0 6px 22px rgba(44,24,16,0.1)',
        background: item.color,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.2rem' }}>
        {item.emoji}
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(44,24,16,0.7))',
        padding: '40px 16px 14px',
        transform: hov ? 'translateY(0)' : 'translateY(8px)',
        opacity: hov ? 1 : 0.6,
        transition: 'all 0.35s ease',
      }}>
        <div style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '0.95rem', fontWeight: 600 }}>{item.label}</div>
      </div>
      {/* 3D shine */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: hov
          ? 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)'
          : 'none',
        transition: 'all 0.3s',
        borderRadius: 12,
      }} />
    </div>
  );
}

export function CinemaEditorial() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 120); return () => clearTimeout(t); }, []);

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", background: '#fdf8f4', minHeight: '100vh', overflow: 'hidden' }}>
      <style>{`
        @keyframes navDrop { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: none; } }
        @keyframes lineDraw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes badge { from { opacity: 0; transform: scale(0.8) translateX(-10px); } to { opacity: 1; transform: scale(1) translateX(0); } }
        @keyframes photoPop { from { opacity: 0; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0 0% 0 0); } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes marqueeScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>

      {/* Nav */}
      <nav style={{
        padding: '18px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #e8c4bc', background: '#fdf8f4',
        animation: loaded ? 'navDrop 0.5s ease both' : 'none',
      }}>
        <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: '1.5rem', color: '#c9a96e', fontWeight: 600 }}>The Glam by Ankita</div>
        <div style={{ display: 'flex', gap: 32, fontSize: '0.88rem', color: '#6b3d2e', fontWeight: 600 }}>
          {['Home','About','Services','Gallery','Contact'].map(n => (
            <span key={n} style={{ cursor: 'pointer', position: 'relative' }}>
              {n}
            </span>
          ))}
        </div>
        <button style={{
          background: 'linear-gradient(135deg,#c9a96e,#9e7c4a)', color: '#fff', border: 'none',
          borderRadius: 999, padding: '9px 22px', fontFamily: "'Nunito', sans-serif", fontWeight: 700,
          fontSize: '0.85rem', cursor: 'pointer', letterSpacing: '0.02em',
        }}>✦ Book Now</button>
      </nav>

      {/* Dark accent strip */}
      <div style={{
        background: 'linear-gradient(135deg, #2c1810, #3d1f12)',
        padding: '12px 48px', overflow: 'hidden',
        animation: loaded ? 'navDrop 0.5s 0.1s ease both' : 'none',
      }}>
        <div style={{ animation: 'marqueeScroll 22s linear infinite', display: 'flex', gap: 60, whiteSpace: 'nowrap', width: 'max-content' }}>
          {['Bridal Makeup', '✦', 'Editorial', '✦', 'Event Glam', '✦', 'Special Effects', '✦', 'Soft Glam', '✦',
            'Bridal Makeup', '✦', 'Editorial', '✦', 'Event Glam', '✦', 'Special Effects', '✦', 'Soft Glam', '✦'].map((t, i) => (
            <span key={i} style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem', color: t === '✦' ? '#c9a96e' : 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 460, padding: '0 48px', alignItems: 'center' }}>
        <div style={{ padding: '48px 0 32px' }}>
          <SlideIn dir="left" delay={0}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #c9a96e',
              borderRadius: 4, padding: '4px 14px', marginBottom: 22,
              animation: loaded ? 'badge 0.5s 0.2s ease both' : 'none', opacity: loaded ? undefined : 0,
            }}>
              <span style={{ width: 6, height: 6, background: '#c9a96e', borderRadius: '50%', display: 'block' }} />
              <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.72rem', color: '#9e7c4a', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Melbourne Makeup Artist</span>
            </div>
          </SlideIn>

          <div style={{ marginBottom: 10 }}>
            <h1 style={{ margin: 0, lineHeight: 1.05 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '2.8rem', fontWeight: 700, color: '#2c1810', display: 'block' }}>
                <CharReveal text="Beauty That" delay={200} />
              </div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '3.2rem', fontWeight: 700, fontStyle: 'italic', display: 'block' }}>
                <CharReveal
                  text="Tells Your Story"
                  delay={350}
                  style={{ color: 'transparent', background: 'linear-gradient(90deg, #c9a96e, #9e7c4a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                />
              </div>
            </h1>
            {/* Animated underline */}
            <div style={{
              height: 3, background: 'linear-gradient(90deg, #c9a96e, transparent)', borderRadius: 2,
              animation: loaded ? 'lineDraw 1s 0.9s ease both' : 'none', transformOrigin: 'left',
              transform: loaded ? undefined : 'scaleX(0)', maxWidth: 380, marginTop: 8,
            }} />
          </div>

          <SlideIn dir="up" delay={500}>
            <p style={{ color: '#6b3d2e', fontSize: '0.95rem', lineHeight: 1.75, maxWidth: 400, margin: '16px 0 28px' }}>
              Professional makeup artistry tailored to you — from soft everyday glam to full bridal transformations.
            </p>
          </SlideIn>

          <SlideIn dir="up" delay={650}>
            <div style={{ display: 'flex', gap: 14 }}>
              <button style={{
                background: 'linear-gradient(135deg,#c9a96e,#9e7c4a)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '13px 30px', fontFamily: "'Nunito', sans-serif", fontWeight: 700,
                fontSize: '0.92rem', cursor: 'pointer', letterSpacing: '0.04em',
                boxShadow: '0 8px 28px rgba(201,169,110,0.35)',
              }}>Book Appointment ✦</button>
              <button style={{
                background: 'transparent', color: '#2c1810', border: '1.5px solid #2c1810',
                borderRadius: 6, padding: '13px 24px', fontFamily: "'Nunito', sans-serif", fontWeight: 700,
                fontSize: '0.92rem', cursor: 'pointer',
              }}>View Gallery →</button>
            </div>
          </SlideIn>
        </div>

        {/* Hero art — editorial mosaic */}
        <div style={{ padding: '32px 0 32px 48px', animation: loaded ? 'photoPop 0.9s 0.5s ease both' : 'none', opacity: loaded ? undefined : 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, height: 380 }}>
            {[
              { bg: 'linear-gradient(135deg,#f5ddd8,#c9a96e)', span: 'row', emoji: '💄', lbl: 'Bridal' },
              { bg: 'linear-gradient(135deg,#2c1810,#6b3d2e)', span: '', emoji: '✨', lbl: 'Editorial' },
              { bg: 'linear-gradient(135deg,#f7e9d0,#e8c4bc)', span: '', emoji: '🌹', lbl: 'Glam' },
            ].map((c, i) => (
              <div key={i} style={{
                background: c.bg, borderRadius: 10, gridRow: c.span ? 'span 2' : '',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                animation: `float ${5 + i}s ease-in-out infinite`,
              }}>
                <span style={{ fontSize: '2.5rem' }}>{c.emoji}</span>
                <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem', fontWeight: 700, color: c.span ? '#9e7c4a' : i === 1 ? 'rgba(255,255,255,0.7)' : '#6b3d2e', marginTop: 6 }}>{c.lbl}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Strip */}
      <section style={{ padding: '36px 48px 48px' }}>
        <SlideIn dir="up" delay={0}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.8rem', fontWeight: 700, color: '#2c1810', margin: 0 }}>Portfolio</h2>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e8c4bc, transparent)' }} />
            <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.82rem', color: '#c9a96e', fontWeight: 700, cursor: 'pointer' }}>View all →</span>
          </div>
        </SlideIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {ITEMS.map((item, i) => <GalleryCard key={i} item={item} i={i} />)}
        </div>
      </section>
    </div>
  );
}
