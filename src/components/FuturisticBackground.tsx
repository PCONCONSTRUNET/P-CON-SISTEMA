import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  brightness: number;
}

interface WaveLine {
  id: number;
  y: number;
  delay: number;
}

const FuturisticBackground = () => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [waveLines, setWaveLines] = useState<WaveLine[]>([]);

  useEffect(() => {
    // Generate floating particles
    const newParticles: Particle[] = [];
    for (let i = 0; i < 40; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        size: Math.random() * 4 + 1,
        duration: Math.random() * 25 + 20,
        delay: Math.random() * 30,
        brightness: Math.random() * 0.5 + 0.5,
      });
    }
    setParticles(newParticles);

    // Generate wave lines
    const newWaveLines: WaveLine[] = [];
    for (let i = 0; i < 5; i++) {
      newWaveLines.push({
        id: i,
        y: 20 + i * 15,
        delay: i * 2,
      });
    }
    setWaveLines(newWaveLines);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Base gradient - matching logo colors */}
      <div className="absolute inset-0 futuristic-bg" />

      {/* Mesh gradients */}
      <div className="mesh-gradient mesh-gradient-1" />
      <div className="mesh-gradient mesh-gradient-2" />
      <div className="mesh-gradient mesh-gradient-3" />
      <div className="mesh-gradient mesh-gradient-4" />

      {/* Aurora effect */}
      <div className="aurora-effect" />

      {/* Animated gradient waves */}
      {waveLines.map((wave) => (
        <motion.div
          key={wave.id}
          className="absolute left-0 right-0 h-px"
          style={{
            top: `${wave.y}%`,
            background: `linear-gradient(90deg, 
              transparent 0%, 
              hsl(220 70% 55% / 0.15) 20%, 
              hsl(260 70% 50% / 0.2) 50%, 
              hsl(280 75% 50% / 0.15) 80%, 
              transparent 100%
            )`,
          }}
          animate={{
            opacity: [0.3, 0.8, 0.3],
            scaleY: [1, 2, 1],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            delay: wave.delay,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Pulsing glow orbs */}
      <motion.div
        className="glow-orb w-[500px] h-[500px]"
        style={{
          background: 'radial-gradient(circle, hsl(220 70% 55% / 0.35), transparent 60%)',
          top: '10%',
          right: '5%',
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="glow-orb w-[600px] h-[600px]"
        style={{
          background: 'radial-gradient(circle, hsl(280 75% 45% / 0.3), transparent 60%)',
          bottom: '5%',
          left: '10%',
        }}
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.4, 0.2, 0.4],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
      />

      <motion.div
        className="glow-orb w-[400px] h-[400px]"
        style={{
          background: 'radial-gradient(circle, hsl(250 70% 50% / 0.25), transparent 60%)',
          top: '50%',
          left: '40%',
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.2, 0.5, 0.2],
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 4,
        }}
      />

      {/* Scan line effect */}
      <motion.div
        className="absolute left-0 right-0 h-[2px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, hsl(220 70% 65% / 0.8), hsl(280 75% 55% / 0.8), transparent)',
          boxShadow: '0 0 20px hsl(220 70% 55% / 0.5), 0 0 40px hsl(280 75% 45% / 0.3)',
        }}
        initial={{ top: '-2px', opacity: 0 }}
        animate={{
          top: ['0%', '100%'],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Floating particles */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}%`,
            width: particle.size,
            height: particle.size,
            background: `linear-gradient(135deg, 
              hsl(220 70% 70% / ${particle.brightness}), 
              hsl(280 75% 60% / ${particle.brightness * 0.7})
            )`,
            boxShadow: `0 0 ${particle.size * 3}px hsl(220 70% 60% / 0.4)`,
          }}
          initial={{ y: '110vh', opacity: 0 }}
          animate={{
            y: '-10vh',
            opacity: [0, particle.brightness, particle.brightness, 0],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: 'linear',
          }}
        />
      ))}

      {/* Hexagonal grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(30deg, hsl(220 70% 60% / 0.15) 12%, transparent 12.5%, transparent 87%, hsl(220 70% 60% / 0.15) 87.5%, hsl(220 70% 60% / 0.15)),
            linear-gradient(150deg, hsl(220 70% 60% / 0.15) 12%, transparent 12.5%, transparent 87%, hsl(220 70% 60% / 0.15) 87.5%, hsl(220 70% 60% / 0.15)),
            linear-gradient(30deg, hsl(220 70% 60% / 0.15) 12%, transparent 12.5%, transparent 87%, hsl(220 70% 60% / 0.15) 87.5%, hsl(220 70% 60% / 0.15)),
            linear-gradient(150deg, hsl(220 70% 60% / 0.15) 12%, transparent 12.5%, transparent 87%, hsl(220 70% 60% / 0.15) 87.5%, hsl(220 70% 60% / 0.15)),
            linear-gradient(60deg, hsl(280 75% 55% / 0.1) 25%, transparent 25.5%, transparent 75%, hsl(280 75% 55% / 0.1) 75%, hsl(280 75% 55% / 0.1)),
            linear-gradient(60deg, hsl(280 75% 55% / 0.1) 25%, transparent 25.5%, transparent 75%, hsl(280 75% 55% / 0.1) 75%, hsl(280 75% 55% / 0.1))
          `,
          backgroundSize: '80px 140px',
          backgroundPosition: '0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px',
        }}
      />

      {/* Grid lines */}
      <div 
        className="absolute inset-0 opacity-[0.012]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(220 70% 60% / 0.3) 1px, transparent 1px),
            linear-gradient(90deg, hsl(220 70% 60% / 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Noise texture */}
      <div 
        className="absolute inset-0 opacity-[0.018]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Vignette effect */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, transparent 0%, hsl(var(--background)) 80%)',
        }}
      />

      {/* Corner glows */}
      <motion.div
        className="absolute top-0 left-0 w-[400px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 0% 0%, hsl(220 70% 50% / 0.2), transparent 60%)',
        }}
        animate={{
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="absolute bottom-0 right-0 w-[400px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 100% 100%, hsl(280 75% 45% / 0.2), transparent 60%)',
        }}
        animate={{
          opacity: [0.6, 0.9, 0.6],
        }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 3,
        }}
      />
    </div>
  );
};

export default FuturisticBackground;