import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Wrench,
  FileCheck2,
  CalendarRange,
  Activity,
  CircleDot,
  MapPinned,
  ShieldCheck,
  Gauge,
  Sparkles,
  Network,
  BarChart3,
} from 'lucide-react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';

import PortailLayout from '../../components/shell/PortailLayout';

/* =========================================================
   ANIMATIONS
========================================================= */

const stagger = {
  hidden: {},
  shown: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const fadeUp = {
  hidden: {
    opacity: 0,
    y: 22,
  },

  shown: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      ease: [0.22, 0.9, 0.32, 1] as [number, number, number, number],
    },
  },
};

const fadeUpDelayed = {
  hidden: {
    opacity: 0,
    y: 16,
  },
  shown: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      delay: 0.15,
      ease: [0.22, 0.9, 0.32, 1] as [number, number, number, number],
    },
  },
};

const fadeScale = {
  hidden: {
    opacity: 0,
    scale: 0.94,
    y: 18,
  },

  shown: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.75,
      ease: [0.22, 0.9, 0.32, 1] as [number, number, number, number],
    },
  },
};

// Copie du titre du hero qui "descend" en 3D lorsqu'elle entre dans
// le viewport, une seule fois (viewport once: true côté render).
const descend3D = {
  hidden: {
    opacity: 0,
    y: -100,
    rotateX: -75,
  },
  shown: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: {
      duration: 0.95,
      ease: [0.22, 0.9, 0.32, 1] as [number, number, number, number],
    },
  },
};

/* =========================================================
   TITRE HERO — effet machine à écrire (rapide)
========================================================= */

const TITLE_LINES: { text: string; className: string }[] = [
  { text: 'La maintenance', className: 'text-white' },
  { text: 'intelligente', className: 'text-white/90' },
  {
    text: 'du réseau tramway.',
    className:
      'bg-gradient-to-r from-[#67e8f9] via-[#38bdf8] to-[#60a5fa] bg-clip-text text-transparent',
  },
];

function useTypewriter(
  lines: { text: string; className: string }[],
  speed = 24,
  linePause = 140
) {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (lineIndex >= lines.length) {
      setDone(true);
      return;
    }

    const currentLine = lines[lineIndex].text;

    if (charIndex < currentLine.length) {
      const t = setTimeout(() => setCharIndex((c) => c + 1), speed);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setLineIndex((l) => l + 1);
      setCharIndex(0);
    }, linePause);

    return () => clearTimeout(t);
  }, [lineIndex, charIndex, lines, speed, linePause]);

  return { lineIndex, charIndex, done };
}

/* =========================================================
   MODULES
========================================================= */

const MODULES = [
  {
    to: '/planification',
    icon: CalendarRange,
    number: '01',
    title: 'Planification',
    tag: '1 application',
    description:
      'Planning des interventions, gestion des congés, clôture mensuelle et suivi de charge par unité opérationnelle.',
  },

  {
    to: '/ingenierie',
    icon: Wrench,
    number: '02',
    title: 'Ingénierie',
    tag: '6 applications',
    description:
      'Analyse Pareto, MTBF, AMDEC, audit RAM et rapport journalier — suivi des indicateurs GMAO du matériel roulant.',
  },

  {
    to: '/documents',
    icon: FileCheck2,
    number: '03',
    title: 'Documents',
    tag: '3 volets',
    description:
      "Validation des rapports d'activité, registre des documents techniques et suivi des demandes de modification.",
  },
];

/* =========================================================
   SITES — répartis sur l'anneau 3D du hero
========================================================= */

const SITES = ['ALG', 'ORN', 'MGM', 'ORG', 'STF', 'SBA', 'CST'];

/* =========================================================
   PARTICLES
========================================================= */

const PARTICLES = [
  { left: '7%', top: '22%', size: 3, duration: 4.2, delay: 0 },
  { left: '16%', top: '67%', size: 4, duration: 5.5, delay: 1 },
  { left: '31%', top: '18%', size: 3, duration: 4.8, delay: 0.7 },
  { left: '47%', top: '77%', size: 4, duration: 5.8, delay: 1.7 },
  { left: '61%', top: '20%', size: 3, duration: 4.5, delay: 0.4 },
  { left: '76%', top: '70%', size: 4, duration: 5.2, delay: 1.3 },
  { left: '91%', top: '31%', size: 3, duration: 4.6, delay: 2 },
];

