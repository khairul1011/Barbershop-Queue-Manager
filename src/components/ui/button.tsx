import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-amber-500 hover:bg-amber-600 text-black shadow-lg shadow-amber-500/10",
        destructive:
          "bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400",
        outline:
          "border border-[#222222] bg-transparent hover:bg-[#151515] text-gray-300 hover:text-white",
        secondary:
          "bg-[#121212] hover:bg-[#1A1A1A] border border-[#222222] text-gray-300 hover:text-white",
        ghost: "hover:bg-[#151515] text-gray-400 hover:text-white",
        link: "text-amber-500 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2.5",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-8",
        icon: "min-h-[44px] min-w-[44px] w-auto rounded-xl", // Per UI/UX Pro Max rules
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
