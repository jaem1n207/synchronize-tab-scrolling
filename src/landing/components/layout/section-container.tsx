import { motion } from 'motion/react';

import type { ReactNode } from 'react';

import { cn } from '~/shared/lib/utils';

interface SectionContainerProps {
  id?: string;
  className?: string;
  children: ReactNode;
}

export function SectionContainer({ id, className, children }: SectionContainerProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{
        type: 'spring',
        stiffness: 100,
        damping: 25,
      }}
      className={cn('mx-auto max-w-6xl px-4 py-20 md:py-28', className)}
    >
      {children}
    </motion.section>
  );
}
