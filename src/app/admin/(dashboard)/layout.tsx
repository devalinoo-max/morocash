import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/server/guards/admin';
import { Sidebar } from './_components/Sidebar';

// Garde serveur : requireAdminSession() lit le cookie morocash_admin_session
// (JWT, distinct de la session tenant) et lève AUTH_SESSION_EXPIRED si absent/
// invalide/compte désactivé — on redirige alors vers /admin/login, qui ne
// vit volontairement pas sous ce layout (route group) pour ne pas être gardé.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let admin;
  try {
    admin = await requireAdminSession();
  } catch {
    redirect('/admin/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar adminNom={admin.nom} adminEmail={admin.email} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
