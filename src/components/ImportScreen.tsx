import React, { useState, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { fetchFromGoogleSheet } from '../services/importService';
import { DEFAULT_QUESTION_BANK } from '../constants';
import Button from './Button';
import Instructions from './Instructions';
import { ArrowLeft, Upload, Link, Library, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';

const ImportScreen: React.FC = () => {
  const {
    importGame,
    goBackToConfig,
    loadQuestionBank,
    totalRounds,
    questionsPerRound,
    error,
  } = useGame();
  const [loading, setLoading] = useState(false);
  const [loadingBank, setLoadingBank] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = loading || loadingBank;

  // The premade bank. The rounds and questions-per-round this screen was
  // opened with are carried back through, so taking the bank is the same shape
  // of night as bringing a file.
  const handleQuestionBank = async () => {
    if (busy) return;
    setLoadingBank(true);
    setLocalError(null);
    await loadQuestionBank(totalRounds, questionsPerRound);
    setLoadingBank(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Held rather than read off the event later: the reader's callbacks run
    // long after this handler has returned.
    const input = event.target;
    const file = input.files?.[0];
    if (file) {
      setLoading(true);
      setLocalError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        importGame(text);
        // A parse that fails leaves this screen up, so the spinner has to come
        // off here — it used to be left on, which disabled the only button out
        // and made a bad header look like a hung importer.
        setLoading(false);
        // The same file twice in a row should still open the importer: without
        // this the input keeps its value and fires no change event.
        input.value = '';
      };
      reader.onerror = () => {
        setLocalError("Failed to read the file.");
        setLoading(false);
        input.value = '';
      };
      reader.readAsText(file);
    }
  };

  const handleSheetImport = async () => {
    if (!sheetUrl) {
      setLocalError("Please enter a Google Sheet URL.");
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      const csvData = await fetchFromGoogleSheet(sheetUrl);
      importGame(csvData);
      setLoading(false);
    } catch (e: any) {
      setLocalError(e.message || "An error occurred while fetching the sheet.");
      setLoading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900">
      <div className="w-full max-w-2xl bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl">
        <button onClick={goBackToConfig} className="absolute top-4 left-4 text-slate-400 hover:text-white">
          <ArrowLeft />
        </button>
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-white">IMPORT TRIVIA</h2>
          <p className="text-slate-400 mt-2">
            Take the ready-made bank, upload a CSV file, or link a public Google Sheet.
          </p>
        </div>

        <Instructions guide="import" className="mb-6" />

        {(localError || error) && (
          <div className="bg-red-900/50 border border-red-500 text-red-300 p-4 rounded-lg mb-6 flex items-center gap-3">
            <AlertTriangle />
            <span>{localError || error}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* The premade bank, first, because it is the option that asks
              nothing of the host. Everything under it needs a file or a sheet
              that somebody had to write. */}
          <div className="bg-slate-900/50 p-6 rounded-xl border border-neon-blue/50 shadow-[0_0_20px_rgba(0,212,255,0.08)]">
            <div className="flex items-center gap-3 mb-2">
              <Library size={24} className="text-neon-blue" />
              <h3 className="text-lg font-bold text-white">
                Use {DEFAULT_QUESTION_BANK.label}
              </h3>
              <span className="text-[10px] font-mono uppercase tracking-widest text-neon-blue border border-neon-blue/50 rounded px-2 py-0.5">
                default
              </span>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              {DEFAULT_QUESTION_BANK.blurb} You still choose which categories to
              play and review every question before the lobby opens.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleQuestionBank} variant="secondary" disabled={busy} className="border-neon-blue/60 text-neon-blue flex items-center gap-2">
                {loadingBank ? <Loader2 size={18} className="animate-spin" /> : <Library size={18} />}
                {loadingBank ? 'LOADING…' : 'LOAD THE QUESTION BANK'}
              </Button>
              <a
                href={DEFAULT_QUESTION_BANK.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-neon-blue flex items-center gap-1.5"
              >
                view the sheet <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* File Upload */}
          <div className="bg-slate-900/50 p-6 rounded-xl border-2 border-dashed border-slate-600 hover:border-neon-blue transition-colors text-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.tsv,.txt"
              className="hidden"
              disabled={busy}
            />
            <Upload size={40} className="mx-auto text-slate-500 mb-4" />
            <h3 className="text-lg font-bold text-white">Upload a File</h3>
            <p className="text-sm text-slate-400 mb-4">CSV, TSV, or TXT files are supported.</p>
            <Button onClick={triggerFileSelect} variant="secondary" disabled={busy}>
              {loading ? <Loader2 className="animate-spin" /> : 'Select File'}
            </Button>
          </div>

          {/* Google Sheet */}
          <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <Link size={24} className="text-slate-400" />
              <h3 className="text-lg font-bold text-white">Link a Google Sheet</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Paste the URL of your Google Sheet. Make sure sharing is set to "Anyone with the link can view".
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-neon-pink outline-none"
                disabled={busy}
              />
              <Button onClick={handleSheetImport} variant="neon" disabled={busy}>
                {loading ? <Loader2 className="animate-spin" /> : 'Import'}
              </Button>
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-500 mt-6 p-4 bg-slate-900/30 rounded-lg space-y-1">
            <p>
              <strong>Required columns:</strong> category, question, correctAnswer.
            </p>
            <p>
              <strong>Optional columns:</strong> type, option1–option5, explanation.
            </p>
            <p>
              Leave the option columns empty and the row is read as a typed
              answer — or as a true/false question when correctAnswer says True
              or False.
            </p>
        </div>
      </div>
    </div>
  );
};

export default ImportScreen;