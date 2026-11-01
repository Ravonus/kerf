import { action } from "@solidjs/router";

import { joinWaitlist } from "~/server/waitlist";

export const joinWaitlistAction = action(joinWaitlist, "joinWaitlist");
