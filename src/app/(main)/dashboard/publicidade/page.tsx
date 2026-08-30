import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdsDashboard } from "./_components/ads-dashboard";
import { CampaignHistory } from "./_components/campaign-history";
import { loadAdsDashboard } from "./_lib/load-ads-dashboard";
import { loadCampaignHistory } from "./_lib/load-campaign-history";

export default async function Page() {
  try {
    const [data, history] = await Promise.all([loadAdsDashboard(), loadCampaignHistory()]);
    if (!data) return <Alert><AlertCircle /><AlertTitle>Dados insuficientes</AlertTitle><AlertDescription>Importe os dados de publicidade do Mercado Livre para montar este painel.</AlertDescription></Alert>;
    return <div className="flex flex-col gap-5"><AdsDashboard data={data} /><CampaignHistory data={history} /></div>;
  } catch (error) {
    return <Alert variant="destructive"><AlertCircle /><AlertTitle>Não foi possível carregar Publicidade</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro ao consultar os dados de publicidade."}</AlertDescription></Alert>;
  }
}
