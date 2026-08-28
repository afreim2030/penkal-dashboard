import {
  Bell,
  Import,
  LayoutDashboard,
  Link2,
  ListTodo,
  type LucideIcon,
  Megaphone,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Warehouse,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Mercado Livre",
    items: [
      {
        id: "dashboard",
        title: "Dashboard",
        url: "/dashboard/default",
        icon: LayoutDashboard,
      },
      {
        id: "sales",
        title: "Vendas",
        url: "/dashboard/vendas",
        icon: ShoppingCart,
      },
      {
        id: "products",
        title: "Produtos",
        url: "/dashboard/produtos",
        icon: Package,
      },
      {
        id: "full-inventory",
        title: "Estoque FULL",
        url: "/dashboard/estoque-full",
        icon: Warehouse,
      },
      {
        id: "full-inbounds",
        title: "Envios FULL",
        url: "/dashboard/envios-full",
        icon: Truck,
      },
      {
        id: "ads",
        title: "Publicidade",
        url: "/dashboard/publicidade",
        icon: Megaphone,
      },
      {
        id: "alerts",
        title: "Alertas",
        url: "/dashboard/alertas",
        icon: Bell,
      },
      {
        id: "ai",
        title: "IA",
        url: "/dashboard/ia",
        icon: Sparkles,
      },
    ],
  },
  {
    id: 2,
    label: "Operação",
    items: [
      {
        id: "tasks",
        title: "Tarefas",
        url: "/dashboard/tarefas",
        icon: ListTodo,
      },
      {
        id: "identifier-links",
        title: "Vínculos pendentes",
        url: "/dashboard/vinculos",
        icon: Link2,
      },
      {
        id: "import-data",
        title: "Importar Dados",
        url: "/importar-dados",
        icon: Import,
      },
      {
        id: "settings",
        title: "Configurações",
        url: "/dashboard/configuracoes",
        icon: Settings,
      },
    ],
  },
];
