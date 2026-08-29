import React from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  activeColor?: 'teal' | 'amber' | 'gray' | 'blue';
  /** When at least one option in the group carries an icon, inactive tabs collapse to icon-only and the active tab expands to icon+label. */
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedToggleProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  idPrefix?: string;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  idPrefix = 'toggle'
}: SegmentedToggleProps<T>) {
  const hasIcons = options.some((option) => option.icon);

  return (
    <div className={`flex bg-background p-1 rounded-lg border border-border ${className}`}>
      {options.map((option) => {
        const isActive = value === option.value;
        const sizeClass = hasIcons
          ? (size === 'sm' ? 'h-6 px-2 text-[10px] gap-1.5' : 'h-8 px-3 text-xs gap-1.5')
          : (size === 'sm' ? 'h-6 px-2.5 text-[10px]' : 'h-8 px-4 text-xs');

        let activeClass = 'text-muted-foreground hover:text-foreground';
        if (isActive) {
          if (option.activeColor === 'teal') {
            activeClass = 'bg-teal-500 text-black font-semibold';
          } else if (option.activeColor === 'amber') {
            activeClass = 'bg-amber-500 text-black font-semibold';
          } else if (option.activeColor === 'gray') {
            activeClass = 'bg-gray-500 text-black font-semibold';
          } else if (option.activeColor === 'blue') {
            activeClass = 'bg-blue-500 text-black font-semibold';
          } else {
            activeClass = 'bg-primary text-primary-foreground font-semibold';
          }
        }

        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={option.disabled}
            className={`inline-flex items-center justify-center whitespace-nowrap ${sizeClass} font-mono font-bold rounded-md uppercase cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed ${activeClass}`}
            id={`${idPrefix}-${option.value}`}
          >
            {hasIcons ? (
              <>
                {option.icon}
                {isActive && <span>{option.label}</span>}
              </>
            ) : (
              option.label
            )}
          </button>
        );
      })}
    </div>
  );
}
