import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    style={{ width: 52, height: 28, backgroundColor: undefined }}
    data-vexly-switch=""
    {...props}
    ref={ref}>
    <SwitchPrimitives.Thumb
      className="pointer-events-none block rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out"
      style={{ width: 22, height: 22 }}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
