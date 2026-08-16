import {
  Bell,
  Import,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Warehouse,
  type LucideIcon,
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
        badge: "soon",
        disabled: true,
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
        badge: "soon",
        disabled: true,
      },
      {
        id: "ads",
        title: "Publicidade",
        url: "/dashboard/publicidade",
        icon: Megaphone,
        badge: "soon",
        disabled: true,
      },
      {
        id: "alerts",
        title: "Alertas",
        url: "/dashboard/alertas",
        icon: Bell,
        badge: "soon",
        disabled: true,
      },
      {
        id: "ai",
        title: "IA",
        url: "/dashboard/ia",
        icon: Sparkles,
        badge: "soon",
        disabled: true,
      },
    ],
  },
  {
    id: 2,
    label: "Operação",
    items: [
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
        badge: "soon",
        disabled: true,
      },
    ],
  },
];