/* =========================================================
   COMPONENT
========================================================= */

export default function Home() {
  /* =======================================================
     MOUSE 3D
  ======================================================= */

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const smoothX = useSpring(mouseX, {
    stiffness: 80,
    damping: 20,
    mass: 0.7,
  });

  const smoothY = useSpring(mouseY, {
    stiffness: 80,
    damping: 20,
    mass: 0.7,
  });

  const heroRotateX = useTransform(
    smoothY,
    [-0.5, 0.5],
    [3.5, -3.5]
  );

  const heroRotateY = useTransform(
    smoothX,
    [-0.5, 0.5],
    [-4, 4]
  );

  const cardX = useTransform(
    smoothX,
    [-0.5, 0.5],
    [-12, 12]
  );

  const cardY = useTransform(
    smoothY,
    [-0.5, 0.5],
    [-8, 8]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const x =
        event.clientX / window.innerWidth - 0.5;

      const y =
        event.clientY / window.innerHeight - 0.5;

      mouseX.set(x);
      mouseY.set(y);
    };

    window.addEventListener(
      'mousemove',
      handleMouseMove
    );

    return () => {
      window.removeEventListener(
        'mousemove',
        handleMouseMove
      );
    };
  }, [mouseX, mouseY]);

  /* =======================================================
     TYPEWRITER DU TITRE HERO
  ======================================================= */

  const { lineIndex, charIndex, done: titleDone } = useTypewriter(
    TITLE_LINES,
    24,
    140
  );

  return (
    <PortailLayout ambient={false}>

      {/* =====================================================
          HERO
      ===================================================== */}

      <section
        className="
          relative
          min-h-screen
          overflow-hidden
          bg-[#071b2e]
        "
      >

        {/* =================================================
            VIDEO
        ================================================= */}

        <div className="absolute inset-0">

          <video
            src="/hero/tram-assembly.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="
              absolute
              inset-0
              h-full
              w-full
              object-cover
              object-center
            "
          />

          {/* Blue atmospheric overlay */}

          <div
            className="
              absolute
              inset-0
              bg-[#08233a]/25
            "
          />

          {/* Left readability gradient */}

          <div
            className="
              absolute
              inset-0
              bg-gradient-to-r
              from-[#061a2d]/75
              via-[#08243a]/40
              to-transparent
            "
          />

          {/* Bottom transition */}

          <div
            className="
              absolute
              inset-0
              bg-gradient-to-t
              from-[#071b2e]/90
              via-transparent
              to-[#071b2e]/20
            "
          />

          {/* Soft cyan atmosphere */}

          <div
            className="
              absolute
              inset-0
              bg-[#0ea5e9]/[0.035]
              mix-blend-screen
            "
          />

        </div>

        {/* =================================================
            ANIMATED BLUE ORBS
        ================================================= */}

        <motion.div
          animate={{
            x: [0, 70, 0],
            y: [0, -35, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 13,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="
            pointer-events-none
            absolute
            -left-40
            top-[20%]
            h-[430px]
            w-[430px]
            rounded-full
            bg-[#0ea5e9]/12
            blur-[110px]
          "
        />

        <motion.div
          animate={{
            x: [0, -60, 0],
            y: [0, 45, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="
            pointer-events-none
            absolute
            right-[-160px]
            bottom-[-120px]
            h-[500px]
            w-[500px]
            rounded-full
            bg-[#2563eb]/15
            blur-[120px]
          "
        />

        {/* =================================================
            MOVING TECH GRID
        ================================================= */}

        <motion.div
          animate={{
            backgroundPosition: [
              '0px 0px',
              '70px 70px',
            ],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="
            pointer-events-none
            absolute
            inset-0
            opacity-[0.13]
          "
          style={{
            backgroundImage: `
              linear-gradient(
                rgba(56,189,248,.35) 1px,
                transparent 1px
              ),
              linear-gradient(
                90deg,
                rgba(56,189,248,.35) 1px,
                transparent 1px
              )
            `,
            backgroundSize: '70px 70px',
          }}
        />

        {/* =================================================
            PARTICLES
        ================================================= */}

        {PARTICLES.map((particle, index) => (
          <motion.span
            key={index}
            animate={{
              y: [0, -24, 0],
              opacity: [0.15, 0.8, 0.15],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="
              pointer-events-none
              absolute
              z-[2]
              rounded-full
              bg-[#67e8f9]
              shadow-[0_0_14px_rgba(103,232,249,.7)]
            "
            style={{
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
            }}
          />
        ))}

        {/* =================================================
            HERO CONTENT
        ================================================= */}

        <div
          className="
            relative
            z-20
            mx-auto
            flex
            min-h-screen
            max-w-[1450px]
            items-center
            px-6
            pb-20
            pt-28
            md:px-10
            lg:px-16
          "
        >

          <motion.div
            style={{
              rotateX: heroRotateX,
              rotateY: heroRotateY,
              transformPerspective: 1400,
            }}
            className="w-full"
          >

            <motion.div
              variants={stagger}
              initial="hidden"
              animate="shown"
              className="
                grid
                items-center
                gap-12
                lg:grid-cols-[minmax(0,1fr)_390px]
                lg:gap-16
              "
            >

              {/* =================================================
                  LEFT CONTENT
              ================================================= */}

              <div className="max-w-[720px]">

                {/* Title — effet machine à écrire, le curseur
                    glisse en douceur d'une ligne à l'autre */}

                <div
                  className="
                    max-w-[720px]
                    min-h-[3.6em]
                    sm:min-h-[3.1em]
                  "
                  style={{ perspective: 900 }}
                >
                  <motion.h1
                    variants={fadeUp}
                    className="
                      max-w-[720px]
                      font-display
                      text-[clamp(2.5rem,5vw,4.7rem)]
                      font-extrabold
                      leading-[0.95]
                      tracking-[-0.055em]
                      text-white
                    "
                  >
                    {TITLE_LINES.map((line, i) => {
                      if (i > lineIndex) return null;

                      const isActiveLine = i === lineIndex && !titleDone;
                      const text = isActiveLine
                        ? line.text.slice(0, charIndex)
                        : line.text;

                      return (
                        <span key={line.text}>
                          <span className={line.className}>{text}</span>
                          {isActiveLine && (
                            <motion.span
                              layout
                              layoutId="typing-cursor"
                              transition={{
                                duration: 0.22,
                                ease: [0.22, 0.9, 0.32, 1] as [number, number, number, number],
                              }}
                              className="
                                ml-1
                                inline-block
                                h-[0.8em]
                                w-[3px]
                                translate-y-[0.08em]
                                bg-[#67e8f9]
                                align-middle
                                animate-pulse
                              "
                            />
                          )}
                          {i < TITLE_LINES.length - 1 && <br />}
                        </span>
                      );
                    })}
                  </motion.h1>
                </div>

                {/* Description — apparaît après le titre */}

                <motion.p
                  initial="hidden"
                  animate={titleDone ? 'shown' : 'hidden'}
                  variants={fadeUpDelayed}
                  className="
                    mt-7
                    max-w-[550px]
                    text-[13px]
                    leading-7
                    text-white/65
                    md:text-sm
                  "
                >
                  Une plateforme centralisée pour piloter les
                  opérations, analyser les performances et
                  améliorer la fiabilité de la maintenance
                  du réseau tramway.
                </motion.p>

                {/* Buttons — apparaissent après la description */}

                <motion.div
                  initial="hidden"
                  animate={titleDone ? 'shown' : 'hidden'}
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    shown: {
                      opacity: 1,
                      y: 0,
                      transition: {
                        duration: 0.55,
                        delay: 0.32,
                        ease: [0.22, 0.9, 0.32, 1] as [number, number, number, number],
                      },
                    },
                  }}
                  className="
                    mt-8
                    flex
                    flex-col
                    gap-3
                    sm:flex-row
                  "
                >

                  <Link
                    to="/ingenierie"
                    className="
                      group
                      inline-flex
                      h-11
                      items-center
                      justify-center
                      gap-3
                      rounded-xl
                      bg-gradient-to-r
                      from-[#0284c7]
                      to-[#2563eb]
                      px-5
                      font-data
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.13em]
                      text-white
                      shadow-[0_12px_35px_rgba(14,165,233,.25)]
                      transition-all
                      duration-300
                      hover:-translate-y-1
                      hover:shadow-[0_18px_45px_rgba(14,165,233,.4)]
                    "
                  >

                    Explorer la plateforme

                    <ArrowRight
                      size={14}
                      className="
                        transition-transform
                        duration-300
                        group-hover:translate-x-1
                      "
                    />

                  </Link>

                  <Link
                    to="/planification"
                    className="
                      inline-flex
                      h-11
                      items-center
                      justify-center
                      rounded-xl
                      border
                      border-white/20
                      bg-[#08243a]/45
                      px-5
                      font-data
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.13em]
                      text-white/75
                      backdrop-blur-lg
                      transition-all
                      hover:-translate-y-1
                      hover:border-[#38bdf8]/50
                      hover:bg-[#0b304b]/65
                      hover:text-white
                    "
                  >

                    Voir les applications

                  </Link>

                </motion.div>

              </div>

              {/* =================================================
                  3D SYSTEM
              ================================================= */}

              <motion.div
                variants={fadeScale}
                className="
                  relative
                  mx-auto
                  h-[400px]
                  w-full
                  max-w-[390px]
                  [perspective:1400px]
                "
              >

                {/* =================================================
                    OUTER 3D RING — 7 sites répartis
                ================================================= */}

                <motion.div
                  animate={{
                    rotateZ: 360,
                  }}
                  transition={{
                    duration: 35,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="
                    absolute
                    left-1/2
                    top-1/2
                    h-[330px]
                    w-[330px]
                    -translate-x-1/2
                    -translate-y-1/2
                    rounded-full
                    border
                    border-[#38bdf8]/20
                  "
                >

                  {SITES.map((site, i) => {
                    const angle = (i * 360) / SITES.length;
                    const rad = (angle * Math.PI) / 180;
                    const radius = 165;
                    const x = radius * Math.cos(rad);
                    const y = radius * Math.sin(rad);

                    return (
                      <div
                        key={site}
                        className="absolute left-1/2 top-1/2"
                        style={{
                          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                        }}
                      >
                        {/* Contre-rotation pour garder le libellé lisible */}
                        <motion.div
                          animate={{ rotateZ: -360 }}
                          transition={{
                            duration: 35,
                            repeat: Infinity,
                            ease: 'linear',
                          }}
                          className="
                            flex
                            h-9
                            w-9
                            items-center
                            justify-center
                            rounded-full
                            border
                            border-[#38bdf8]/30
                            bg-[#0b3049]/85
                            font-data
                            text-[8px]
                            font-bold
                            tracking-[0.04em]
                            text-[#67e8f9]
                            shadow-[0_0_14px_rgba(56,189,248,.35)]
                            backdrop-blur-md
                          "
                        >
                          {site}
                        </motion.div>
                      </div>
                    );
                  })}

                </motion.div>

                {/* =================================================
                    SECOND RING
                ================================================= */}

                <motion.div
                  animate={{
                    rotateZ: -360,
                  }}
                  transition={{
                    duration: 26,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="
                    absolute
                    left-1/2
                    top-1/2
                    h-[270px]
                    w-[270px]
                    -translate-x-1/2
                    -translate-y-1/2
                    rotate-[20deg]
                    rounded-full
                    border
                    border-dashed
                    border-[#0ea5e9]/25
                  "
                />

                {/* =================================================
                    FLOATING NODE - TOP
                ================================================= */}

                <motion.div
                  style={{
                    x: cardX,
                    y: cardY,
                  }}
                  className="
                    absolute
                    right-[35px]
                    top-[35px]
                    z-20
                    flex
                    h-12
                    w-12
                    items-center
                    justify-center
                    rounded-xl
                    border
                    border-[#67e8f9]/30
                    bg-[#0b3049]/75
                    text-[#67e8f9]
                    shadow-[0_15px_40px_rgba(0,0,0,.2)]
                    backdrop-blur-xl
                  "
                >

                  <Network size={19} />

                </motion.div>

                {/* =================================================
                    FLOATING NODE - LEFT
                ================================================= */}

                <motion.div
                  animate={{
                    y: [0, -10, 0],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="
                    absolute
                    left-[5px]
                    top-[150px]
                    z-30
                    flex
                    h-10
                    w-10
                    items-center
                    justify-center
                    rounded-xl
                    border
                    border-[#38bdf8]/25
                    bg-[#082943]/75
                    text-[#38bdf8]
                    backdrop-blur-xl
                  "
                >

                  <Activity size={17} />

                </motion.div>

                {/* =================================================
                    MAIN 3D CARD
                ================================================= */}

                <motion.div
                  style={{
                    x: cardX,
                    y: cardY,
                  }}
                  animate={{
                    rotateY: [-2, 2, -2],
                    rotateX: [1, -1, 1],
                  }}
                  transition={{
                    rotateY: {
                      duration: 7,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                    rotateX: {
                      duration: 8,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }}
                  whileHover={{
                    scale: 1.04,
                  }}
                  className="
                    absolute
                    left-1/2
                    top-1/2
                    z-20
                    w-[285px]
                    -translate-x-1/2
                    -translate-y-1/2
                    [transform-style:preserve-3d]
                  "
                >

                  {/* Back depth layer */}

                  <div
                    className="
                      absolute
                      inset-0
                      translate-x-3
                      translate-y-3
                      rounded-3xl
                      border
                      border-[#38bdf8]/15
                      bg-[#0ea5e9]/10
                    "
                  />

                  <div
                    className="
                      absolute
                      inset-0
                      translate-x-1.5
                      translate-y-1.5
                      rounded-3xl
                      border
                      border-[#38bdf8]/20
                      bg-[#082943]/70
                    "
                  />

                  {/* Main surface */}

                  <div
                    className="
                      relative
                      overflow-hidden
                      rounded-3xl
                      border
                      border-white/[0.16]
                      bg-[#09263d]/85
                      shadow-[0_35px_90px_rgba(0,0,0,.35)]
                      backdrop-blur-2xl
                    "
                    style={{
                      transform: 'translateZ(30px)',
                    }}
                  >
                  </div>

                </motion.div>

                {/* =================================================
                    FLOATING NODE - BOTTOM
                ================================================= */}

                <motion.div
                  animate={{
                    y: [0, 9, 0],
                    rotate: [0, 4, 0],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="
                    absolute
                    bottom-[28px]
                    right-[18px]
                    z-30
                    flex
                    items-center
                    gap-2
                    rounded-xl
                    border
                    border-white/10
                    bg-[#082943]/80
                    px-3
                    py-2.5
                    font-data
                    text-[8px]
                    uppercase
                    tracking-[0.10em]
                    text-white/60
                    shadow-[0_15px_40px_rgba(0,0,0,.2)]
                    backdrop-blur-xl
                  "
                >

                  <span
                    className="
                      h-1.5
                      w-1.5
                      rounded-full
                      bg-[#34d399]
                      shadow-[0_0_10px_rgba(52,211,153,.8)]
                    "
                  />

                  Système opérationnel

                </motion.div>

              </motion.div>

            </motion.div>

          </motion.div>

        </div>

        {/* =================================================
            BOTTOM STATUS
        ================================================= */}

        <div
          className="
            absolute
            bottom-5
            left-6
            right-6
            z-40
            flex
            flex-col
            gap-3
            font-data
            text-[8px]
            uppercase
            tracking-[0.12em]
            text-white/35
            sm:flex-row
            sm:items-center
            sm:justify-between
            md:left-10
            md:right-10
          "
        >
        </div>

      </section>

      {/* =====================================================
          APPLICATIONS
      ===================================================== */}

      <section
        className="
          relative
          overflow-hidden
          bg-[#071b2e]
          px-6
          py-24
          md:px-10
          lg:px-16
        "
      >

        {/* Blue atmospheric glow */}

        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="
            pointer-events-none
            absolute
            left-[20%]
            top-0
            h-[400px]
            w-[500px]
            rounded-full
            bg-[#0ea5e9]/10
            blur-[120px]
          "
        />

        <div className="relative mx-auto max-w-7xl" style={{ color: 'white' }}>

          {/* =================================================
              TITRE — copie indépendante du titre du hero,
              qui descend en 3D à l'entrée dans le viewport
              (une seule fois : viewport once = true)
          ================================================= */}

          <div
            className="text-center"
            style={{ perspective: 1200 }}
          >
            <motion.h2
              initial="hidden"
              whileInView="shown"
              viewport={{ once: true, margin: '-100px' }}
              variants={descend3D}
              className="
                mx-auto
                max-w-3xl
                font-display
                text-[clamp(1.9rem,4vw,3.2rem)]
                font-extrabold
                leading-[1.08]
                tracking-[-0.045em]
                text-white
                [transform-style:preserve-3d]
              "
            >
              La maintenance{' '}
              <span className="text-white/90">intelligente</span>{' '}
              <span
                className="
                  bg-gradient-to-r
                  from-[#67e8f9]
                  via-[#38bdf8]
                  to-[#60a5fa]
                  bg-clip-text
                  text-transparent
                "
              >
                du réseau tramway.
              </span>
            </motion.h2>
          </div>

          {/* CARDS */}

          <motion.div
            className="
              mt-12
              grid
              grid-cols-1
              gap-6
              md:grid-cols-3
            "
            initial="hidden"
            whileInView="shown"
            viewport={{
              once: true,
              margin: '-80px',
            }}
            variants={stagger}
          >

            {MODULES.map((m) => (

              <motion.div
                key={m.to}
                variants={fadeUp}
                whileHover={{
                  y: -10,
                  rotateX: 2,
                }}
                transition={{
                  duration: 0.3,
                }}
                className="
                  [perspective:1000px]
                "
              >

                <Link
                  to={m.to}
                  className="
                    group
                    relative
                    flex
                    min-h-[300px]
                    h-full
                    flex-col
                    overflow-hidden
                    rounded-2xl
                    border
                    border-white/[0.10]
                    bg-[#0a2941]/70
                    p-7
                    shadow-[0_18px_50px_rgba(0,0,0,.15)]
                    backdrop-blur-xl
                    transition-all
                    duration-300
                    hover:border-[#38bdf8]/30
                    hover:bg-[#0b304b]/80
                    hover:shadow-[0_25px_60px_rgba(14,165,233,.12)]
                  "
                >

                  {/* Hover glow */}

                  <div
                    className="
                      pointer-events-none
                      absolute
                      -right-16
                      -top-16
                      h-40
                      w-40
                      rounded-full
                      bg-[#0ea5e9]/0
                      blur-3xl
                      transition-all
                      duration-500
                      group-hover:bg-[#0ea5e9]/15
                    "
                  />

                  {/* Number + icon */}

                  <div
                    className="
                      relative
                      flex
                      items-start
                      justify-between
                    "
                  >

                    <span
                      className="
                        font-data
                        text-[10px]
                        font-bold
                        tracking-[0.12em]
                        text-white/25
                      "
                    >
                      {m.number}
                    </span>

                    <span
                      className="
                        flex
                        h-11
                        w-11
                        items-center
                        justify-center
                        rounded-xl
                        border
                        border-[#38bdf8]/15
                        bg-[#0ea5e9]/10
                        text-[#67e8f9]
                        transition-all
                        duration-300
                        group-hover:scale-110
                        group-hover:border-[#38bdf8]/35
                        group-hover:bg-[#0ea5e9]/15
                      "
                    >

                      <m.icon size={19} />

                    </span>

                  </div>

                  {/* Tag */}

                  <span
                    className="
                      relative
                      mt-12
                      font-data
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.15em]
                      text-[#67e8f9]
                    "
                  >
                    {m.tag}
                  </span>

                  {/* Title */}

                  <h3
                    className="
                      relative
                      mt-2
                      font-display
                      text-[22px]
                      font-bold
                      tracking-tight
                      text-white
                    "
                  >
                    {m.title}
                  </h3>

                  {/* Description */}

                  <p
                    className="
                      relative
                      mt-3
                      max-w-[330px]
                      text-[13px]
                      leading-6
                      text-white/45
                    "
                  >
                    {m.description}
                  </p>

                  {/* Link */}

                  <div
                    className="
                      relative
                      mt-auto
                      flex
                      items-center
                      gap-2
                      pt-7
                      font-data
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.12em]
                      text-white/35
                      transition-colors
                      group-hover:text-[#67e8f9]
                    "
                  >

                    Ouvrir

                    <ArrowRight
                      size={14}
                      className="
                        transition-transform
                        duration-300
                        group-hover:translate-x-1
                      "
                    />

                  </div>

                </Link>

              </motion.div>

            ))}

          </motion.div>



        </div>

      </section>

    </PortailLayout>
  );
}