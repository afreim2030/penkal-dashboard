import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Penkal Dashboard",
  version: packageJson.version,
  copyright: `© ${currentYear}, Editora Penkal.`,
  meta: {
    title: "Penkal Dashboard | Mercado Livre",
    description: "Painel administrativo privado para acompanhar a operação da Editora Penkal no Mercado Livre.",
  },
};
