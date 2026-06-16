import './_group.css';
import { useEffect, useRef, useState } from 'react';

function useMorphOrb() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf: number;
    let start = performance.now();
    const tick = (now: number) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

function MorphOrb({ size, colors, speed, offsetX, offsetY }: { size: number; colors: [string, string]; speed: number; offsetX: number; offsetY: number }) {
  const t = useMorphOrb();
  const angle = t * speed;
  const r1 = 45 + Math.sin(t * 0.7) * 8;
  const r2 = 55 + Math.cos(t * 0.9) * 8;
  const r3 = 50 + Math.sin(t * 1.1) * 6;
  const r4 = 52 + Math.cos(t * 0.6) * 10;
  return (
    <div style={{
      position: 'absolute', width: size, height: size,
      left: offsetX, top: offsetY,
      borderRadius: `${r1}% ${100-r1}% ${r3}% ${100-r3}% / ${r2}% ${r4}% ${100-r4}% ${100-r2}%`,
      background: `radial-gradient(circle at 40% 40%, ${colors[0]}, ${colors[1]})`,
      filter: 'blur(32px)',
      transition: 'border-radius 0.1s linear',
      pointerEvents: 'none',
      transform: `rotate(${angle}deg)`,
      opacity: 0.55,
    }} />
  );
}

