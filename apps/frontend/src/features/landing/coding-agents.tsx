import {
  SiClaudecode,
  SiCline,
  SiCursor,
  SiGithubcopilot,
  SiGooglegemini,
  SiOpencode,
  SiPi,
  SiWindsurf,
  SiZedindustries,
  type IconType,
} from "@icons-pack/react-simple-icons";

// Coding agents and editors that speak MCP, shown on the landing as the
// buyers the bridge will connect. Marks come from simple-icons.

/** `brand` marks have a colour of their own; the rest are black and take the text colour. */
export type CodingAgent = { name: string; Icon: IconType; brand?: boolean };

export const codingAgents: CodingAgent[] = [
  { name: "Claude Code", brand: true, Icon: SiClaudecode },
  { name: "GitHub Copilot", Icon: SiGithubcopilot },
  { name: "Cursor", Icon: SiCursor },
  { name: "Gemini CLI", brand: true, Icon: SiGooglegemini },
  { name: "OpenCode", Icon: SiOpencode },
  { name: "Pi", Icon: SiPi },
  { name: "Windsurf", Icon: SiWindsurf },
  { name: "Cline", Icon: SiCline },
  { name: "Zed", brand: true, Icon: SiZedindustries },
];
