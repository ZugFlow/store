import { seedDemoData } from "../app/services/demo/seed";
import { getDemoShop } from "../app/lib/config";

async function main() {
  const result = await seedDemoData(getDemoShop());
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
