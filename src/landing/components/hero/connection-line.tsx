import { motion } from 'motion/react';

interface ConnectionLineProps {
  isSynced: boolean;
}

const DRAW_IN_DURATION = 0.6;
const FLOW_DURATION = 1.5;
const PATH_D = 'M 20 16 C 20 70, 20 130, 20 184';

export function ConnectionLine({ isSynced }: ConnectionLineProps) {
  return (
    <div className="hidden items-center justify-center md:flex" aria-hidden="true">
      <svg
        viewBox="0 0 40 200"
        className="h-48 w-10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="presentation"
      >
        <defs>
          <linearGradient id="hero-sync-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
          </linearGradient>
        </defs>

        <motion.path
          d={PATH_D}
          stroke="hsl(var(--border))"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="5 5"
          initial={false}
          animate={{ opacity: isSynced ? 0 : 0.4 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />

        <motion.path
          d={PATH_D}
          stroke="url(#hero-sync-gradient)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="8 4"
          initial={false}
          animate={{
            opacity: isSynced ? 1 : 0,
            pathLength: isSynced ? 1 : 0,
            strokeDashoffset: isSynced ? [0, -24] : 0,
          }}
          transition={{
            pathLength: { duration: DRAW_IN_DURATION, ease: [0.19, 1, 0.22, 1] },
            opacity: { duration: 0.3, ease: 'easeOut' },
            strokeDashoffset: isSynced
              ? { repeat: Infinity, duration: FLOW_DURATION, ease: 'linear' }
              : { duration: 0 },
          }}
        />

        <motion.circle
          cx={20}
          cy={16}
          r={3}
          initial={false}
          animate={{
            fill: isSynced ? 'hsl(var(--primary))' : 'hsl(var(--border))',
            scale: isSynced ? [1, 1.4, 1] : 1,
            opacity: isSynced ? 1 : 0.4,
          }}
          transition={{
            fill: { duration: 0.3 },
            scale: isSynced
              ? { repeat: Infinity, duration: 2, ease: 'easeInOut' }
              : { duration: 0.3 },
            opacity: { duration: 0.3 },
          }}
        />

        <motion.circle
          cx={20}
          cy={184}
          r={3}
          initial={false}
          animate={{
            fill: isSynced ? 'hsl(var(--primary))' : 'hsl(var(--border))',
            scale: isSynced ? [1, 1.4, 1] : 1,
            opacity: isSynced ? 1 : 0.4,
          }}
          transition={{
            fill: { duration: 0.3 },
            scale: isSynced
              ? { repeat: Infinity, duration: 2, ease: 'easeInOut', delay: 0.5 }
              : { duration: 0.3 },
            opacity: { duration: 0.3 },
          }}
        />
      </svg>
    </div>
  );
}
