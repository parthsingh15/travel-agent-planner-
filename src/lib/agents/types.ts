export type TripContext = {
  destination: string;
  origin?: string | null;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  travelers: number;
  interests: string[];
  travelStyle: string;
  notes?: string | null;
};

export type DayPlan = {
  day: number;
  date: string;
  title: string;
  activities: {
    time: string;
    title: string;
    description: string;
    location?: string;
    estimatedCost?: number;
  }[];
  meals: {
    type: string;
    restaurant: string;
    cuisine?: string;
    estimatedCost?: number;
  }[];
  transportation?: string;
  accommodation?: string;
  dailyBudget?: number;
};

export type ItineraryOutput = {
  title: string;
  summary: string;
  totalBudget: number;
  days: DayPlan[];
  tips: string[];
  warnings?: string[];
};

export type AgentResult<T = Record<string, unknown>> = {
  agent: string;
  output: T;
  raw: string;
};
