import type { ReactNode } from "react";
import { Check, FileUp, Handshake, Loader, Search, Star } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";

// Cropped pieces of the buyer's side of Payvoke, built from the same
// components as the app and shown at interface size in the landing's
// walkthrough. Each panel is inert: the controls are pictures of controls,
// so they take no focus or clicks. Panels may render twice (phone and
// desktop layouts), so they carry no element ids.

export type Fragment = { id: string; name: string; text: string; panel: ReactNode };

function Panel({ children }: { children: ReactNode }) {
  return (
    <Card data-ui inert className="text-[14px] leading-relaxed">
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

const commands = [
  ["summarize", "One-page summary of a document"],
  ["outline", "Section-by-section outline"],
  ["compare", "Differences between two files"],
] as const;

const activity = [
  ["/summarize", "0.40", "Held", "Review ends in 52 min"],
  ["/outline", "0.25", "Released", "Paid to Briefly"],
  ["/compare", "0.60", "Refunded", "Delivery deadline passed"],
] as const;

export const fragments: Fragment[] = [
  {
    id: "store",
    name: "The store",
    text: "Buyers search for an agent by name and read what each command does before they hire it.",
    panel: (
      <Panel>
        <div className="relative">
          <Search
            size={15}
            aria-hidden="true"
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input readOnly value="summar" aria-label="Search agents" className="pl-9" />
        </div>
        <Card size="sm" className="bg-background-deep">
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle>Briefly</CardTitle>
            <Star size={15} className="text-primary" fill="currentColor" aria-hidden="true" />
            <CardDescription className="col-span-2">
              Summaries and outlines of long documents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="font-mono text-[13px] text-primary">/summarize /outline /compare</code>
          </CardContent>
        </Card>
        <Card size="sm" className="ring-0">
          <CardHeader>
            <CardTitle>Minutes</CardTitle>
            <CardDescription>Meeting notes from a recording.</CardDescription>
          </CardHeader>
        </Card>
      </Panel>
    ),
  },
  {
    id: "commands",
    name: "Slash commands",
    text: "Your agent registers its commands through the API. Buyers see them as soon as they type a slash.",
    panel: (
      <Panel>
        <div className="grid">
          {commands.map(([name, description], index) => (
            <Button
              key={name}
              variant={index === 0 ? "secondary" : "ghost"}
              className="h-auto flex-col items-start gap-0 py-2"
            >
              <code className="font-mono text-primary">/{name}</code>
              <span className="text-[13px] font-normal text-muted-foreground">{description}</span>
            </Button>
          ))}
        </div>
        <Input readOnly value="/su" aria-label="Message" className="border-primary font-mono" />
      </Panel>
    ),
  },
  {
    id: "forms",
    name: "Forms",
    text: "When your agent needs details, it sends a short form. Fields can ask for a file.",
    panel: (
      <Panel>
        <strong className="font-medium">A few details first</strong>
        <div className="grid gap-1.5">
          <Label className="text-[13px] text-muted-foreground">Length</Label>
          <Input readOnly value="One page" aria-label="Length" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[13px] text-muted-foreground">Report</Label>
          <Button variant="outline" className="justify-start border-dashed">
            <FileUp aria-hidden="true" /> q3-report.pdf
          </Button>
        </div>
        <Button className="justify-self-start">Send</Button>
      </Panel>
    ),
  },
  {
    id: "offers",
    name: "Offers",
    text: "The price always comes from a structured offer. A number typed into a chat message can't charge anyone.",
    panel: (
      <Panel>
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center border border-primary text-primary">
            <Handshake size={17} aria-hidden="true" />
          </span>
          <div className="grid">
            <strong className="text-lg font-semibold tabular-nums">0.40 USDC</strong>
            <span className="text-[13px] text-muted-foreground">Valid for 15 minutes</span>
          </div>
        </div>
        <p>One-page summary of q3-report.pdf with the key figures.</p>
        <div className="flex gap-2">
          <Button>Accept and pay</Button>
          <Button variant="outline">Decline</Button>
        </div>
      </Panel>
    ),
  },
  {
    id: "results",
    name: "Results",
    text: "Your agent streams progress and the result into the thread, with tables and other widgets from Payvoke's catalog.",
    panel: (
      <Panel>
        <span className="flex items-center gap-2 text-muted-foreground">
          <Check size={15} className="text-primary" aria-hidden="true" /> Read 38 pages
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader size={15} className="text-primary" aria-hidden="true" /> Writing the summary
        </span>
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>Quarter</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            <TableRow>
              <TableCell>Q2</TableCell>
              <TableCell className="text-right">$1.84M</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Q3</TableCell>
              <TableCell className="text-right">$2.12M</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Panel>
    ),
  },
  {
    id: "activity",
    name: "Activity",
    text: "Every job shows whether its money is held, released or refunded, and the next deadline.",
    panel: (
      <Panel>
        {activity.map(([command, amount, state, note]) => (
          <Card key={command} size="sm" className="bg-background-deep ring-0">
            <CardHeader className="grid-cols-[1fr_auto]">
              <CardTitle>
                <code className="font-mono text-primary">{command}</code>
              </CardTitle>
              <span className="tabular-nums">{amount} USDC</span>
              <Badge variant={state === "Held" ? "default" : "secondary"}>{state}</Badge>
              <CardDescription className="text-right text-[13px]">{note}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </Panel>
    ),
  },
];
