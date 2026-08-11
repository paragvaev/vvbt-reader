import { handleApiRequest } from "../../worker/index.js";

export function onRequest(context) {
  return handleApiRequest(context.request, context.env, context);
}
