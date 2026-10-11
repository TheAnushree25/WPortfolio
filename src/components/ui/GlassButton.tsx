import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
};

/**
 * Frosted pill with a travelling border shine. On hover the label lights up
 * in a sweep and the icon swells — the styles live in globals.css because they
 * animate registered custom properties.
 */
export function GlassButton({ children, icon, className, type = 'button', ...rest }: GlassButtonProps) {
  return (
    <button type={type} className={cn('glass-button', className)} {...rest}>
      <span>{children}</span>
      {icon}
    </button>
  );
}
