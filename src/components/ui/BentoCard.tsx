import React from 'react';
import { cn } from '../../lib/utils';
import { Badge } from '@/components/ui/badge';

interface BentoCardProps {
  colSpan?: 1 | 2;
  rowSpan?: 1 | 2;
  className?: string;
  variant?: 'default' | 'featured' | 'ghost';
  badge?: {
    label: string;
    color: 'amber' | 'teal' | 'gray' | 'red' | 'emerald' | 'blue';
    dot?: boolean;
  };
  icon?: React.ReactNode;
  title?: string;
  subtitle?: string;
  tags?: string[];
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function BentoCard({
  colSpan = 1,
  rowSpan = 1,
  className,
  variant = 'default',
  badge,
  icon,
  title,
  subtitle,
  tags,
  children,
  actions,
}: BentoCardProps) {
  
  const baseClasses = "relative overflow-hidden flex flex-col rounded-xl p-5 md:p-6 transition-colors duration-200";

  const variantClasses = {
    default: "bg-card border border-border hover:border-ring/30",
    featured: "bg-card border border-primary/15 hover:border-primary/25",
    ghost: "bg-transparent border border-dashed border-border"
  };

  return (
    <div
      className={cn(
        baseClasses,
        variantClasses[variant],
        // The grid system changed to col-span-1 md:col-span-* for wrapping, 
        // but if BentoCard is used natively in a CSS grid, we apply these:
        colSpan === 2 && "lg:col-span-2",
        rowSpan === 2 && "row-span-2",
        className
      )}
    >
      {/* Featured ambient glow */}
      {variant === 'featured' && (
        <div className="absolute inset-0 bg-primary/[0.03] pointer-events-none" />
      )}

      {/* Header section (Title, Icon, Tags, Badge) */}
      {(title || icon || badge || (tags && tags.length > 0)) && (
        <div className="flex items-start justify-between gap-3 mb-4 relative z-10">
          <div className="flex items-center flex-wrap gap-2.5">
            {icon && (
              <div className="text-muted-foreground flex items-center">
                {icon}
              </div>
            )}

            {(title || subtitle) && (
              <div>
                {title && <h3 className="font-display font-bold text-foreground tracking-tight text-base md:text-lg">{title}</h3>}
                {subtitle && <p className="text-xs text-muted-foreground font-sans mt-0.5">{subtitle}</p>}
              </div>
            )}

            {/* Tags section inline with title */}
            {tags && tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-0.5 sm:mt-0">
                {tags.map((tag, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="bg-muted border-border text-[11px] text-muted-foreground font-sans font-normal truncate max-w-[150px] rounded-md px-2 py-0.5"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          
          {badge && (
            <Badge variant={badge.color as any} className="gap-1.5 font-sans whitespace-nowrap shrink-0">
              {badge.dot && (
                <span className="relative flex h-2 w-2">
                  <span className={cn(
                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                    badge.color === 'amber' ? 'bg-amber-400' : 'bg-current'
                  )}></span>
                  <span className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    badge.color === 'amber' ? 'bg-amber-500' : 'bg-current'
                  )}></span>
                </span>
              )}
              {badge.label}
            </Badge>
          )}
        </div>
      )}

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col relative z-10">
        {children}
      </div>

      {/* Action Buttons Footer */}
      {actions && (
        <div className="mt-4 pt-4 border-t border-border relative z-10">
          {actions}
        </div>
      )}
    </div>
  );
}
