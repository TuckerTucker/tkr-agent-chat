import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "../../lib/utils"
import { ConnectionStatus } from "./connection-status"

export type ConnectionStatusType = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';
export type AgentActivityStatusType = 'idle' | 'thinking' | 'responding' | 'error';

interface AgentTooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  agentColor?: string
  className?: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  status?: {
    connection: ConnectionStatusType;
    activity: AgentActivityStatusType;
  }
  agentName?: string
}

const AgentTooltip = React.forwardRef<HTMLDivElement, AgentTooltipProps>(
  ({ children, content, agentColor, className, side = "top", align = "center", status, agentName }, ref) => {
    return (
      <TooltipPrimitive.Root delayDuration={100} disableHoverableContent>
        <TooltipPrimitive.Trigger asChild>
          <div ref={ref} className="relative">
            {children}
            {status && (
              <div className="absolute bottom-0 right-0 transform translate-x-1/4 translate-y-1/4">
                <ConnectionStatus
                  status={status}
                  agentName={agentName}
                  size="sm"
                  position="floating"
                />
              </div>
            )}
          </div>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={4}
            className={cn(
              "z-[100] overflow-hidden rounded-md border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-md",
              "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
              "min-w-[300px] max-w-[400px] border-l-2",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              className
            )}
            style={{ borderLeftColor: agentColor }}
          >
            <div>
              {/* Show agent status at the top of the tooltip if available */}
              {status && (
                <div className="flex items-center mb-2 text-xs text-gray-400">
                  <ConnectionStatus
                    status={status}
                    agentName={agentName}
                    showLabel={true}
                    size="sm"
                  />
                  <span className="ml-1">
                    {status.activity === 'idle' ? 'Ready' : 
                     status.activity === 'thinking' ? 'Thinking' : 
                     status.activity === 'responding' ? 'Responding' : 
                     status.activity === 'error' ? 'Error' : ''}
                  </span>
                </div>
              )}
              {content}
            </div>
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    );
  }
)

AgentTooltip.displayName = "AgentTooltip"

export { AgentTooltip }
