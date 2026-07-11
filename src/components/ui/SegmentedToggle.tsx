import React from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  activeColor?: 'teal' | 'amber' | 'gray' | 'blue';
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
  return (
    <div className={`flex bg-[#0D0D0D] p-1 rounded-xl border border-border-subtle ${className}`}>
      {options.map((option) => {
        const isActive = value === option.value;
        const sizeClass = size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-1.5 text-xs';
        
        let activeClass = 'text-gray-500 hover:text-white';
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
            activeClass = 'bg-zinc-700 text-white font-semibold';
          }
        }

        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`${sizeClass} font-mono font-bold rounded-lg uppercase cursor-pointer transition-all ${activeClass}`}
            id={`${idPrefix}-${option.value}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
