import React, { useState, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { fetchFromGoogleSheet } from '../services/importService';
import Button from './Button';
import { ArrowLeft, Upload, Link, Loader2, AlertTriangle } from 'lucide-react';

const ImportScreen: React.FC = () => {
  const { importGame, goBackToConfig, error } = useGame();
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      setLocalError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        importGame(text);
        // The context will handle phase change, so loading will be managed there
      };
      reader.onerror = () => {
        setLocalError("Failed to read the file.");
        setLoading(false);
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
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white">IMPORT TRIVIA</h2>
          <p className="text-slate-400 mt-2">Upload a CSV file or link a public Google Sheet.</p>
        </div>

        {(localError || error) && (
          <div className="bg-red-900/50 border border-red-500 text-red-300 p-4 rounded-lg mb-6 flex items-center gap-3">
            <AlertTriangle />
            <span>{localError || error}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* File Upload */}
          <div className="bg-slate-900/50 p-6 rounded-xl border-2 border-dashed border-slate-600 hover:border-neon-blue transition-colors text-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.tsv,.txt"
              className="hidden"
              disabled={loading}
            />
            <Upload size={40} className="mx-auto text-slate-500 mb-4" />
            <h3 className="text-lg font-bold text-white">Upload a File</h3>
            <p className="text-sm text-slate-400 mb-4">CSV, TSV, or TXT files are supported.</p>
            <Button onClick={triggerFileSelect} variant="secondary" disabled={loading}>
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
                disabled={loading}
              />
              <Button onClick={handleSheetImport} variant="neon" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : 'Import'}
              </Button>
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-500 mt-6 p-4 bg-slate-900/30 rounded-lg">
            <strong>Required Columns:</strong> category, question, option1, option2, option3, option4, correctAnswer.
            <br />
            <strong>Optional Column:</strong> explanation.
        </div>
      </div>
    </div>
  );
};

export default ImportScreen;