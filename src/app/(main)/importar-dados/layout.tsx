import type { ReactNode } from "react";

import DashboardLayout from "@/app/(main)/dashboard/layout";

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
