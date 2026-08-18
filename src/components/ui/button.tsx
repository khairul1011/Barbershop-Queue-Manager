import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20",
        outline:
          "border border-border bg-transparent hover:bg-accent text-muted-foreground hover:text-foreground",
        secondary:
          "bg-secondary hover:bg-secondary/80 border border-border text-secondary-foreground",
        ghost: "hover:bg-accent text-muted-foreground hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2.5",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8",
        icon: "min-h-[44px] min-w-[44px] w-auto rounded-lg", // Per UI/UX Pro Max rules
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Adds an animated top/bottom glow line on hover (ported from the standalone NeonButton). */
  neon?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, neon = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    if (neon && !asChild) {
      return (
        <button
          className={cn(buttonVariants({ variant, size }), "relative group overflow-hidden", className)}
          ref={ref}
          {...props}
        >
          <span className="absolute inset-x-0 top-0 h-px w-3/4 mx-auto opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-transparent via-ring to-transparent" />
          <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
          <span className="absolute inset-x-0 bottom-0 h-px w-3/4 mx-auto opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-transparent via-ring to-transparent" />
        </button>
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
