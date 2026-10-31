import { action } from "@solidjs/router";

import { contact, joinWaitlist } from "~/server/leads";

export const joinWaitlistAction = action(joinWaitlist, "joinWaitlist");
export const contactAction = action(contact, "contact");
