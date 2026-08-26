import { BookOpenCheck } from "lucide-react";

import { LoginForm } from "../../_components/login-form";

export default function LoginV1() {
  return (
    <div className="flex min-h-dvh bg-background">
      <div className="hidden bg-slate-950 lg:flex lg:w-2/5">
        <div className="flex h-full w-full flex-col justify-between p-12 text-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
              <BookOpenCheck className="size-6" />
            </div>
            <div>
              <p className="font-semibold text-lg">Penkal</p>
              <p className="text-slate-400 text-sm">Painel Mercado Livre</p>
            </div>
          </div>

          <div className="max-w-md space-y-4">
            <p className="font-semibold text-4xl tracking-tight">Operação em um só lugar.</p>
            <p className="text-slate-400 text-lg leading-7">
              Vendas, produtos, estoque FULL, envios, publicidade e alertas em um painel administrativo privado.
            </p>
          </div>

          <p className="text-slate-500 text-xs">Acesso administrativo restrito.</p>
        </div>
      </div>

      <div className="flex w-full items-center justify-center p-6 lg:w-3/5 lg:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <p className="font-semibold text-3xl tracking-tight">Entrar</p>
            <p className="text-muted-foreground text-sm">
              Use a conta administrativa autorizada para acessar o painel.
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
