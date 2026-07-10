import React from 'react';
import { cn } from '../../lib/utils';

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
  
  const baseClasses = "relative overflow-hidden flex flex-col rounded-2xl p-5 md:p-6 transition-all duration-300";
  
  const variantClasses = {
    default: "bg-card-bg border border-border-subtle hover:border-[#2A2A2A] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20",
    featured: "bg-card-bg border border-amber-500/10 hover:border-amber-500/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-500/5",
    ghost: "bg-transparent border border-dashed border-border-subtle"
  };

  const badgeColorClasses = {
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    teal: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    gray: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20"
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
        <div className="absolute inset-0 bg-amber-500/[0.03] pointer-events-none" />
      )}

      {/* Header section (Title, Icon, Badge) */}
      {(title || icon || badge) && (
        <div className="flex items-start justify-between mb-4 relative z-10">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="p-2 rounded-xl bg-white/5 text-white/70">
                {icon}
              </div>
            )}
            <div>
              {title && <h3 className="font-display font-bold text-white tracking-tight text-base md:text-lg">{title}</h3>}
              {subtitle && <p className="text-xs text-gray-400 font-sans mt-0.5">{subtitle}</p>}
            </div>
          </div>
          
          {badge && (
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border font-sans",
              badgeColorClasses[badge.color]
            )}>
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
            </div>
          )}
        </div>
      )}

      {/* Tags section */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 relative z-10">
          {tags.map((tag, idx) => (
            <span 
              key={idx} 
              className="bg-white/5 border border-white/5 rounded-md px-2 py-1 text-[11px] text-gray-400 font-sans truncate max-w-[150px]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col relative z-10">
        {children}
      </div>

      {/* Action Buttons Footer */}
      {actions && (
        <div className="mt-4 pt-4 border-t border-border-subtle relative z-10">
          {actions}
        </div>
      )}
    </div>
  );
}
