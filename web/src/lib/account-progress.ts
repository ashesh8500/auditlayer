export interface ProgressionPoint {
  score: number | null;
  followers: number | null;
  engagement: number | null;
  recorded_at: string;
}

export interface ProgressionSummary {
  latestScore: number | null;
  scoreDelta: number | null;
  followers: number | null;
  followersDelta: number | null;
  engagement: number | null;
  observedAt: string | null;
}

export function summarizeProgression(
  points: ProgressionPoint[],
): ProgressionSummary {
  const ordered = [...points].sort(
    (a, b) =>
      new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  );
  const latest = ordered[0];
  const previous = ordered[1];

  return {
    latestScore: latest?.score ?? null,
    scoreDelta:
      latest?.score != null && previous?.score != null
        ? latest.score - previous.score
        : null,
    followers: latest?.followers ?? null,
    followersDelta:
      latest?.followers != null && previous?.followers != null
        ? latest.followers - previous.followers
        : null,
    engagement: latest?.engagement ?? null,
    observedAt: latest?.recorded_at ?? null,
  };
}
