import './_group.css';
import { useEffect, useRef, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  drift: number;
  delay: number;
  emoji: string;
}

const EMOJIS = ['✦', '✧', '❀', '✿', '◈', '⬥'];

function useParticles(count = 22) {
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 0.65 + Math.random() * 0.7,
      opacity: 0.18 + Math.random() * 0.32,
      speed: 12 + Math.random() * 20,
      drift: (Math.random() - 0.5) * 60,
      delay: Math.random() * -20,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    }))
  );
  return particles;
}

function FloatingParticles() {
  const particles = useParticles(24);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0px) translateX(0px) rotate(0deg); opacity: var(--p-opacity); }
          50%  { transform: translateY(-45vh) translateX(var(--p-drift)) rotate(180deg); opacity: calc(var(--p-opacity) * 0.6); }
          100% { transform: translateY(-92vh) translateX(calc(var(--p-drift) * 0.4)) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${100 - p.y}%`,
            fontSize: `${p.size}rem`,
            color: p.id % 3 === 0 ? '#c9a96e' : p.id % 3 === 1 ? '#e8c4bc' : '#e8d5a3',
            animation: `floatUp ${p.speed}s ${p.delay}s linear infinite`,
            '--p-opacity': p.opacity,
            '--p-drift': `${p.drift}px`,
          } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

function ServiceCard({ icon, title, desc, delay }: { icon: string; title: string; desc: string; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? 'linear-gradient(145deg, #fff9f5, #fdf0ee)'
          : 'linear-gradient(145deg, #ffffff, #fdf8f4)',
        border: `1.5px solid ${hovered ? '#c9a96e' : '#f0ddd6'}`,
        borderRadius: 16,
        padding: '28px 24px',
        cursor: 'pointer',
        transition: 'all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: visible
          ? hovered ? 'translateY(-10px) scale(1.02)' : 'translateY(0) scale(1)'
          : 'translateY(28px) scale(0.97)',
        opacity: visible ? 1 : 0,
        boxShadow: hovered
          ? '0 20px 60px rgba(201,169,110,0.22), 0 0 0 1px rgba(201,169,110,0.15), inset 0 1px 0 rgba(255,255,255,0.8)'
          : '0 4px 20px rgba(44,24,16,0.06)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Shimmer sweep on hover */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden', pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: hovered ? '120%' : '-60%', width: '50%', height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
          transition: 'left 0.65s ease',
          transform: 'skewX(-15deg)',
        }} />
      </div>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>{icon}</div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.05rem', fontWeight: 600, color: '#2c1810', marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.82rem', color: '#9a7060', lineHeight: 1.6 }}>{desc}</div>
      {hovered && (
        <div style={{
          marginTop: 14, fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem',
          color: '#c9a96e', fontWeight: 700, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          Learn more <span style={{ transition: 'transform 0.2s', transform: 'translateX(3px)' }}>→</span>
        </div>
      )}
    </div>
  );
}

export function PetalLuxe() {
  const [loaded, setLoaded] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", background: '#fdf8f4', minHeight: '100vh', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes shimmerText {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes ripple {
          0%   { transform: scale(0); opacity: 0.5; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes drawLine {
          from { width: 0; }
          to   { width: 100%; }
        }
        @keyframes orbFloat {
          0%, 100% { transform: translate(0,0) scale(1); }
          33%       { transform: translate(30px,-20px) scale(1.05); }
          66%       { transform: translate(-20px,15px) scale(0.97); }
        }
      `}</style>

      {/* Background orbs */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(232,196,188,0.35) 0%, transparent 70%)',
        top: -120, right: -80, animation: 'orbFloat 14s ease-in-out infinite', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 380, height: 380, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(201,169,110,0.2) 0%, transparent 70%)',
        bottom: 60, left: -60, animation: 'orbFloat 18s ease-in-out infinite reverse', pointerEvents: 'none',
      }} />

      <FloatingParticles />

      {/* Nav */}
      <nav style={{
        padding: '18px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(232,196,188,0.4)', background: 'rgba(253,248,244,0.85)',
        backdropFilter: 'blur(12px)', position: 'relative', zIndex: 10,
        animation: loaded ? 'fadeSlideUp 0.6s ease both' : 'none',
      }}>
        <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: '1.5rem', color: '#c9a96e', fontWeight: 600 }}>
          The Glam by Ankita
        </div>
        <div style={{ display: 'flex', gap: 36, fontFamily: "'Nunito', sans-serif", fontSize: '0.88rem', color: '#6b3d2e', fontWeight: 600 }}>
          {['Home','About','Services','Gallery','Contact'].map(n => (
            <span key={n} style={{ cursor: 'pointer', transition: 'color 0.2s' }}>{n}</span>
          ))}
        </div>
        <BookBtn />
      </nav>

      {/* Hero */}
      <section style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, minHeight: 500,
        padding: '0 48px', alignItems: 'center', position: 'relative', zIndex: 2,
      }}>
        <div style={{ padding: '56px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(201,169,110,0.12)',
            border: '1px solid rgba(201,169,110,0.3)', borderRadius: 999, padding: '5px 16px',
            fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem', color: '#9e7c4a', fontWeight: 700,
            letterSpacing: '0.06em', marginBottom: 24,
            animation: loaded ? 'fadeSlideUp 0.5s 0.1s ease both' : 'none', opacity: loaded ? undefined : 0,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c9a96e', display: 'block' }} />
            Melbourne Makeup Artist
          </div>

          <h1 style={{ margin: '0 0 8px', lineHeight: 1.08 }}>
            {['Beauty', 'That', 'Tells', 'Your', 'Story'].map((word, i) => (
              <span
                key={word}
                style={{
                  display: i === 2 ? 'block' : 'inline',
                  fontFamily: i === 2 ? "'Playfair Display', serif" : "'Playfair Display', serif",
                  fontSize: i === 2 ? '3.2rem' : '2.6rem',
                  fontWeight: i === 2 ? 700 : 700,
                  fontStyle: i === 2 ? 'italic' : 'normal',
                  color: i === 2
                    ? 'transparent'
                    : '#2c1810',
                  background: i === 2
                    ? 'linear-gradient(90deg, #c9a96e 0%, #e8d5a3 30%, #c9a96e 60%, #9e7c4a 100%)'
                    : undefined,
                  backgroundSize: i === 2 ? '200% auto' : undefined,
                  WebkitBackgroundClip: i === 2 ? 'text' : undefined,
                  WebkitTextFillColor: i === 2 ? 'transparent' : undefined,
                  animation: i === 2
                    ? `shimmerText 4s linear infinite, fadeSlideUp 0.6s ${0.2 + i * 0.08}s ease both`
                    : `fadeSlideUp 0.6s ${0.2 + i * 0.08}s ease both`,
                  opacity: loaded ? undefined : 0,
                  marginRight: i < 4 ? 12 : 0,
                }}
              >
                {word}{' '}
              </span>
            ))}
          </h1>

          <p style={{
            fontFamily: "'Nunito', sans-serif", fontSize: '0.95rem', color: '#6b3d2e', lineHeight: 1.75,
            maxWidth: 400, margin: '16px 0 32px',
            animation: loaded ? 'fadeSlideUp 0.6s 0.55s ease both' : 'none', opacity: loaded ? undefined : 0,
          }}>
            Professional makeup artistry tailored to you — from soft everyday glam to full bridal transformations.
          </p>

          <div style={{
            display: 'flex', gap: 16, alignItems: 'center',
            animation: loaded ? 'fadeSlideUp 0.6s 0.7s ease both' : 'none', opacity: loaded ? undefined : 0,
          }}>
            <RippleButton label="✦ Book Appointment" primary />
            <RippleButton label="View Portfolio" />
          </div>

          {/* Stats */}
          <div style={{
            display: 'flex', gap: 32, marginTop: 40,
            animation: loaded ? 'fadeSlideUp 0.6s 0.85s ease both' : 'none', opacity: loaded ? undefined : 0,
          }}>
            {[['200+', 'Happy Clients'], ['5★', 'Reviews'], ['8+', 'Years Exp.']].map(([val, lbl]) => (
              <div key={lbl}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', fontWeight: 700, color: '#c9a96e' }}>{val}</div>
                <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.75rem', color: '#9a7060', fontWeight: 600 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero photo placeholder */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px 0',
          animation: loaded ? 'scaleIn 0.8s 0.3s ease both' : 'none', opacity: loaded ? undefined : 0,
        }}>
          <div style={{
            width: 360, height: 440, borderRadius: '60% 40% 55% 45% / 50% 60% 40% 50%',
            background: 'linear-gradient(135deg, #f5ddd8, #e8c4bc, #c9a96e22)',
            border: '2px solid rgba(201,169,110,0.3)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 30px 80px rgba(201,169,110,0.25), inset 0 1px 0 rgba(255,255,255,0.6)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, rgba(253,248,244,0.4) 0%, transparent 60%)',
            }} />
            <span style={{ fontSize: '5rem', zIndex: 1 }}>💄</span>
            <span style={{ fontFamily: "'Dancing Script', cursive", fontSize: '1.1rem', color: '#9e7c4a', zIndex: 1, marginTop: 8 }}>Your Glam Story</span>
          </div>
        </div>
      </section>

      {/* Services */}
      <section style={{ padding: '48px 48px 32px', position: 'relative', zIndex: 2 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: '1.1rem', color: '#c9a96e', marginBottom: 6 }}>What I Offer</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 700, color: '#2c1810', margin: 0 }}>
            Services
            <span style={{
              display: 'block', height: 3, background: 'linear-gradient(90deg, #c9a96e, #e8d5a3, #c9a96e)',
              borderRadius: 2, marginTop: 6, animation: loaded ? 'drawLine 1.2s 1s ease both' : 'none',
            }} />
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <ServiceCard icon="💒" title="Bridal Glam" desc="Full bridal looks from traditional elegance to modern romance" delay={900} />
          <ServiceCard icon="✨" title="Event Makeup" desc="Polished looks for galas, parties & special occasions" delay={1050} />
          <ServiceCard icon="📸" title="Editorial" desc="Fashion-forward artistry for shoots & productions" delay={1200} />
          <ServiceCard icon="🌟" title="Soft Glam" desc="Effortlessly beautiful everyday & date night looks" delay={1350} />
        </div>
      </section>
    </div>
  );
}

