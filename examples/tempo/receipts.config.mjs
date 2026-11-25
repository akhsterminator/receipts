// Demo configuration for Tempo, a fictional fitness-class subscription app.
// All feedback in ./feedback is invented for this demo.
export default {
  project: "Tempo",
  // Fixed "today" so the demo output is reproducible.
  asOf: "2026-11-20",
  interviewers: ["Alex"],
  privacy: { allow: ["Tempo", "Garmin", "Strava", "Apple", "Watch", "Android", "Pixel", "Galaxy", "Netflix", "Google"] },
  segments: {
    weights: { Team: 1.5, Annual: 1.2, Family: 1.2, Monthly: 1, Trial: 0.7 },
    default: 1,
  },
};
