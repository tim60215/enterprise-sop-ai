export type RepeatEventForScore = {
  review_status: string | null;
  excluded_from_score: boolean;
  days_since_previous: number | null;
  reviewed_at?: string | null;
  created_at?: string | null;
};

export type KnowledgeScoreResult = {
  score: number;
  totalPenalty: number;
  confirmedGapCount: number;

  breakdown: {
    daysSincePrevious: number;
    penalty: number;
    eventDate: string | null;
  }[];
};

type ScoreOptions = {
  daysWindow?: number | null;
};

export function calculateKnowledgeScore(
  events: RepeatEventForScore[],
  options: ScoreOptions = {
    daysWindow: 90,
  }
): KnowledgeScoreResult {
  const daysWindow =
    options.daysWindow === undefined
      ? 90
      : options.daysWindow;

  const now = new Date();

  const confirmedEvents =
    events.filter((event) => {
      if (
        event.review_status !==
          "confirmed_gap" ||
        event.excluded_from_score === true
      ) {
        return false;
      }

      if (daysWindow === null) {
        return true;
      }

      const eventDateValue =
        event.reviewed_at ||
        event.created_at;

      if (!eventDateValue) {
        return false;
      }

      const eventDate =
        new Date(eventDateValue);

      const diffDays =
        (now.getTime() -
          eventDate.getTime()) /
        (1000 * 60 * 60 * 24);

      return (
        diffDays >= 0 &&
        diffDays <= daysWindow
      );
    });

  let score = 100;
  let totalPenalty = 0;

  const breakdown: {
    daysSincePrevious: number;
    penalty: number;
    eventDate: string | null;
  }[] = [];

  for (const event of confirmedEvents) {
    const days =
      event.days_since_previous ?? 0;

    let penalty = 0;

    if (days <= 7) {
      penalty = 8;
    } else if (days <= 30) {
      penalty = 5;
    } else {
      penalty = 3;
    }

    score -= penalty;
    totalPenalty += penalty;

    breakdown.push({
      daysSincePrevious: days,
      penalty,
      eventDate:
        event.reviewed_at ||
        event.created_at ||
        null,
    });
  }

  return {
    score: Math.max(0, score),
    totalPenalty,
    confirmedGapCount:
      confirmedEvents.length,
    breakdown,
  };
}