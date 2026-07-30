import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
const badgeVariants = cva("test", { variants: { variant: { default: "test" } } })
export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>
const b: BadgeProps = { className: "" };
