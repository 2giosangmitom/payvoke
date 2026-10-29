import { cn } from "@/src/lib/utils";

// Coding agents that speak MCP, shown on the landing as the buyers the bridge
// connects and in the console's setup tabs. Marks live in
// public/images/agents (from the Omarchy site).

/** `mono` marks are drawn in the text colour; the rest keep their own colours. */
export type CodingAgent = { id: string; name: string; src: string; mono?: boolean };

const agent = (id: string, name: string, file: string, mono?: boolean): CodingAgent => ({
  id,
  name,
  src: `/images/agents/${file}`,
  mono,
});

export const codingAgents: CodingAgent[] = [
  agent("claude-code", "Claude Code", "claude.svg"),
  agent("codex", "Codex", "codex.svg"),
  agent("copilot", "GitHub Copilot", "github-copilot.svg", true),
  agent("opencode", "OpenCode", "opencode.svg", true),
  agent("antigravity", "Antigravity", "antigravity.svg"),
  agent("crush", "Crush", "crush.webp"),
  agent("hermes", "Hermes Agent", "hermes.svg", true),
  agent("grok", "Grok", "grok.svg", true),
  agent("openclaw", "OpenClaw", "openclaw.svg"),
  agent("pi", "Pi", "pi.svg", true),
];

export const agentById = (id: string) => codingAgents.find((entry) => entry.id === id)!;

// A mono mark is the image used as a mask over the current colour, so it
// follows the theme like an icon font would.
export function AgentMark({ agent, className }: { agent: CodingAgent; className?: string }) {
  if (agent.mono) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block shrink-0 bg-current", className)}
        style={{ mask: `url(${agent.src}) center / contain no-repeat` }}
      />
    );
  }
  return (
    <img
      src={agent.src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
