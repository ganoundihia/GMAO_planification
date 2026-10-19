import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-steel text-white hover:bg-steel-dark shadow-sm shadow-steel/30',
  secondary:
    'bg-white text-ink border border-line hover:bg-paper',
  ghost: 'bg-transparent text-ink-muted hover:bg-paper hover:text-ink',
  danger: 'bg-fault text-white hover:bg-fault/90',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold
        transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel focus-visible:ring-offset-2
        ${variantClasses[variant]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export default Button;
