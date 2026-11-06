import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

/**
 * Official Shopify auth bootstrap from the React Router template.
 * In ARTSync_MODE=mock the admin dashboard bypasses authenticate.admin;
 * placeholders keep the package initializable without CLI credentials.
 */
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "artsync-mock-api-key",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "artsync-mock-api-secret",
  apiVersion: ApiVersion.October26,
  scopes: (process.env.SCOPES || "read_products,write_products,read_inventory,write_inventory,read_locations").split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "http://localhost:3000",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
