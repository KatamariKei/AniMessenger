export function localDayPart(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return "overnight";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "late evening";
}

function dayPartGuidance(dayPart) {
  if (dayPart === "morning") {
    return "Morning and daytime routines are natural. Do not casually say you are heading to bed, winding down for the night, or tell the user good night unless the recent conversation clearly establishes an all-nighter, illness, night shift, or unusual schedule.";
  }
  if (dayPart === "afternoon") {
    return "Daytime routines are natural. Do not act as if the day is just beginning or ending, and do not casually propose sleep or say good night unless the recent conversation establishes an unusual schedule.";
  }
  if (dayPart === "evening") {
    return "Dinner, after-work or after-school, and evening activities are natural. Do not talk as if it is breakfast time or the start of an ordinary school or work day.";
  }
  if (dayPart === "late evening") {
    return "Late-evening activities or winding down are natural, but do not assume the user is sleepy or pressure them to go to bed.";
  }
  return "It is overnight. Quiet or late-night activities are natural, but do not assume the user is awake by choice or pressure them to stay up or go to sleep.";
}

export function userLocalTimeContext(now = new Date()) {
  const dayPart = localDayPart(now);
  const display = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return {
    dayPart,
    display,
    prompt: [
      "USER LOCAL TIME: " + display + " (" + dayPart + "). Treat this clock and day part as authoritative.",
      "Assume the character shares the user's local time unless the recent conversation explicitly establishes another timezone or schedule.",
      "Keep greetings, meals, school/work, sleep, lighting, and suggested activities consistent with this time. " + dayPartGuidance(dayPart),
    ].join(" "),
  };
}
