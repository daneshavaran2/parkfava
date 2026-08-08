import { askAssistant } from "./assistant.functions";

export async function fetchAssistantAnswer(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
) {
  return await askAssistant({ data: { question, history } });
}
