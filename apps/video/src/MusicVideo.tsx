import type { ReactNode } from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { linesOf, section } from "./data/timeline";
import { T } from "./lib/theme";
import { BedroomScene } from "./story/Bedroom";
import { Classroom } from "./story/Classroom";
import { DanceParty } from "./story/DanceParty";
import { BusyOffice, GrandmaKitchen, HeroDesk, PlazaBillboard } from "./story/Desks";
import { RobotErrand, Windows } from "./story/Errands";
import { Bedtime, Rooftops, VaultBridge } from "./story/Finale";
import { IntroScene } from "./story/Intro";
import { Explainers, explainers } from "./story/Explainers";
import { Lyrics } from "./story/Lyrics";
import { RiverChorus } from "./story/RiverChorus";
import { StreetChorus } from "./story/StreetChorus";

// "A Little Idea" — the Payvoke music video, told as a little 3D story:
// a man stuck with an idea, the tool he builds, the town it travels
// through, and the marketplace where ideas get passed on. The real
// Payvoke UI appears whenever we look into his laptop.
// All times are song seconds from src/data/lyrics.json.

/** A scene placed in song seconds. */
const At = ({
  name,
  from,
  to,
  children,
}: {
  name: string;
  from: number;
  to: number;
  children: ReactNode;
}) => {
  const { fps } = useVideoConfig();
  const start = Math.round(from * fps);
  return (
    <Sequence name={name} from={start} durationInFrames={Math.max(1, Math.round(to * fps) - start)}>
      {children}
    </Sequence>
  );
};

const starts = (id: Parameters<typeof linesOf>[0]) =>
  linesOf(id).map((l) => l.start) as [number, number, number, number];

export const MusicVideo = () => {
  const v1 = linesOf("verse1");
  const p1 = linesOf("pre1");
  const v2 = linesOf("verse2");
  const p2 = linesOf("pre2");
  const br = linesOf("bridge");
  const chorus1 = section("chorus1");
  const drop1 = section("drop1");
  const chorus2 = section("chorus2");
  const bridge = section("bridge");
  const drop2 = section("drop2");
  const final = section("final");
  const finale = section("finale");
  const outro = section("outro");

  const roomFrom = v1[1].start - 0.3;
  const grandmaFrom = v2[1].start - 0.3;
  const officeFrom = v2[3].start - 0.2;
  const errandFrom = v2[4].start - 0.2;
  const walletFrom = p2[0].start - 0.2;
  const tradeFrom = p2[1].start - 0.2;
  const storeFrom = linesOf("chorus2").at(-1)!.end + 1;
  const vaultFrom = br[1].start - 0.3;

  // How the product works, one card per story moment.
  const cards = explainers({
    publish: drop1.end + 0.3,
    chat: grandmaFrom + 0.4,
    accept: officeFrom + 0.2,
    errand: errandFrom + 0.3,
    limit: v2[7].start,
    earn: walletFrom + 0.3,
    vault: vaultFrom + 0.3,
    avalanche: br[3].start,
  });

  return (
    <AbsoluteFill style={{ background: T.bgDeep }}>
      <Audio src={staticFile("audio/a-litte-idea.opus")} />

      <At name="Intro · skyline to his window" from={0} to={roomFrom}>
        <IntroScene stuckAt={v1[0].start} />
      </At>
      <At name="Verse 1 · his room upstairs" from={roomFrom} to={chorus1.start}>
        <BedroomScene
          at={roomFrom}
          m={{
            late: v1[1].start,
            hundred: v1[2].start,
            slow: v1[3].start,
            tool: v1[4].start,
            broke: v1[5].start,
            smile: v1[6].start,
            help: v1[7].start,
            keep: p1[0].start,
            share: p1[1].start,
            end: chorus1.start,
          }}
        />
      </At>
      <At name="Chorus 1 · passed hand to hand on his street" from={chorus1.start} to={chorus1.end}>
        <StreetChorus at={chorus1.start} c={starts("chorus1")} end={chorus1.end} variant={1} />
      </At>
      <At name="Drop 1 · dance crew on the plaza" from={drop1.start} to={drop1.end}>
        <DanceParty at={drop1.start} venue="plaza" />
      </At>

      <At name="Verse 2 · he publishes Jingle Bot (his laptop)" from={drop1.end} to={grandmaFrom}>
        <HeroDesk ui="studio" screenFor={grandmaFrom - drop1.end - 0.9} />
      </At>
      <At
        name="Verse 2 · Grandma asks for a jingle (her laptop)"
        from={grandmaFrom}
        to={officeFrom}
      >
        <GrandmaKitchen
          quoteAt={v2[2].start - grandmaFrom}
          wideFor={2.0}
          screenFor={officeFrom - grandmaFrom - 2.7}
        />
      </At>
      <At name="Verse 2 · yes without thinking (office monitor)" from={officeFrom} to={errandFrom}>
        <BusyOffice screenFor={1.3} />
      </At>
      <At name="Verse 2 · the assistant's errand" from={errandFrom} to={walletFrom}>
        <RobotErrand
          m={{
            start: errandFrom,
            found: v2[5].start,
            asked: v2[6].start,
            paid: v2[7].start,
            end: walletFrom,
          }}
        />
      </At>
      <At name="Pre-chorus 2 · a class at ĐH Khoa học" from={walletFrom} to={chorus2.start}>
        <Classroom beat={0.58} lectureFor={tradeFrom - walletFrom} />
      </At>
      <At name="Chorus 2 · by the river, on a motorbike" from={chorus2.start} to={storeFrom}>
        <RiverChorus at={chorus2.start} c={starts("chorus2")} end={storeFrom} />
      </At>
      <At name="Chorus 2 · the store on the plaza billboard" from={storeFrom} to={bridge.start}>
        <PlazaBillboard />
      </At>

      <At name="Bridge · something you need" from={bridge.start} to={vaultFrom}>
        <Windows mode="need" at={bridge.start} beat={1} />
      </At>
      <At name="Bridge · kept safe, Payvoke, Avalanche" from={vaultFrom} to={bridge.end}>
        <VaultBridge
          at={vaultFrom}
          m={{ kept: br[1].start, payvoke: br[2].start, powered: br[3].start, end: bridge.end }}
        />
      </At>
      <At name="Drop 2 · street dance party" from={drop2.start} to={drop2.end}>
        <DanceParty at={drop2.start} venue="street" />
      </At>
      <At name="Final chorus + finale · rooftops" from={final.start} to={finale.end}>
        <Rooftops at={final.start} f={starts("final")} finale={finale.start} end={finale.end} />
      </At>
      <At name="Outro · finally in bed" from={outro.start} to={outro.end}>
        <Bedtime />
      </At>
      <Explainers items={cards} />
      <Lyrics />
    </AbsoluteFill>
  );
};
