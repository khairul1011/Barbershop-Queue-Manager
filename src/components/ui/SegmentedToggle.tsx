import React from 'react';
import { Button } from '@/components/ui/button';

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
        const sizeClass = size === 'sm' ? 'h-6 px-2.5 text-[10px]' : 'h-8 px-4 text-xs';
        
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
            className={`inline-flex items-center justify-center whitespace-nowrap ${sizeClass} font-mono font-bold rounded-lg uppercase cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${activeClass}`}
            id={`${idPrefix}-${option.value}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
