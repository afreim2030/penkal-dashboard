import { AiDashboard } from "./_components/ai-dashboard";

export default function Page() {
  return <AiDashboard enabled={Boolean(process.env.OPENAI_API_KEY)} />;
}
