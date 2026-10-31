import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Blocks, Check } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";
import { Textarea } from "@/src/components/ui/textarea";
import {
  EmptyState,
  ErrorNotice,
  FiguresSkeleton,
  FormField,
  PageHeader,
  PageShell,
  SectionHeader,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { Skeleton } from "@/src/components/ui/skeleton";
import { authClient } from "@/src/features/auth/auth-client";
import { PersonAvatar } from "@/src/features/apps/agent-facts";
import {
  getProfile,
  getStats,
  removeProfileImage,
  updateProfile,
  uploadProfileImage,
  type Profile,
} from "@/src/features/people/api";
import { Earnings } from "@/src/features/stats/earnings";
import { ImageField } from "@/src/features/studio/image-field";

const NAME_MAX = 60;
const BIO_MAX = 280;

const fieldErrors: Record<string, string> = {
  INVALID_DISPLAY_NAME: `Keep the name to ${NAME_MAX} characters.`,
  INVALID_BIO: `Keep the bio to ${BIO_MAX} characters.`,
};

function ProfileForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile.displayName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
  }, [profile.displayName, profile.bio]);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["account", "profile"] });
    // Names and pictures show on store cards and developer pages too.
    void queryClient.invalidateQueries({ queryKey: ["store"] });
    void queryClient.invalidateQueries({ queryKey: ["developer"] });
  };
  const save = useMutation({
    mutationFn: () => updateProfile({ displayName: name.trim() || null, bio: bio.trim() || null }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      refresh();
    },
  });
  const changed = name !== (profile.displayName ?? "") || bio !== (profile.bio ?? "");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        className="grid max-w-2xl content-start gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <ImageField
          id="profile-image"
          name={profile.name}
          label="Profile picture"
          preview={<PersonAvatar person={profile} className="size-20 text-3xl" />}
          hasImage={Boolean(profile.imageUrl)}
          upload={uploadProfileImage}
          remove={removeProfileImage}
          onDone={refresh}
        />
        <FormField
          label="Display name"
          htmlFor="profile-name"
          hint="Shown next to your agents and your ratings. Leave it empty to show your wallet address."
        >
          <Input
            id="profile-name"
            value={name}
            maxLength={NAME_MAX}
            placeholder={profile.address ?? "Your name"}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField
          label="Bio"
          htmlFor="profile-bio"
          hint={`${bio.length}/${BIO_MAX}. What you build, and what people hire your agents for.`}
        >
          <Textarea
            id="profile-bio"
            rows={3}
            value={bio}
            maxLength={BIO_MAX}
            placeholder="I build agents that turn spreadsheets into answers."
            onChange={(event) => setBio(event.target.value)}
          />
        </FormField>
        {save.isError && (
          <ErrorNotice className="my-0">
            {fieldErrors[errorMessage(save.error)] ?? errorMessage(save.error)}
          </ErrorNotice>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!changed || save.isPending}>
            {save.isPending ? <Spinner /> : saved ? <Check /> : null}
            {saved ? "Saved" : "Save profile"}
          </Button>
          {changed && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setName(profile.displayName ?? "");
                setBio(profile.bio ?? "");
              }}
            >
              Discard
            </Button>
          )}
        </div>
      </form>

      {/* What a buyer sees on the developer page, updated as you type. */}
      <aside aria-label="Preview" className="grid content-start gap-3">
        <p className="text-sm text-muted-foreground">How buyers see you</p>
        <div className="grid gap-4 border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <PersonAvatar
              person={{ ...profile, name: name.trim() || profile.name }}
              className="size-12 text-lg"
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{name.trim() || profile.name}</p>
              {profile.address && (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {profile.address}
                </p>
              )}
            </div>
          </div>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
            {bio.trim() || "No bio yet."}
          </p>
          <Link
            to="/developers/$userId"
            params={{ userId: profile.id }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Open your public page <ArrowUpRight size={14} />
          </Link>
        </div>
      </aside>
    </div>
  );
}

// The account's public face (name, picture, bio) and what its agents earn.
export function ProfilePage() {
  const { data: session } = authClient.useSession();
  const profile = useQuery({
    queryKey: ["account", "profile", session?.user.id],
    queryFn: getProfile,
  });
  const stats = useQuery({
    queryKey: ["account", session?.user.id, "stats"],
    queryFn: getStats,
    refetchInterval: 60_000,
  });

  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="Profile"
        description="Your name and picture appear on your agents in the store, on your ratings and on your developer page."
      />
      <section aria-label="Public profile" className="py-8">
        {profile.isPending ? (
          <div role="status" aria-busy="true" className="grid max-w-2xl gap-6">
            <span className="sr-only">Loading your profile</span>
            <div className="flex items-center gap-5">
              <Skeleton className="size-20" />
              <Skeleton className="h-8 w-36" />
            </div>
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
          </div>
        ) : profile.isError ? (
          <ErrorNotice onRetry={() => void profile.refetch()}>
            {errorMessage(profile.error, "Couldn't load your profile.")}
          </ErrorNotice>
        ) : (
          <ProfileForm profile={profile.data} />
        )}
      </section>

      <section aria-labelledby="earnings-title" className="border-t border-border py-8">
        <SectionHeader
          id="earnings-title"
          title="Earnings"
          aside="After the Payvoke fee, in USDC on Avalanche"
        />
        {stats.isPending ? (
          <div className="grid gap-4">
            <FiguresSkeleton />
            <Skeleton className="h-64" />
          </div>
        ) : stats.isError ? (
          <ErrorNotice onRetry={() => void stats.refetch()}>
            {errorMessage(stats.error, "Couldn't load your earnings.")}
          </ErrorNotice>
        ) : stats.data.provider ? (
          <Earnings stats={stats.data.provider} />
        ) : (
          <EmptyState
            title="No agents yet"
            action={
              <Button render={<Link to="/console/studio" />}>
                <Blocks /> Share an agent
              </Button>
            }
          >
            Share an agent in Studio and its jobs, users and earnings show up here.
          </EmptyState>
        )}
      </section>
    </PageShell>
  );
}
