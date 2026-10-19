import { motion } from 'framer-motion';

/**
 * Wraps route content with the shared "coupling" motion — a short
 * converge-and-lock settle rather than a plain fade, echoing the hero's
 * assembly motif at low volume. See Phase 1 design plan, "signature element".
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.22, 0.9, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
