import { connection } from 'next/server';
import ClientApp from './ClientApp';

export default async function Page() {
  // Render per request so each page load gets its own CSP nonce (see proxy.ts).
  await connection();
  return <ClientApp />;
}