function BookBtn() {
  const [h, setH] = useState(false);
  return (
    <button
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h ? 'linear-gradient(135deg, #d4b47a, #a88550)' : 'linear-gradient(135deg, #c9a96e, #9e7c4a)',
        color: '#fff', border: 'none', borderRadius: 999, padding: '9px 22px',
        fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
        transition: 'all 0.3s', boxShadow: h ? '0 8px 24px rgba(201,169,110,0.45)' : '0 4px 14px rgba(201,169,110,0.3)',
        transform: h ? 'translateY(-1px)' : 'none',
        letterSpacing: '0.02em',
      }}
    >
      ✦ Book Now
    </button>
  );
}

function RippleButton({ label, primary }: { label: string; primary?: boolean }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const id = Date.now();
    setRipples(r => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples(r => r.filter(x => x.id !== id)), 700);
  };

  return (
    <button
      ref={ref} onClick={handleClick}
      style={{
        position: 'relative', overflow: 'hidden',
        background: primary ? 'linear-gradient(135deg, #c9a96e, #9e7c4a)' : 'transparent',
        color: primary ? '#fff' : '#6b3d2e',
        border: primary ? 'none' : '1.5px solid #c9a96e',
        borderRadius: 999, padding: '12px 28px',
        fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
        boxShadow: primary ? '0 8px 28px rgba(201,169,110,0.35)' : 'none',
        transition: 'transform 0.2s, box-shadow 0.2s',
        letterSpacing: '0.02em',
      }}
    >
      {ripples.map(r => (
        <span
          key={r.id}
          style={{
            position: 'absolute', left: r.x, top: r.y, width: 80, height: 80,
            borderRadius: '50%', background: 'rgba(255,255,255,0.4)',
            transform: 'translate(-50%,-50%) scale(0)',
            animation: 'ripple 0.7s ease-out forwards',
            pointerEvents: 'none',
          }}
        />
      ))}
      {label}
    </button>
  );
}
