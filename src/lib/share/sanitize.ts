import type { DemoState, Person } from "@/lib/types";

/** Strip cost/bill rates and emails from a public share payload. */
export function sanitizePublicWorkspace(state: DemoState): DemoState {
  return {
    ...state,
    profiles: [],
    sessionProfileId: null,
    people: state.people.map(
      (p): Person => ({
        ...p,
        email: "",
        cost_rate: 0,
        bill_rate: 0,
        profile_id: null,
      }),
    ),
  };
}
