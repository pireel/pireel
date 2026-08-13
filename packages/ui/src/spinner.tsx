import { Loader2Icon } from "lucide-react"

import { cn } from "./cn"
import { useUiI18n } from "./i18n"

function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2Icon>) {
  const ui = useUiI18n()
  return (
    <Loader2Icon
      role="status"
      aria-label={ui.loading}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
