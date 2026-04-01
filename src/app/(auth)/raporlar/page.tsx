'use client';
import { useState, useEffect } from 'react';
import { formatTime, formatDate } from '@/lib/utils';
import { Download, Search } from 'lucide-react';

interface AttRow {
  id: string;
  status: string;
  statusLabel: string;
  statusBg: string;
  statusColor: string;
  ogrenciAdi: string;
  ogretmenAdi: string;
  derslik: string;
  baslangic: string;
  bitis: string;
  gercekGiris?: string;
  gercekCikis?: string;
  bkdsRequired: boolean;
}

export default function RaporlarPage() {
  const [tarih, setTarih] = useState(() => new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('hepsi');
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/attendance?tarih=${tarih}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setRows(data.ogrenciRows ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tarih]);

  const filtered = statusFilter === 'hepsi' ? rows : rows.filter((r) => r.status === statusFilter);

  const statuses = [...new Set(rows.map((r) => r.status))];

  function exportCSV() {
    const header = 'Öğrenci,Öğretmen,Derslik,Başlangıç,Bitiş,BKDS Giriş,BKDS Çıkış,Durum\n';
    const body = filtered.map((r) =>
      [
        r.ogrenciAdi, r.ogretmenAdi, r.derslik,
        formatTime(r.baslangic), formatTime(r.bitis),
        r.gercekGiris ? formatTime(r.gercekGiris) : '-',
        r.gercekCikis ? formatTime(r.gercekCikis) : '-',
        r.statusLabel,
      ].join(',')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yoklama-${tarih}.csv`;
    a.click();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Raporlar</h1>
          <p className="text-gray-500 text-sm mt-1">Günlük devamsızlık raporu</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" /> CSV İndir
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Tarih:</label>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Durum:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="hepsi">Hepsi</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-gray-500 ml-auto">
          <Search className="w-4 h-4" />
          {filtered.length} kayıt
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {tarih} tarihi için kayıt bulunamadı
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Öğrenci</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Öğretmen</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Derslik</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Saat</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">BKDS Giriş</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">BKDS Çıkış</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.ogrenciAdi}</td>
                    <td className="px-4 py-3 text-gray-600">{row.ogretmenAdi}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">{row.derslik}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                      {formatTime(row.baslangic)}–{formatTime(row.bitis)}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {row.gercekGiris ? (
                        <span className="text-green-600 font-medium">{formatTime(row.gercekGiris)}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {row.gercekCikis ? (
                        <span className="text-green-600 font-medium">{formatTime(row.gercekCikis)}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${row.statusBg} ${row.statusColor}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