function SilkCard({ title, price, desc, icon, accent, delay }: { title: string; price: string; desc: string; icon: string; accent: string; delay: number }) {
  const [hov, setHov] = useState(false);
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov
          ? 'linear-gradient(145deg,#fff,#fdf8f4)'
          : 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${hov ? accent : 'rgba(201,169,110,0.2)'}`,
        borderRadius: 20, padding: '28px 22px', position: 'relative', overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        transform: vis ? (hov ? 'translateY(-12px)' : 'translateY(0)') : 'translateY(32px)',
        opacity: vis ? 1 : 0,
        boxShadow: hov
          ? `0 24px 60px rgba(201,169,110,0.22), 0 0 0 1px ${accent}33`
          : '0 8px 32px rgba(44,24,16,0.06)',
      }}
    >
      {/* Gold shimmer sweep */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 20, overflow: 'hidden', pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: '-50%', left: hov ? '130%' : '-80%', width: '60%', height: '200%',
          background: `linear-gradient(90deg, transparent, ${accent}33, rgba(255,255,255,0.5), ${accent}22, transparent)`,
          transition: 'left 0.8s cubic-bezier(0.4,0,0.2,1)',
          transform: 'skewX(-12deg)',
        }} />
      </div>

      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        opacity: hov ? 1 : 0, transition: 'opacity 0.3s',
      }} />

      <div style={{ fontSize: '2.2rem', marginBottom: 14 }}>{icon}</div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.08rem', fontWeight: 700, color: '#2c1810', marginBottom: 4 }}>{title}</div>
      <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem', color: '#9a7060', lineHeight: 1.65, marginBottom: 16 }}>{desc}</div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid rgba(201,169,110,0.15)', paddingTop: 14,
      }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: accent }}>
          {price}
        </span>
        <span style={{
          fontFamily: "'Nunito', sans-serif", fontSize: '0.75rem', color: accent, fontWeight: 700,
          letterSpacing: '0.06em', opacity: hov ? 1 : 0, transition: 'opacity 0.3s',
        }}>Book →</span>
      </div>
    </div>
  );
}

export function SilkAndGold() {
  const [loaded, setLoaded] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setLoaded(true), 100); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = () => setScrollY(el.scrollTop);
    el.addEventListener('scroll', h);
    return () => el.removeEventListener('scroll', h);
  }, []);

  return (
    <div ref={containerRef} style={{ fontFamily: "'Nunito', sans-serif", background: '#fdf8f4', height: '100vh', overflowY: 'auto', position: 'relative' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @keyframes goldGlow { 0%,100% { text-shadow: 0 0 20px rgba(201,169,110,0.4); } 50% { text-shadow: 0 0 40px rgba(201,169,110,0.8), 0 0 80px rgba(201,169,110,0.3); } }
        @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes heroImg { from { opacity: 0; transform: scale(1.08); } to { opacity: 1; transform: scale(1); } }
        @keyframes borderDance { 0%,100% { border-radius: 60% 40% 55% 45%/50% 60% 40% 50%; } 33% { border-radius: 45% 55% 40% 60%/60% 45% 55% 40%; } 66% { border-radius: 55% 45% 60% 40%/40% 55% 45% 60%; } }
      `}</style>

      {/* Animated background orbs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <MorphOrb size={500} colors={['rgba(232,196,188,0.6)', 'rgba(245,221,216,0.2)']} speed={0.08} offsetX={-100} offsetY={-50} />
        <MorphOrb size={400} colors={['rgba(201,169,110,0.4)', 'rgba(232,213,163,0.15)']} speed={-0.06} offsetX={700} offsetY={200} />
        <MorphOrb size={320} colors={['rgba(247,233,208,0.7)', 'rgba(201,169,110,0.2)']} speed={0.1} offsetX={400} offsetY={500} />
      </div>

      {/* Nav */}
      <nav style={{
        padding: '18px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(253,248,244,0.85)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(201,169,110,0.2)', position: 'sticky', top: 0, zIndex: 50,
        animation: loaded ? 'fadeUp 0.5s ease both' : 'none',
        boxShadow: scrollY > 10 ? '0 4px 24px rgba(44,24,16,0.08)' : 'none',
        transition: 'box-shadow 0.3s',
      }}>
        <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: '1.5rem', color: '#c9a96e', fontWeight: 600 }}>The Glam by Ankita</div>
        <div style={{ display: 'flex', gap: 32, fontSize: '0.88rem', color: '#6b3d2e', fontWeight: 600 }}>
          {['Home','About','Services','Gallery','Contact'].map(n => (
            <span key={n} style={{ cursor: 'pointer' }}>{n}</span>
          ))}
        </div>
        <button style={{
          background: 'linear-gradient(135deg,#c9a96e,#9e7c4a)', color: '#fff', border: 'none',
          borderRadius: 999, padding: '9px 22px', fontFamily: "'Nunito', sans-serif", fontWeight: 700,
          fontSize: '0.85rem', cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(201,169,110,0.4)',
        }}>✦ Book Now</button>
      </nav>

      {/* Hero */}
      <section style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
        padding: '48px 48px 40px', alignItems: 'center', position: 'relative', zIndex: 1, minHeight: 460,
      }}>
        <div>
          <div style={{
            animation: loaded ? 'fadeUp 0.5s 0.1s ease both' : 'none', opacity: loaded ? undefined : 0,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.35)',
            borderRadius: 999, padding: '5px 16px', marginBottom: 22,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c9a96e', display: 'block', animation: 'spinSlow 3s linear infinite' }} />
            <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem', color: '#9e7c4a', fontWeight: 700, letterSpacing: '0.06em' }}>Melbourne Makeup Artist</span>
          </div>

          <h1 style={{ margin: '0 0 6px', lineHeight: 1.08 }}>
            <span style={{
              display: 'block', fontFamily: "'Playfair Display', serif", fontSize: '2.6rem', fontWeight: 700, color: '#2c1810',
              animation: loaded ? 'fadeUp 0.6s 0.2s ease both' : 'none', opacity: loaded ? undefined : 0,
            }}>Beauty That</span>
            <span style={{
              display: 'block', fontFamily: "'Playfair Display', serif", fontSize: '3.4rem', fontWeight: 700, fontStyle: 'italic',
              background: 'linear-gradient(135deg, #c9a96e 0%, #e8d5a3 40%, #9e7c4a 70%, #c9a96e 100%)',
              backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: loaded ? 'fadeUp 0.6s 0.32s ease both, goldGlow 3s 1.5s ease-in-out infinite' : 'none',
              opacity: loaded ? undefined : 0,
            }}>Tells Your Story</span>
          </h1>

          <p style={{
            color: '#6b3d2e', fontSize: '0.95rem', lineHeight: 1.78, maxWidth: 400, margin: '18px 0 30px',
            animation: loaded ? 'fadeUp 0.6s 0.5s ease both' : 'none', opacity: loaded ? undefined : 0,
          }}>
            Professional makeup artistry tailored to you — from soft everyday glam to full bridal transformations.
          </p>

          <div style={{
            display: 'flex', gap: 14,
            animation: loaded ? 'fadeUp 0.6s 0.65s ease both' : 'none', opacity: loaded ? undefined : 0,
          }}>
            <button style={{
              background: 'linear-gradient(135deg,#c9a96e,#9e7c4a)', color: '#fff', border: 'none',
              borderRadius: 999, padding: '13px 30px', fontFamily: "'Nunito', sans-serif", fontWeight: 700,
              fontSize: '0.92rem', cursor: 'pointer', boxShadow: '0 8px 32px rgba(201,169,110,0.4)',
              letterSpacing: '0.02em',
            }}>✦ Book Appointment</button>
            <button style={{
              background: 'transparent', color: '#6b3d2e', border: '1.5px solid rgba(201,169,110,0.5)',
              borderRadius: 999, padding: '13px 26px', fontFamily: "'Nunito', sans-serif", fontWeight: 600,
              fontSize: '0.92rem', cursor: 'pointer',
            }}>View Portfolio</button>
          </div>

          {/* Stats with glass pills */}
          <div style={{
            display: 'flex', gap: 14, marginTop: 36,
            animation: loaded ? 'fadeUp 0.6s 0.8s ease both' : 'none', opacity: loaded ? undefined : 0,
          }}>
            {[['200+', 'Clients'], ['5★', 'Reviews'], ['8+', 'Years']].map(([val, lbl]) => (
              <div key={lbl} style={{
                background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(201,169,110,0.25)', borderRadius: 999, padding: '8px 18px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 700, color: '#c9a96e' }}>{val}</div>
                <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.7rem', color: '#9a7060', fontWeight: 600 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Morphing hero image */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px 0' }}>
          <div style={{
            width: 340, height: 420, position: 'relative',
            animation: loaded ? 'heroImg 0.9s 0.4s ease both, borderDance 8s ease-in-out infinite' : 'none',
            opacity: loaded ? undefined : 0,
            background: 'linear-gradient(135deg, #f5ddd8, #e8c4bc 40%, #f7e9d0)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 30px 80px rgba(201,169,110,0.3), 0 0 0 1px rgba(201,169,110,0.2), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}>
            {/* Inner shine layer */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 60%)',
              borderRadius: 'inherit',
            }} />
            <span style={{ fontSize: '5rem', zIndex: 1, filter: 'drop-shadow(0 4px 12px rgba(201,169,110,0.4))' }}>💄</span>
            <span style={{
              fontFamily: "'Dancing Script', cursive", fontSize: '1.15rem', color: '#9e7c4a', zIndex: 1, marginTop: 10,
              animation: 'goldGlow 3s ease-in-out infinite',
            }}>Your Glam Story</span>

            {/* Floating badges */}
            {[
              { top: 24, right: -28, text: '✦ 5 Star', bg: 'rgba(201,169,110,0.95)', color: '#fff' },
              { bottom: 40, left: -32, text: '💒 Bridal', bg: 'rgba(253,248,244,0.95)', color: '#6b3d2e' },
            ].map((b, i) => (
              <div key={i} style={{
                position: 'absolute', ...b,
                background: b.bg, color: b.color, borderRadius: 999, padding: '6px 14px',
                fontFamily: "'Nunito', sans-serif", fontSize: '0.75rem', fontWeight: 700,
                boxShadow: '0 4px 16px rgba(44,24,16,0.15)',
                animation: `float${i + 1} ${4 + i}s ease-in-out infinite`,
              } as React.CSSProperties}>
                {b.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section style={{ padding: '8px 48px 48px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: '1.1rem', color: '#c9a96e', marginBottom: 4 }}>What I Offer</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.9rem', fontWeight: 700, color: '#2c1810', margin: 0 }}>Services</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          <SilkCard icon="💒" title="Bridal Glam" price="From $280" desc="Full bridal looks from traditional elegance to modern romance" accent="#c9a96e" delay={800} />
          <SilkCard icon="✨" title="Event Makeup" price="From $120" desc="Polished looks for galas, parties & special occasions" accent="#d4b47a" delay={950} />
          <SilkCard icon="📸" title="Editorial" price="From $180" desc="Fashion-forward artistry for shoots & productions" accent="#9e7c4a" delay={1100} />
          <SilkCard icon="🌟" title="Soft Glam" price="From $90" desc="Effortlessly beautiful everyday & date night looks" accent="#c9a96e" delay={1250} />
        </div>
      </section>
    </div>
  );
}
