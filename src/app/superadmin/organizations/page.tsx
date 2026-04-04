'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, CheckCircle, XCircle, Users, BookOpen } from 'lucide-react';

interface Org {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  plan: string;
  createdAt: string;
  _count: { users: number; students: number };
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    slug: '',
    name: '',
    adminEmail: '',
    adminPassword: '',
    plan: 'basic',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/superadmin/organizations');
      setOrgs(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const r = await fetch('/api/superadmin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json();
        setError(d.error ?? 'Hata oluştu');
      } else {
        setSuccess('Kurum oluşturuldu.');
        setShowForm(false);
        setForm({ slug: '', name: '', adminEmail: '', adminPassword: '', plan: 'basic' });
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(org: Org) {
    await fetch(`/api/superadmin/organizations/${org.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !org.active }),
    });
    await load();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Organizasyonlar</h1>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" /> Yenile
          </button>
          <button
            onClick={() => { setShowForm(true); setError(''); setSuccess(''); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Yeni Kurum
          </button>
        </div>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-white border rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Yeni Organizasyon Oluştur</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug <span className="text-gray-400">(Rehapp kurum ID'si, örn: 42)</span>
              </label>
              <input
                required
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.trim() })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="42"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kurum Adı</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Örnek Rehabilitasyon Merkezi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin E-posta</label>
              <input
                required
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="admin@kurum.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Şifresi</label>
              <input
                required
                type="password"
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="En az 8 karakter"
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
              <select
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
              </select>
            </div>

            {error && (
              <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Slug</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Kurum Adı</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Plan</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Kullanıcılar</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Öğrenciler</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Durum</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{org.slug}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{org.plan}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <Users className="w-3.5 h-3.5" />{org._count.users}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <BookOpen className="w-3.5 h-3.5" />{org._count.students}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {org.active ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-500">
                        <XCircle className="w-4 h-4" /> Pasif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(org)}
                      className={`text-xs px-2.5 py-1 rounded-md border ${
                        org.active
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-green-200 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {org.active ? 'Devre Dışı' : 'Aktifleştir'}
                    </button>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Henüz organizasyon yok. "Yeni Kurum" ile ekleyin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">SSO Entegrasyonu Hakkında</p>
        <p>
          Rehapp&apos;taki her kurumun <strong>kurum ID&apos;si</strong> bu tablodaki{' '}
          <code className="bg-amber-100 px-1 rounded">slug</code> ile eşleşmelidir.
          Örneğin rehapp&apos;ta kurum ID&apos;si 42 ise slug &quot;42&quot; olmalıdır.
        </p>
        <p className="mt-1">
          Rehapp yönetim sayfasında bu kurumun BKDS kimlik bilgilerine admin e-posta ve şifresini girin.
          SSO akışı otomatik gerçekleşir.
        </p>
      </div>
    </div>
  );
}
