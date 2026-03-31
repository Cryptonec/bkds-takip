'use client';
import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';

interface ImportResult {
  jobId: string;
  success: number;
  errors: number;
  errorDetails: Array<{ row: number; reason: string }>;
}

interface ImportJob {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  createdAt: string;
}

export default function ImportPage() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadJobs() {
    setJobsLoading(true);
    const res = await fetch('/api/lila');
    const data = await res.json();
    setJobs(data);
    setJobsLoading(false);
  }

  useState(() => { loadJobs(); });

  async function handleUpload(file: File) {
    if (!file) return;
    setUploading(true);
    setResult(null);

    const form = new FormData();
    form.append('file', file);
    form.append('type', 'lila');

    try {
      const res = await fetch('/api/lila', { method: 'POST', body: form });
      const data = await res.json();
      setResult(data);
      loadJobs();
    } catch (err: any) {
      setResult({ jobId: '', success: 0, errors: 1, errorDetails: [{ row: 0, reason: err.message }] });
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lila İçe Aktar</h1>
        <p className="text-gray-500 text-sm mt-1">Excel veya CSV formatında ders listesini yükleyin</p>
      </div>

      {/* Format info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex gap-3">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Beklenen Sütunlar</p>
          <p className="text-blue-700">
            <code className="bg-blue-100 px-1 rounded">Öğrenci Adı</code>{' '}
            <code className="bg-blue-100 px-1 rounded">Öğretmen</code>{' '}
            <code className="bg-blue-100 px-1 rounded">Tarih</code>{' '}
            <code className="bg-blue-100 px-1 rounded">Başlangıç</code>{' '}
            <code className="bg-blue-100 px-1 rounded">Bitiş</code>{' '}
            <code className="bg-blue-100 px-1 rounded">Derslik</code>
          </p>
          <p className="mt-1 text-blue-600 text-xs">
            Derslik alanında "Evde Destek Eğitim" geçiyorsa BKDS zorunlu tutulmaz.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors mb-6',
          dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-gray-600 font-medium">Yükleniyor ve işleniyor...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-10 h-10 text-gray-400" />
            <div>
              <p className="text-gray-700 font-medium">Dosyayı buraya sürükleyin</p>
              <p className="text-gray-400 text-sm mt-1">veya tıklayarak seçin (.xlsx, .xls, .csv)</p>
            </div>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className={cn(
          'border rounded-xl p-5 mb-6',
          result.errors === 0
            ? 'bg-green-50 border-green-200'
            : result.success > 0
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-red-50 border-red-200'
        )}>
          <div className="flex items-center gap-3 mb-3">
            {result.errors === 0 ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            <p className="font-semibold text-gray-900">
              {result.success} kayıt işlendi{result.errors > 0 && `, ${result.errors} satır hatalı`}
            </p>
          </div>
          {result.errorDetails.length > 0 && (
            <div className="space-y-1 mt-3">
              {result.errorDetails.slice(0, 10).map((e, i) => (
                <p key={i} className="text-xs text-red-700">
                  Satır {e.row}: {e.reason}
                </p>
              ))}
              {result.errorDetails.length > 10 && (
                <p className="text-xs text-gray-500">... ve {result.errorDetails.length - 10} hata daha</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import history */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Son Yüklemeler</h2>
        {jobsLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Yükleniyor...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">Henüz yükleme yapılmamış</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Dosya</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tarih</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">İşlenen</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-green-500" />
                        <span className="text-gray-900 font-medium">{job.fileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDateTime(job.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{job.processedRows} / {job.totalRows}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={job.status} />
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    bekliyor: { label: 'Bekliyor', cls: 'bg-gray-100 text-gray-600' },
    isleniyor: { label: 'İşleniyor', cls: 'bg-blue-100 text-blue-700' },
    tamamlandi: { label: 'Tamamlandı', cls: 'bg-green-100 text-green-700' },
    hata: { label: 'Hata', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
