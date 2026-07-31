import React from 'react';
import { cn } from '../../lib/utils';
import { VariantProps, cva } from "class-variance-authority";

const buttonVariants = cva(
    "relative group border text-foreground text-center rounded-xl",
    {
        variants: {
            variant: {
                default: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/20 text-amber-500",
                solid: "bg-amber-500 hover:bg-amber-600 text-black font-semibold border-transparent hover:border-amber-400 transition-all duration-200",
                ghost: "border-transparent bg-transparent hover:border-zinc-800 hover:bg-[#121212]",
            },
            size: {
                default: "px-6 py-2.5",
                sm: "px-4 py-1.5 text-sm",
                lg: "px-8 py-3 text-lg",
                icon: "h-10 w-10 flex items-center justify-center p-0",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> { 
    neon?: boolean;
}

const NeonButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, neon = true, size, variant, children, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size }), className)}
                ref={ref}
                {...props}
            >
                {/* Top glow line */}
                <span className={cn("absolute h-px opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out inset-x-0 inset-y-0 bg-gradient-to-r w-3/4 mx-auto from-transparent via-amber-500 to-transparent hidden", neon && "block")} />
                
                <span className="relative z-10 flex items-center justify-center">
                    {children}
                </span>

                {/* Bottom glow line */}
                <span className={cn("absolute group-hover:opacity-100 transition-all duration-500 ease-in-out inset-x-0 h-px -bottom-px bg-gradient-to-r w-3/4 mx-auto from-transparent via-amber-500 to-transparent hidden", neon && "block")} />
            </button>
        );
    }
)

NeonButton.displayName = 'NeonButton';

export { NeonButton, buttonVariants };
